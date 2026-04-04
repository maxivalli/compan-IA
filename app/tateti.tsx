import { useCallback, useEffect, useRef, useState } from 'react';
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
import { sintetizarVoz, VOICE_ID_FEMENINA } from '../lib/ai';
import { cargarPerfil } from '../lib/memoria';

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

function al<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const FRASES = {
  movUsuario: [
    'Mmm... me estás complicando.',
    'Aah, no me lo esperaba por ahí.',
    'Interesante movimiento.',
    'Uy, qué jugada.',
    'Pensé que ibas a otro lado.',
    'Bien puesto, che.',
    'No me des tanta ventaja.',
  ],
  movIA: [
    '¿Y ahora qué hacés?',
    'Ahí va la mía, a ver cómo la resolvés.',
    'Te compliqué un poco, ¿no?',
    'Dale, te toca a vos.',
    'Esto se pone lindo.',
  ],
  ganaste: [
    '¡Felicitaciones! Me ganaste bien. Hay que reconocerlo.',
    '¡Muy bien jugado! Esta vez no te pude parar.',
    '¡Bravo! Esa última jugada no la vi venir.',
    '¡Vos ganaste! Hubo que pensar bien, ¿no?',
  ],
  perdi: [
    '¡Esta vez gané yo! ¿Le damos de nuevo?',
    '¡Mía! Aunque no te descuides que la próxima puede ser tuya.',
    '¡Gané! Pero igual jugaste muy bien.',
    '¡Me salió! ¿Jugamos otra?',
  ],
  empate: [
    '¡Empatamos! Somos los dos igual de buenos.',
    '¡Ninguno ganó! Eso quiere decir que sos difícil de vencer.',
    '¡Empate! No hay caso, estamos muy parejos.',
    'Empatamos. Para mí que te contuviste un poco.',
  ],
};

const TODAS_LAS_FRASES = [
  ...FRASES.movUsuario,
  ...FRASES.movIA,
  ...FRASES.ganaste,
  ...FRASES.perdi,
  ...FRASES.empate,
];

// ── Parseo de posición por voz ──────────────────────────────────────────────────

const VOZ_POSICION: Array<{ patron: RegExp; idx: number }> = [
  { patron: /\b(uno|1|arriba.?izquierda|izquierda.?arriba)\b/i, idx: 0 },
  { patron: /\b(dos|2|arriba.?centro|centro.?arriba|arriba(?!\s*(?:derecha|izquierda)))\b/i, idx: 1 },
  { patron: /\b(tres|3|arriba.?derecha|derecha.?arriba)\b/i, idx: 2 },
  { patron: /\b(cuatro|4|izquierda.?centro|centro.?izquierda|izquierda(?!\s*(?:arriba|abajo)))\b/i, idx: 3 },
  { patron: /\b(cinco|5|centro(?!\s*(?:arriba|abajo|izquierda|derecha))|el.?medio)\b/i, idx: 4 },
  { patron: /\b(seis|6|derecha.?centro|centro.?derecha|derecha(?!\s*(?:arriba|abajo)))\b/i, idx: 5 },
  { patron: /\b(siete|7|abajo.?izquierda|izquierda.?abajo)\b/i, idx: 6 },
  { patron: /\b(ocho|8|abajo.?centro|centro.?abajo|abajo(?!\s*(?:derecha|izquierda)))\b/i, idx: 7 },
  { patron: /\b(nueve|9|abajo.?derecha|derecha.?abajo)\b/i, idx: 8 },
];

function parsearPosicionVoz(texto: string): number | null {
  const norm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const { patron, idx } of VOZ_POSICION) {
    if (patron.test(norm)) return idx;
  }
  return null;
}

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

  // En horizontal reducimos todo para que el tablero entre sin scrollear
  const tituloSize = isLandscape ? 26 : 42;
  const statusSize = isLandscape ? 15 : 22;
  const hdrVPad    = isLandscape ? 5  : 14;
  const reservedV  = isLandscape ? 160 : 180;

  // Tamaño de celda reactivo (portrait y landscape)
  const cellSize = isLandscape
    ? Math.min(
        (height - insets.top - insets.bottom - 60) / 3,
        ((width - insets.left - insets.right) * 0.55) / 3,
        150
      )
    : Math.min(
        (height - insets.top - insets.bottom - 180) / 3,
        (width  - insets.left - insets.right - 40) / 3,
        150
      );

  const [tablero, setTablero]       = useState<Tablero>(tableroInicial());
  const [turno, setTurno]           = useState<'X' | 'O'>('X');
  const [fase, setFase]             = useState<Fase>('jugando');
  const [linea, setLinea]           = useState<number[] | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [textoVoz, setTextoVoz]     = useState('');
  const iaRef           = useRef(false);
  const hablandoRef     = useRef(false);
  const overlayAnim     = useRef(new Animated.Value(0)).current;
  const clickPlayer     = useAudioPlayer(CLICK_ASSET);
  const feedbackPlayer  = useAudioPlayer(null);
  const phraseCache     = useRef<Record<string, string>>({});  // texto → uri de archivo

  // ── Pre-cacheo de frases con Fish Audio ────────────────────────────────────

  useEffect(() => {
    async function cachear() {
      const perfil = await cargarPerfil().catch(() => null);
      const voiceId = perfil?.vozId ?? VOICE_ID_FEMENINA;
      for (const frase of TODAS_LAS_FRASES) {
        if (phraseCache.current[frase]) continue;
        const base64 = await sintetizarVoz(frase, voiceId, 1.0, 'neutral').catch(() => null);
        if (!base64) continue;
        const slug = frase.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const uri  = `${FileSystem.cacheDirectory}tateti_${slug}.mp3`;
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
      // expo-audio no tiene onDone, lo simulamos con duración estimada
      const durMs = Math.max(texto.length * 85, 800) + 600;
      setTimeout(() => {
        hablandoRef.current = false;
        onDone?.();
        setFase(f => { if (f === 'jugando') setTimeout(iniciarSR, 400); return f; });
      }, durMs);
    } else {
      // Frase aún no cacheada — ejecutar callback igual para no trabar el juego
      hablandoRef.current = false;
      onDone?.();
    }
  }

  function playClick() {
    try { clickPlayer.seekTo(0); clickPlayer.play(); } catch {}
  }

  // ── SR ────────────────────────────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', e => {
    const txt = e.results?.[0]?.transcript ?? '';
    setTextoVoz(txt);
    if (fase !== 'jugando' || turno !== 'X' || iaRef.current || hablandoRef.current) return;
    const idx = parsearPosicionVoz(txt);
    if (idx !== null) realizarMovimiento(idx);
  });

  useSpeechRecognitionEvent('end', () => {
    setEscuchando(false);
    if (fase === 'jugando' && !hablandoRef.current) setTimeout(iniciarSR, 600);
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

  // ── Lógica de juego ──────────────────────────────────────────────────────────

  const realizarMovimiento = useCallback((idx: number) => {
    setTablero(prev => {
      if (prev[idx] !== null || fase !== 'jugando') return prev;
      const nuevo = [...prev] as Tablero;
      nuevo[idx] = 'X';
      playClick();
      const resultado = verificarGanador(nuevo);

      if (resultado === 'X') {
        setLinea(lineaGanadora(nuevo));
        setFase('ganaste');
        detenerSR();
        mostrarOverlay();
        decir(al(FRASES.ganaste));
        return nuevo;
      }
      if (resultado === 'empate') {
        setFase('empate');
        detenerSR();
        mostrarOverlay();
        decir(al(FRASES.empate));
        return nuevo;
      }

      setTurno('O');
      iaRef.current = true;
      decir(al(FRASES.movUsuario), () => {
        // Pausa de "pensamiento" antes de que la IA mueva (600–1400 ms)
        const pensar = 600 + Math.random() * 800;
        setTimeout(() => {
          setTablero(prev2 => {
            const movIA = calcularMovimientoIA(prev2);
            if (movIA === -1) { iaRef.current = false; return prev2; }
            const t2 = [...prev2] as Tablero;
            t2[movIA] = 'O';
            playClick();
            const res2 = verificarGanador(t2);
            if (res2 === 'O') {
              setLinea(lineaGanadora(t2));
              setFase('perdi');
              detenerSR();
              mostrarOverlay();
              decir(al(FRASES.perdi));
            } else if (res2 === 'empate') {
              setFase('empate');
              detenerSR();
              mostrarOverlay();
              decir(al(FRASES.empate));
            } else {
              setTurno('X');
              setTimeout(() => decir(al(FRASES.movIA)), 200);
            }
            iaRef.current = false;
            return t2;
          });
        }, pensar);
      });

      return nuevo;
    });
  }, [fase]); // eslint-disable-line react-hooks/exhaustive-deps

  function mostrarOverlay() {
    Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }

  function reiniciar() {
    overlayAnim.setValue(0);
    setTablero(tableroInicial());
    setTurno('X');
    setFase('jugando');
    setLinea(null);
    setTextoVoz('');
    iaRef.current = false;
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

      {/* Header — solo Salir y dot de SR */}
      <View style={[s.header, { paddingVertical: hdrVPad }]}>
        <TouchableOpacity
          onPress={() => { detenerSR(); router.replace('/'); }}
          style={s.btnSalir}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.btnSalirTexto}>✕ Salir</Text>
        </TouchableOpacity>
        <View style={[s.srDot, escuchando && s.srDotActive]} />
      </View>

      {/* Cuerpo Principal */}
      {isLandscape ? (
        <View style={s.bodyLandscape}>
          <View style={s.colLeft}>
            <Text style={[s.titulo, { fontSize: tituloSize, marginBottom: 4 }]}>TA-TE-TI</Text>
            <Text style={[s.statusTexto, { fontSize: statusSize }]}>{statusTexto}</Text>
            {textoVoz ? <Text style={s.vozTexto}>🎤 "{textoVoz}"</Text> : null}
          </View>
          <View style={s.colRight}>
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
          {textoVoz ? <Text style={s.vozTexto}>🎤 "{textoVoz}"</Text> : null}
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
        <View style={s.overlayCard}>
          <Text style={s.overlayMsg}>{overlayMsg}</Text>
          <TouchableOpacity style={s.btnOtra} onPress={reiniciar}>
            <Text style={s.btnOtraTexto}>Jugar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnVolver} onPress={() => { detenerSR(); router.replace('/'); }}>
            <Text style={s.btnVolverTexto}>Volver a Rosita</Text>
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
  vozTexto: { color: M.sub, fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginBottom: 4 },

  tableroWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bodyLandscape: { flex: 1, flexDirection: 'row' },
  colLeft: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  colRight: { flex: 1.2, justifyContent: 'center', alignItems: 'center' },

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
