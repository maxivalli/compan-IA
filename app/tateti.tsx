import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
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
  tableroInicial,
  calcularMovimientoIA,
  verificarGanador,
  lineaGanadora,
  type Celda,
  type Tablero,
} from '../lib/tateti';
import { sintetizarVoz, VOICE_ID_FEMENINA, urlFrasePrecacheada } from '../lib/ai';
import { cargarPerfil } from '../lib/memoria';
import { pausarSRPrincipalParaJuego, reanudarSRPrincipalTrasJuego } from '../lib/rositaSpeechForGames';

// ── Assets ──────────────────────────────────────────────────────────────────────

const CLICK_ASSET = require('../assets/audio/click.mp3');

// ── Paleta ──────────────────────────────────────────────────────────────────────

const M = {
  bg:      '#f8fafc',
  surface: '#ffffff',
  border:  '#cbd5e1',
  x:       '#0284c7',
  o:       '#db2777',
  text:    '#0f172a',
  sub:     '#475569',
  btn:     '#0097b2',
  btnText: '#ffffff',
  overlay: 'rgba(0,0,0,0.7)',
};

// ── Frases de feedback ──────────────────────────────────────────────────────────

function al<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const TATETI_CACHE_VERSION = 'v2';

const FRASES = {
  movUsuario: [
    'Mmm... me estás complicando.',
    'Aah, no me lo esperaba por ahí.',
    'Interesante movimiento.',
    'Uy, qué jugada.',
    'Pensé que ibas a otro lado.',
    'Bien puesto, che.',
    'No me des tanta ventaja.',
    'Hmm, eso me complica...',
    'Ah, muy vivo.',
  ],
  movIA: [
    '¿Y ahora qué hacés?',
    'Ahí va la mía, a ver cómo la resolvés.',
    'Te compliqué un poco, ¿no?',
    'Dale, te toca a vos.',
    'Esto se pone lindo.',
    'Mirá dónde la puse...',
    'Ahora la tenés difícil.',
  ],
  ganaste: [
    '¡Felicitaciones! Me ganaste bien. Hay que reconocerlo.',
    '¡Muy bien jugado! Esta vez no te pude parar.',
    '¡Bravo! Esa última jugada no la vi venir.',
    '¡Vos ganaste! Hubo que pensar bien, ¿no?',
    '¡Me ganaste! ¡Qué crack!',
    '¡Bien! Me dejaste sin jugadas.',
  ],
  perdi: [
    '¡Esta vez gané yo! ¿Le damos de nuevo?',
    '¡Mía! Aunque no te descuides que la próxima puede ser tuya.',
    '¡Gané! Pero igual jugaste muy bien.',
    '¡Me salió! ¿Jugamos otra?',
    '¡La tenía preparada esa! ¿Revancha?',
  ],
  empate: [
    '¡Empatamos! Somos los dos igual de buenos.',
    '¡Ninguno ganó! Eso quiere decir que sos difícil de vencer.',
    '¡Empate! No hay caso, estamos muy parejos.',
    'Empatamos. Para mí que te contuviste un poco.',
    '¡Muy bien! Nadie pudo con el otro.',
  ],
  celda_ocupada: [
    'Esa ya está ocupada, elegí otra.',
    'Ahí ya hay una ficha, probá en otro lado.',
    'Esa casilla no está libre, ¿cuál otra querés?',
  ],
  no_entendido: [
    'No entendí, decime un número del 1 al 9.',
    'No te escuché bien. ¿En qué casilla jugás, del 1 al 9?',
    'Perdoname, ¿cuál número de casilla?',
  ],
  intro: [
    '¡Buenísimo! Vamos con el tateti. El tablero tiene casillas del 1 al 9. ¿Empezás vos?',
    '¡Dale con el tateti! Decime un número del 1 al 9 para tu primera jugada.',
  ],
} as const;

type CategoriaTateti = keyof typeof FRASES;

// ── Componente Celda ────────────────────────────────────────────────────────────

function CeldaView({
  valor, index, enLinea, disabled, onPress, cellSize,
}: {
  valor: Celda; index: number; enLinea: boolean;
  disabled: boolean; onPress: () => void; cellSize: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const prevValor = useRef<Celda>(null);

  useEffect(() => {
    if (valor && valor !== prevValor.current) {
      prevValor.current = valor;
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    }
    if (!valor) { scaleAnim.setValue(0); prevValor.current = null; }
  }, [valor, scaleAnim]);

  const borderStyles: Record<number, object> = {
    0: { borderRightWidth: 4, borderBottomWidth: 4 },
    1: { borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 4 },
    2: { borderLeftWidth: 4, borderBottomWidth: 4 },
    3: { borderRightWidth: 4, borderTopWidth: 4, borderBottomWidth: 4 },
    4: { borderWidth: 4 },
    5: { borderLeftWidth: 4, borderTopWidth: 4, borderBottomWidth: 4 },
    6: { borderRightWidth: 4, borderTopWidth: 4 },
    7: { borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 4 },
    8: { borderLeftWidth: 4, borderTopWidth: 4 },
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !!valor}
      style={[
        {
          width: cellSize,
          height: cellSize,
          borderColor: M.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        borderStyles[index],
        enLinea && { backgroundColor: '#fbbf2422' },
      ]}
    >
      {valor && (
        <Animated.Text
          style={{
            fontSize: cellSize * 0.6,
            fontWeight: '900',
            lineHeight: cellSize * 0.75,
            color: valor === 'X' ? M.x : M.o,
            transform: [{ scale: scaleAnim }],
          }}
        >
          {valor}
        </Animated.Text>
      )}
    </Pressable>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────────

type Fase = 'jugando' | 'ganaste' | 'perdi' | 'empate';

export default function TatetiScreen() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet    = Math.min(width, height) >= 600;
  const ts = isTablet ? 1.5 : 1; // escala general para tablet

  // En horizontal reducimos todo para que el tablero entre sin scrollear
  const tituloSize = Math.round((isLandscape ? 26 : 42) * ts);
  const statusSize = Math.round((isLandscape ? 15 : 22) * ts);
  const hdrVPad    = isLandscape ? 5 : 14;

  // Tamaño de celda reactivo con Math.floor para evitar rotura de grid por sub-píxeles
  const headerEstH = isTablet ? Math.round(60 * ts) : (isLandscape ? 52 : 60);
  const statusEstH = isTablet ? Math.round(40 * ts) : (isLandscape ? 30 : 40);
  const rawCellSize = isLandscape
    ? Math.min(
        (height - insets.top - insets.bottom - headerEstH) / 3,
        ((width - insets.left - insets.right) * 0.62) / 3,
        9999
      )
    : Math.min(
        (height - insets.top - insets.bottom - headerEstH - statusEstH - 80) / 3,
        (width  - insets.left - insets.right - 40) / 3,
        9999
      );
  const cellSize = Math.floor(rawCellSize);

  // Altura real del header (medida con onLayout) para centrar el tablero
  // en la pantalla completa y no solo en el body debajo del header.
  const [headerH, setHeaderH] = useState(0);

  const [tablero, setTablero]       = useState<Tablero>(tableroInicial());
  const [turno, setTurno]           = useState<'X' | 'O'>('X');
  const [fase, setFase]             = useState<Fase>('jugando');
  const [linea, setLinea]           = useState<number[] | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  // Refs de estado para acceso seguro desde handlers de SR (evita stale closures)
  const tableroRef      = useRef<Tablero>(tableroInicial());
  const faseRef         = useRef<Fase>('jugando');
  const iaRef           = useRef(false);
  const hablandoRef     = useRef(false);
  const lastSpokeRef    = useRef(0);
  const overlayAnim     = useRef(new Animated.Value(0)).current;
  const clickPlayer     = useAudioPlayer(CLICK_ASSET);
  const feedbackPlayer  = useAudioPlayer(null);
  const phraseCache     = useRef<Record<string, string>>({});  // texto → uri de archivo

  // ── Pre-cacheo de frases ────────────────────────────────────────────────────
  // Prioridad: archivo ya en disco → descarga desde backend → síntesis local.

  useEffect(() => {
    async function cachear() {
      const perfil  = await cargarPerfil().catch(() => null);
      const voiceId = perfil?.vozId ?? VOICE_ID_FEMENINA;
      const vid8    = voiceId.slice(0, 8);

      for (const [cat, lista] of Object.entries(FRASES) as [CategoriaTateti, readonly string[]][]) {
        for (let i = 0; i < lista.length; i++) {
          const frase    = lista[i];
          const localUri = `${FileSystem.cacheDirectory}tateti_${TATETI_CACHE_VERSION}_${vid8}_${cat}_${i}.mp3`;
          const info     = await FileSystem.getInfoAsync(localUri).catch(() => ({ exists: false }));
          if (!info.exists) {
            const remoteUrl = urlFrasePrecacheada(voiceId, 'tateti', cat, i);
            const dl = await FileSystem.downloadAsync(remoteUrl, localUri).catch(() => null);
            if (!dl || dl.status !== 200) {
              const base64 = await sintetizarVoz(frase, voiceId, 1.0, 'juego').catch(() => null);
              if (base64) await FileSystem.writeAsStringAsync(localUri, base64, { encoding: 'base64' }).catch(() => {});
              else continue;
            }
          }
          phraseCache.current[frase] = localUri;
        }
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
      lastSpokeRef.current = Date.now();
      onDone?.();
      setTimeout(iniciarSR, 800);
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

  function playClick() {
    try { clickPlayer.seekTo(0); clickPlayer.play(); } catch {}
  }

  // ── Sincronizar estado → refs (para SR handlers) ────────────────────────────
  useEffect(() => { tableroRef.current = tablero; }, [tablero]);
  useEffect(() => { faseRef.current    = fase;    }, [fase]);

  // ── SR ────────────────────────────────────────────────────────────────────────

  function parsearCasilla(txt: string): number | null {
    const PALABRAS: Record<string, number> = {
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9,
    };
    for (const [p, n] of Object.entries(PALABRAS)) {
      if (new RegExp(`\\b${p}\\b`).test(txt)) return n;
    }
    const m = txt.match(/\b([1-9])\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  useSpeechRecognitionEvent('result', e => {
    if (hablandoRef.current) return;
    if (Date.now() - lastSpokeRef.current < 1000) return;
    const txt = (e.results?.[0]?.transcript ?? '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(salir|basta|no quiero jugar|volver|terminar|chau|me voy)\b/.test(txt)) {
      detenerSR();
      router.replace('/');
      return;
    }
    // Jugada por voz: solo cuando es el turno del usuario y la IA no está procesando
    if (faseRef.current !== 'jugando' || iaRef.current) return;
    const num = parsearCasilla(txt);
    if (num === null) {
      decir(al(FRASES.no_entendido));
      return;
    }
    const idx = num - 1;
    if (tableroRef.current[idx] !== null) {
      decir(al(FRASES.celda_ocupada));
      return;
    }
    realizarMovimiento(idx);
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
    pausarSRPrincipalParaJuego();
    decir(al(FRASES.intro), () => iniciarSR());
    return () => {
      detenerSR();
      reanudarSRPrincipalTrasJuego();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lógica de juego ──────────────────────────────────────────────────────────

  function realizarMovimiento(idx: number) {
    if (tablero[idx] !== null || fase !== 'jugando') return;

    const nuevo = [...tablero] as Tablero;
    nuevo[idx] = 'X';
    setTablero(nuevo);
    tableroRef.current = nuevo;
    playClick();

    const resultado = verificarGanador(nuevo);

    if (resultado === 'X') {
      setLinea(lineaGanadora(nuevo));
      setFase('ganaste'); faseRef.current = 'ganaste';
      mostrarOverlay();
      decir(al(FRASES.ganaste));
      return;
    }
    if (resultado === 'empate') {
      setFase('empate'); faseRef.current = 'empate';
      mostrarOverlay();
      decir(al(FRASES.empate));
      return;
    }

    setTurno('O');
    iaRef.current = true;
    decir(al(FRASES.movUsuario), () => {
      // Pausa de "pensamiento" antes de que la IA mueva (600–1400 ms)
      const pensar = 600 + Math.random() * 800;
      setTimeout(() => {
        const movIA = calcularMovimientoIA(nuevo);
        if (movIA === -1) { iaRef.current = false; return; }
        const t2 = [...nuevo] as Tablero;
        t2[movIA] = 'O';
        setTablero(t2);
        tableroRef.current = t2;
        playClick();
        const res2 = verificarGanador(t2);
        if (res2 === 'O') {
          setLinea(lineaGanadora(t2));
          setFase('perdi'); faseRef.current = 'perdi';
          mostrarOverlay();
          decir(al(FRASES.perdi));
        } else if (res2 === 'empate') {
          setFase('empate'); faseRef.current = 'empate';
          mostrarOverlay();
          decir(al(FRASES.empate));
        } else {
          setTurno('X');
          setTimeout(() => decir(al(FRASES.movIA)), 200);
        }
        iaRef.current = false;
      }, pensar);
    });
  }

  function mostrarOverlay() {
    Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }

  function reiniciar() {
    const tableroNuevo = tableroInicial();
    overlayAnim.setValue(0);
    setTablero(tableroNuevo);
    setTurno('X');
    setFase('jugando');
    setLinea(null);
    tableroRef.current = tableroNuevo;
    faseRef.current    = 'jugando';
    iaRef.current      = false;
    hablandoRef.current = false;
    setTimeout(iniciarSR, 300);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const lineaSet = new Set(linea ?? []);

  const statusTexto =
    fase === 'ganaste' ? '¡Ganaste! 🎉' :
    fase === 'perdi'   ? 'Ganó Rosita 🤖' :
    fase === 'empate'  ? '¡Empate! 🤝' :
    turno === 'X'      ? 'Tu turno' :
                         'Rosita está pensando...';

  const overlayMsg =
    fase === 'ganaste' ? '¡Felicitaciones!\n¡Ganaste! 🎉' :
    fase === 'perdi'   ? 'Esta vez ganó\nRosita 🤖' :
                         '¡Empate!\nMuy bien jugado 🤝';

  return (
    <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>

      {/* Header */}
      <View style={[s.header, { paddingVertical: hdrVPad }]} onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
        <TouchableOpacity
          onPress={() => { detenerSR(); router.replace('/'); }}
          style={[s.btnSalir, isTablet && { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[s.btnSalirTexto, isTablet && { fontSize: 22 }]}>✕ Salir</Text>
        </TouchableOpacity>
        <View style={[s.srDot, escuchando && s.srDotActive, isTablet && { width: 20, height: 20, borderRadius: 10 }]} />
      </View>

      {/* Cuerpo Principal */}
      {isLandscape ? (
        <View style={s.bodyLandscape}>
          <View style={s.colLeft}>
            <Text style={[s.titulo, { fontSize: tituloSize, marginBottom: 4 }]}>TA-TE-TI</Text>
            <Text style={[s.statusTexto, { fontSize: statusSize }]}>{statusTexto}</Text>
          </View>
          <View style={[s.colRight, isLandscape && headerH > 0 && { paddingBottom: headerH }]}>
            <View style={{ width: cellSize * 3, height: cellSize * 3, flexDirection: 'row', flexWrap: 'wrap' }}>
              {tablero.map((celda, i) => (
                <CeldaView
                  key={i}
                  valor={celda}
                  index={i}
                  cellSize={cellSize}
                  enLinea={lineaSet.has(i)}
                  disabled={fase !== 'jugando' || turno !== 'X' || iaRef.current || hablandoRef.current}
                  onPress={() => realizarMovimiento(i)}
                />
              ))}
            </View>
          </View>
        </View>
      ) : (
        <>
          <Text style={[s.titulo, { fontSize: tituloSize, marginBottom: 10 }]}>TA-TE-TI</Text>
          <Text style={[s.statusTexto, { fontSize: statusSize }]}>{statusTexto}</Text>
          <View style={s.tableroWrap}>
            <View style={{ width: cellSize * 3, height: cellSize * 3, flexDirection: 'row', flexWrap: 'wrap' }}>
              {tablero.map((celda, i) => (
                <CeldaView
                  key={i}
                  valor={celda}
                  index={i}
                  cellSize={cellSize}
                  enLinea={lineaSet.has(i)}
                  disabled={fase !== 'jugando' || turno !== 'X' || iaRef.current || hablandoRef.current}
                  onPress={() => realizarMovimiento(i)}
                />
              ))}
            </View>
          </View>
        </>
      )}

      {/* Overlay resultado */}
      <Animated.View
        style={[s.overlay, { opacity: overlayAnim }]}
        pointerEvents={fase === 'jugando' ? 'none' : 'auto'}
      >
        <View style={[s.overlayCard, isTablet && { padding: 48, gap: 24, borderRadius: 36 }]}>
          <Text style={[s.overlayMsg, isTablet && { fontSize: 42, lineHeight: 56 }]}>{overlayMsg}</Text>
          <TouchableOpacity style={[s.btnOtra, isTablet && { paddingVertical: 24, borderRadius: 20 }]} onPress={reiniciar}>
            <Text style={[s.btnOtraTexto, isTablet && { fontSize: 28 }]}>Jugar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnVolver, isTablet && { paddingVertical: 22, borderRadius: 20 }]} onPress={() => { detenerSR(); router.replace('/'); }}>
            <Text style={[s.btnVolverTexto, isTablet && { fontSize: 26 }]}>Volver a Rosita</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

    </View>
  );
}

// ── Estilos estáticos ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  btnSalir: {
    backgroundColor: M.surface, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  btnSalirTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
  srDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: M.border },
  srDotActive: { backgroundColor: '#4ade80' },

  titulo: {
    color: M.text, fontSize: 42, fontWeight: '900',
    letterSpacing: 6, textAlign: 'center', marginBottom: 10,
  },
  statusTexto: {
    color: M.text, fontSize: 22, fontWeight: '600',
    textAlign: 'center', marginBottom: 4,
  },
  tableroWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bodyLandscape: { flex: 1, flexDirection: 'row' },
  colLeft: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  colRight: { flex: 1.4, justifyContent: 'center', alignItems: 'center' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: M.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: M.surface, borderRadius: 24,
    padding: 32, alignItems: 'center', gap: 16, width: '82%',
  },
  overlayMsg: {
    color: M.text, fontSize: 28, fontWeight: '800',
    textAlign: 'center', lineHeight: 38,
  },
  btnOtra: {
    backgroundColor: M.btn, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 16,
    width: '100%', alignItems: 'center',
  },
  btnOtraTexto: { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver: {
    borderWidth: 2, borderColor: M.border, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 14,
    width: '100%', alignItems: 'center',
  },
  btnVolverTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
});
