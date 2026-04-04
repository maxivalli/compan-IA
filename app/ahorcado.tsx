import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import {
  estadoInicial,
  procesarLetra,
  estaGanado,
  estaPerdido,
  type EstadoAhorcado,
} from '../lib/ahorcado';
import { sintetizarVoz, VOICE_ID_FEMENINA } from '../lib/ai';
import { cargarPerfil } from '../lib/memoria';

// ── Paleta ──────────────────────────────────────────────────────────────────────

const M = {
  bg:          '#f8fafc',
  surface:     '#ffffff',
  border:      '#cbd5e1',
  text:        '#0f172a',
  sub:         '#475569',
  correcta:    '#22c55e',
  errada:      '#ef4444',
  btn:         '#0097b2',
  btnText:     '#ffffff',
  overlay:     'rgba(0,0,0,0.7)',
  letrabg:     '#f1f5f9',
  letraBorder: '#e2e8f0',
};

const MAX_ERRORES = 6;
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÑ'.split('');
const COLS = 6; // letras por fila — botones más grandes para adultos mayores

// ── Frases de feedback ──────────────────────────────────────────────────────────

function al<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const FRASES = {
  correcta: [
    '¡Bien, está la letra!',
    '¡Encontraste una!',
    '¡Eso es, seguí así!',
    '¡Muy bien! Hay más.',
    '¡Esa sí va!',
  ],
  errada: [
    'Esa no está...',
    'No, esa no va.',
    'Hmm, esa no está.',
    'No, pero seguí intentando.',
    'Esa no.',
  ],
  ganaste: [
    '¡Felicitaciones! ¡Adivinaste la palabra!',
    '¡Muy bien! ¡La encontraste!',
    '¡Bravo! ¡Sabías cuál era!',
    '¡Lo lograste! ¡Muy bien!',
  ],
  perdi: [
    'Se acabaron los intentos. ¡Pero la próxima la adivinas!',
    'No llegamos... La próxima va a ser tuya.',
    'Esta vez no pudo ser. ¿Jugamos otra?',
    'Uy, casi. ¡La próxima!',
  ],
};

const TODAS_LAS_FRASES = [
  ...FRASES.correcta,
  ...FRASES.errada,
  ...FRASES.ganaste,
  ...FRASES.perdi,
];

// ── Vidas (corazones animados) ──────────────────────────────────────────────────

function Vidas({ errores, corazonSize }: { errores: number; corazonSize: number }) {
  const anims = useRef(
    Array.from({ length: MAX_ERRORES }, () => new Animated.Value(1))
  ).current;
  const prevErrores = useRef(errores);

  useEffect(() => {
    if (errores > prevErrores.current) {
      const idx = errores - 1;
      Animated.sequence([
        Animated.timing(anims[idx], { toValue: 1.5, duration: 120, useNativeDriver: true }),
        Animated.timing(anims[idx], { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
    prevErrores.current = errores;
  }, [errores, anims]);

  return (
    <View style={sv.vidasRow}>
      {Array.from({ length: MAX_ERRORES }).map((_, i) => {
        const viva = i >= errores;
        return (
          <Animated.Text
            key={i}
            style={[sv.corazon, { fontSize: corazonSize, transform: [{ scale: anims[i] }], opacity: viva ? 1 : 0.18 }]}
          >
            ❤️
          </Animated.Text>
        );
      })}
    </View>
  );
}

// ── Botón de letra ──────────────────────────────────────────────────────────────

function LetraBtn({
  letra, estado, onPress, btnSize,
}: {
  letra: string;
  estado: 'libre' | 'correcta' | 'errada';
  onPress: () => void;
  btnSize: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function handlePress() {
    if (estado !== 'libre') return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onPress();
  }

  const bg =
    estado === 'correcta' ? M.correcta :
    estado === 'errada'   ? M.errada   :
    M.letrabg;
  const color =
    estado === 'correcta' ? '#ffffff' :
    estado === 'errada'   ? '#ffffff' :
    M.text;
  const borderColor = estado === 'libre' ? M.letraBorder : bg;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handlePress}
        disabled={estado !== 'libre'}
        style={{
          width: btnSize, height: btnSize + 4,
          borderRadius: 10, borderWidth: 2,
          backgroundColor: bg, borderColor,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: btnSize * 0.44, fontWeight: '800', color }}>{letra}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────────

type Fase = 'jugando' | 'ganaste' | 'perdi';

export default function AhorcadoScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet    = Math.min(width, height) >= 600;
  const ts = isTablet ? 1.5 : 1; // escala general para tablet

  // Tamaños adaptativos
  const tituloSize    = Math.round((isLandscape ? 32 : 42)   * ts);
  const hdrVPad       = isLandscape ? 5 : 12;
  const corazonSize   = Math.round((isLandscape ? 28 : 30)   * ts);
  const letraWordSize = Math.round((isLandscape ? 34 : 38)   * ts);
  const pistaSize     = Math.round((isLandscape ? 17 : 18)   * ts);
  const statusSize    = Math.round((isLandscape ? 17 : 16)   * ts);

  // El panel derecho (grilla) recibe flex 1.2 del total 2.2 → ~54.5% del ancho
  const RIGHT_FLEX = 1.2;
  const TOTAL_FLEX = 1 + RIGHT_FLEX;
  const gridAvailW = isLandscape
    ? Math.floor(width * (RIGHT_FLEX / TOTAL_FLEX)) - insets.right - 32
    : (width - insets.left - insets.right - 24);
  const gridAvailH = isLandscape ? (height - insets.top - insets.bottom - 80) : 9999;

  const maxBtnFromW = Math.floor((gridAvailW - (COLS - 1) * 6) / COLS);
  const maxBtnFromH = Math.floor((gridAvailH - 4 * 6) / 5);
  const btnSizeCap  = isTablet ? (isLandscape ? 90 : 88) : (isLandscape ? 60 : 62);
  const btnSize     = Math.min(maxBtnFromW, maxBtnFromH, btnSizeCap);

  // Altura estimada del teclado en portrait para paddingBottom del infoPanel
  const ROWS_PORTRAIT = 5;
  const gridHeightPortrait = ROWS_PORTRAIT * (btnSize + 4) + (ROWS_PORTRAIT - 1) * 5 + 20; // filas×(btnH+gap)+padding

  const [juego, setJuego]           = useState<EstadoAhorcado>(estadoInicial());
  const [fase, setFase]             = useState<Fase>('jugando');
  const [escuchando, setEscuchando] = useState(false);
  const [juegoKey, setJuegoKey]     = useState(0); // cambia en cada reinicio para remount de Vidas
  const overlayAnim  = useRef(new Animated.Value(0)).current;
  const hablandoRef  = useRef(false);
  const feedbackPlayer = useAudioPlayer(null);
  const phraseCache    = useRef<Record<string, string>>({});

  // Animaciones de letras reveladas
  const letraRevealAnims = useRef<Record<string, Animated.Value>>({});
  function getLetraAnim(letra: string) {
    if (!letraRevealAnims.current[letra]) {
      letraRevealAnims.current[letra] = new Animated.Value(0);
    }
    return letraRevealAnims.current[letra];
  }

  // ── Pre-cacheo de frases con Fish Audio ──────────────────────────────────────

  useEffect(() => {
    async function cachear() {
      const perfil  = await cargarPerfil().catch(() => null);
      const voiceId = perfil?.vozId ?? VOICE_ID_FEMENINA;
      for (const frase of TODAS_LAS_FRASES) {
        if (phraseCache.current[frase]) continue;
        const base64 = await sintetizarVoz(frase, voiceId, 1.0, 'neutral').catch(() => null);
        if (!base64) continue;
        const slug = frase.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
        const uri  = `${FileSystem.cacheDirectory}ahorcado_${slug}.mp3`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
        phraseCache.current[frase] = uri;
      }
    }
    cachear();
  }, []);

  // ── TTS feedback ─────────────────────────────────────────────────────────────

  function decir(texto: string, onDone?: () => void) {
    hablandoRef.current = true;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setEscuchando(false);

    const uri = phraseCache.current[texto];
    if (uri) {
      feedbackPlayer.replace({ uri });
      feedbackPlayer.play();
    }
    const durMs = Math.max(texto.length * 85, 800) + 600;

    function terminate() {
      hablandoRef.current = false;
      onDone?.();
      setTimeout(iniciarSR, 400);
    }

    setTimeout(() => {
      if (uri && feedbackPlayer.playing) {
        // Audio más largo que la estimación: esperar a que realmente pare
        const poll = setInterval(() => {
          if (!feedbackPlayer.playing) {
            clearInterval(poll);
            terminate();
          }
        }, 150);
        // Seguridad: máximo 4 segundos extra de espera
        setTimeout(() => { clearInterval(poll); terminate(); }, 4000);
      } else {
        terminate();
      }
    }, durMs);
  }

  // ── SR ────────────────────────────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', e => {
    const txt = (e.results?.[0]?.transcript ?? '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(salir|basta|no quiero jugar|volver|terminar|chau|me voy)\b/.test(txt)) {
      detenerSR();
      router.replace('/');
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setEscuchando(false);
    if (!hablandoRef.current) setTimeout(iniciarSR, 600);
  });

  function iniciarSR() {
    if (hablandoRef.current) return;
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'es-AR', interimResults: false, continuous: false });
      setEscuchando(true);
    } catch {}
  }

  function detenerSR() {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setEscuchando(false);
  }

  useEffect(() => {
    iniciarSR();
    return () => { detenerSR(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lógica ───────────────────────────────────────────────────────────────────

  function jugarLetra(letra: string) {
    const nuevo = procesarLetra(juego, letra);
    if (nuevo === juego) return; // ya usada

    setJuego(nuevo);

    const esCorrecta = juego.palabra.includes(letra.toUpperCase());
    if (esCorrecta) {
      const anim = getLetraAnim(letra.toUpperCase());
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
    }

    if (estaGanado(nuevo)) {
      setFase('ganaste');
      mostrarOverlay();
      decir(al(FRASES.ganaste));
    } else if (estaPerdido(nuevo)) {
      setFase('perdi');
      mostrarOverlay();
      decir(al(FRASES.perdi));
    } else {
      decir(esCorrecta ? al(FRASES.correcta) : al(FRASES.errada));
    }
  }

  function mostrarOverlay() {
    Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }

  function reiniciar() {
    overlayAnim.setValue(0);
    letraRevealAnims.current = {};
    hablandoRef.current = false;
    setJuego(estadoInicial());
    setFase('jugando');
    setJuegoKey(k => k + 1); // fuerza remount de Vidas → anims se resetean a 1
    setTimeout(iniciarSR, 300);
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const errores = juego.letrasErradas.size;

  const statusTexto =
    fase === 'ganaste' ? '¡Adivinaste! 🎉' :
    fase === 'perdi'   ? `Era: ${juego.palabra}` :
    `${MAX_ERRORES - errores} error${MAX_ERRORES - errores !== 1 ? 'es' : ''} restante${MAX_ERRORES - errores !== 1 ? 's' : ''}`;

  const overlayMsg =
    fase === 'ganaste' ? `¡Felicitaciones!\n"${juego.palabra}" 🎉` :
                         `Era "${juego.palabra}"\n¡La próxima! 💪`;

  // Panel de info (title + lives + hint + status + word)
  const infoPanel = (
    <View style={[sv.infoPanel, isLandscape && sv.infoPanelLandscape]}>
      <Text style={[sv.titulo, { fontSize: tituloSize }]}>AHORCADO</Text>

      <Vidas key={juegoKey} errores={errores} corazonSize={corazonSize} />

      <Text style={[sv.pista, { fontSize: pistaSize }]}>💡 {juego.pista}</Text>

      <Text style={[sv.statusTexto, { fontSize: statusSize }]}>{statusTexto}</Text>

      {/* Palabra con máscaras */}
      <View style={sv.palabraRow}>
        {juego.palabra.split('').map((letra, i) => {
          const adivinada = juego.letrasAdivinadas.has(letra);
          const anim = getLetraAnim(letra);
          return (
            <View key={i} style={sv.letraCelda}>
              <Animated.Text
                style={[
                  sv.letraTexto,
                  { fontSize: letraWordSize, lineHeight: letraWordSize + 8 },
                  adivinada
                    ? { color: M.correcta, transform: [{ scale: anim }] }
                    : { color: 'transparent' },
                ]}
              >
                {adivinada ? letra : '_'}
              </Animated.Text>
              <View style={sv.letraLinea} />
            </View>
          );
        })}
      </View>

      {juego.letrasErradas.size > 0 && (
        <Text style={sv.erradas}>
          Letras: {[...juego.letrasErradas].join('  ')}
        </Text>
      )}
    </View>
  );

  // Grilla de letras
  const gridPanel = (
    <ScrollView
      contentContainerStyle={[
        sv.tecladoWrap,
        { padding: 8, paddingBottom: 12 },
        isLandscape && sv.tecladoWrapLandscape,
      ]}
      showsVerticalScrollIndicator={false}
      style={isLandscape ? sv.gridLandscape : sv.gridPortrait}
    >
      <View style={[sv.teclado, { gap: isTablet ? 8 : 5 }]}>
        {LETRAS.map(letra => {
          const estado =
            juego.letrasAdivinadas.has(letra) ? 'correcta' :
            juego.letrasErradas.has(letra)    ? 'errada'   :
            'libre';
          return (
            <LetraBtn
              key={letra}
              letra={letra}
              estado={estado}
              btnSize={btnSize}
              onPress={() => jugarLetra(letra)}
            />
          );
        })}
      </View>
    </ScrollView>
  );

  return (
    <View style={[sv.safe, {
      paddingTop:    insets.top,
      paddingBottom: insets.bottom,
      paddingLeft:   insets.left,
      paddingRight:  insets.right,
    }]}>

      {/* Header */}
      <View style={[sv.header, { paddingVertical: hdrVPad }]}>
        <TouchableOpacity
          onPress={() => { detenerSR(); router.replace('/'); }}
          style={[sv.btnSalir, isTablet && { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[sv.btnSalirTexto, isTablet && { fontSize: 22 }]}>✕ Salir</Text>
        </TouchableOpacity>
        <View style={[sv.srDot, escuchando && sv.srDotActive, isTablet && { width: 20, height: 20, borderRadius: 10 }]} />
      </View>

      {/* Contenido principal — column en portrait, row en landscape */}
      {isLandscape ? (
        <View style={sv.bodyLandscape}>
          {infoPanel}
          {gridPanel}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingBottom: gridHeightPortrait + 50 }}>
            {infoPanel}
          </View>
          <View style={{ position: 'absolute', bottom: 50, left: 0, right: 0 }}>
            {gridPanel}
          </View>
        </View>
      )}

      {/* Overlay resultado */}
      <Animated.View
        style={[sv.overlay, { opacity: overlayAnim }]}
        pointerEvents={fase === 'jugando' ? 'none' : 'auto'}
      >
        <View style={sv.overlayCard}>
          <Text style={sv.overlayMsg}>{overlayMsg}</Text>
          <TouchableOpacity style={sv.btnOtra} onPress={reiniciar}>
            <Text style={sv.btnOtraTexto}>Jugar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sv.btnVolver} onPress={() => { detenerSR(); router.replace('/'); }}>
            <Text style={sv.btnVolverTexto}>Volver a Rosita</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────────

const sv = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20,
  },
  btnSalir: { backgroundColor: M.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  btnSalirTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
  srDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: M.border },
  srDotActive: { backgroundColor: '#4ade80' },

  bodyLandscape: { flex: 1, flexDirection: 'row' },

  infoPanel: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 52 },
  infoPanelLandscape: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, marginTop: 0, alignSelf: 'center', width: '100%' },

  titulo: {
    color: M.text, fontWeight: '900', letterSpacing: 4,
    textAlign: 'center', marginBottom: 8,
  },

  vidasRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  corazon: { lineHeight: 36 },

  pista: { color: M.sub, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 16, marginBottom: 4 },
  statusTexto: { color: M.text, fontWeight: '600', marginBottom: 8 },

  palabraRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 6, paddingHorizontal: 12, marginBottom: 6,
  },
  letraCelda: { alignItems: 'center', minWidth: 28 },
  letraTexto: { fontWeight: '900' },
  letraLinea: { width: '100%', height: 3, backgroundColor: M.border, borderRadius: 2, marginTop: 2 },

  erradas: { color: M.errada, fontSize: 14, fontWeight: '600', letterSpacing: 1 },

  gridPortrait: {},
  gridLandscape: { flex: 1.2 },
  tecladoWrap: { paddingBottom: 8 },
  tecladoWrapLandscape: { flexGrow: 1, justifyContent: 'center' },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: M.overlay,
    alignItems: 'center', justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: M.surface, borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 16, width: '82%',
  },
  overlayMsg: { color: M.text, fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 36 },
  btnOtra: {
    backgroundColor: M.btn, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 16, width: '100%', alignItems: 'center',
  },
  btnOtraTexto: { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver: {
    borderWidth: 2, borderColor: M.border, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  btnVolverTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
});
