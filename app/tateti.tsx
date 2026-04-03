import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import {
  tableroInicial,
  calcularMovimientoIA,
  verificarGanador,
  lineaGanadora,
  type Celda,
  type Tablero,
} from '../lib/tateti';

// ── Constantes ──────────────────────────────────────────────────────────────────

const { width, height } = Dimensions.get('window');
const CELL_SIZE = Math.min((Math.min(width, height) - 80) / 3, 160);

const M = {
  bg:       '#0f172a',
  surface:  '#1e293b',
  border:   '#334155',
  x:        '#38bdf8',
  o:        '#f472b6',
  win:      '#fbbf24',
  text:     '#f1f5f9',
  sub:      '#94a3b8',
  btn:      '#0097b2',
  btnText:  '#ffffff',
  overlay:  'rgba(0,0,0,0.85)',
};

// ── Parseo de posición por voz ──────────────────────────────────────────────────

const VOZ_POSICION: Array<{ patron: RegExp; idx: number }> = [
  { patron: /\b(uno|1|arriba.?izquierda|izquierda.?arriba|esquina.?superior.?izquierda)\b/i, idx: 0 },
  { patron: /\b(dos|2|arriba.?centro|centro.?arriba|arriba.?medio|medio.?arriba|arriba(?!\s*(?:derecha|izquierda)))\b/i, idx: 1 },
  { patron: /\b(tres|3|arriba.?derecha|derecha.?arriba|esquina.?superior.?derecha)\b/i, idx: 2 },
  { patron: /\b(cuatro|4|izquierda.?centro|centro.?izquierda|izquierda.?medio|medio.?izquierda|izquierda(?!\s*(?:arriba|abajo)))\b/i, idx: 3 },
  { patron: /\b(cinco|5|centro(?!\s*(?:arriba|abajo|izquierda|derecha))|medio(?!\s*(?:arriba|abajo|izquierda|derecha))|el.?medio)\b/i, idx: 4 },
  { patron: /\b(seis|6|derecha.?centro|centro.?derecha|derecha.?medio|medio.?derecha|derecha(?!\s*(?:arriba|abajo)))\b/i, idx: 5 },
  { patron: /\b(siete|7|abajo.?izquierda|izquierda.?abajo|esquina.?inferior.?izquierda)\b/i, idx: 6 },
  { patron: /\b(ocho|8|abajo.?centro|centro.?abajo|abajo.?medio|abajo(?!\s*(?:derecha|izquierda)))\b/i, idx: 7 },
  { patron: /\b(nueve|9|abajo.?derecha|derecha.?abajo|esquina.?inferior.?derecha)\b/i, idx: 8 },
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
  valor, index, enLinea, disabled, onPress,
}: {
  valor: Celda; index: number; enLinea: boolean; disabled: boolean; onPress: () => void;
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
      style={[s.celda, borderStyles[index], enLinea && s.celdaGanadora]}
    >
      {valor && (
        <Animated.Text
          style={[
            s.simbolo,
            { color: valor === 'X' ? M.x : M.o, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {valor}
        </Animated.Text>
      )}
      {!valor && !disabled && (
        <View style={s.labelNumero}>
          <Text style={s.numLabel}>{index + 1}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────────

type Fase = 'jugando' | 'ganaste' | 'perdi' | 'empate';

export default function TatetiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tablero, setTablero]       = useState<Tablero>(tableroInicial());
  const [turno, setTurno]           = useState<'X' | 'O'>('X');
  const [fase, setFase]             = useState<Fase>('jugando');
  const [linea, setLinea]           = useState<number[] | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [textoVoz, setTextoVoz]     = useState('');
  const iaRef = useRef(false);        // IA en proceso
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // ── SR ──────────────────────────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', e => {
    const txt = e.results?.[0]?.transcript ?? '';
    setTextoVoz(txt);
    if (fase !== 'jugando' || turno !== 'X' || iaRef.current) return;
    const idx = parsearPosicionVoz(txt);
    if (idx !== null) realizarMovimiento(idx);
  });

  useSpeechRecognitionEvent('end', () => {
    setEscuchando(false);
    // Reiniciar SR automáticamente mientras el juego sigue
    if (fase === 'jugando') {
      setTimeout(() => iniciarSR(), 600);
    }
  });

  function iniciarSR() {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'es-AR',
        interimResults: false,
        continuous: false,
      });
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

  // ── Lógica de juego ─────────────────────────────────────────────────────────

  const realizarMovimiento = useCallback((idx: number) => {
    setTablero(prev => {
      if (prev[idx] !== null || fase !== 'jugando') return prev;
      const nuevo = [...prev] as Tablero;
      nuevo[idx] = 'X';
      const resultado = verificarGanador(nuevo);
      if (resultado === 'X') {
        setLinea(lineaGanadora(nuevo));
        setFase('ganaste');
        detenerSR();
        mostrarOverlay();
        return nuevo;
      }
      if (resultado === 'empate') {
        setFase('empate');
        detenerSR();
        mostrarOverlay();
        return nuevo;
      }
      setTurno('O');
      // IA mueve después de un breve delay
      iaRef.current = true;
      setTimeout(() => {
        setTablero(prev2 => {
          const movIA = calcularMovimientoIA(prev2);
          if (movIA === -1) return prev2;
          const t2 = [...prev2] as Tablero;
          t2[movIA] = 'O';
          const res2 = verificarGanador(t2);
          if (res2 === 'O') {
            setLinea(lineaGanadora(t2));
            setFase('perdi');
            detenerSR();
            mostrarOverlay();
          } else if (res2 === 'empate') {
            setFase('empate');
            detenerSR();
            mostrarOverlay();
          } else {
            setTurno('X');
          }
          iaRef.current = false;
          return t2;
        });
      }, 700);
      return nuevo;
    });
  }, [fase]);

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
    setTimeout(() => iniciarSR(), 300);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const lineaSet = new Set(linea ?? []);

  const statusTexto =
    fase === 'ganaste' ? '¡Ganaste! 🎉' :
    fase === 'perdi'   ? 'Ganó Rosita 🤖' :
    fase === 'empate'  ? '¡Empate! 🤝' :
    turno === 'X'      ? 'Tu turno — tocá o decí el número' :
                         'Rosita está pensando...';

  const overlayMsg =
    fase === 'ganaste' ? '¡Felicitaciones!\n¡Ganaste! 🎉' :
    fase === 'perdi'   ? 'Esta vez ganó\nRosita 🤖' :
                         '¡Empate!\nMuy bien jugado 🤝';

  return (
    <SafeAreaView style={[s.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => { detenerSR(); router.replace('/'); }} style={s.btnSalir}>
          <Text style={s.btnSalirTexto}>✕ Salir</Text>
        </TouchableOpacity>
        <Text style={s.titulo}>TA-TE-TI</Text>
        <View style={[s.srDot, escuchando && s.srDotActive]} />
      </View>

      {/* Status */}
      <View style={s.statusWrap}>
        <Text style={s.statusTexto}>{statusTexto}</Text>
        {textoVoz ? <Text style={s.vozTexto}>🎤 "{textoVoz}"</Text> : null}
      </View>

      {/* Tablero */}
      <View style={s.tablero}>
        {tablero.map((celda, i) => (
          <CeldaView
            key={i}
            valor={celda}
            index={i}
            enLinea={lineaSet.has(i)}
            disabled={fase !== 'jugando' || turno !== 'X' || iaRef.current}
            onPress={() => realizarMovimiento(i)}
          />
        ))}
      </View>

      {/* Leyenda voz */}
      <View style={s.vozGuia}>
        <Text style={s.vozGuiaTitulo}>Por voz: decí el número de la celda</Text>
        <View style={s.vozGrid}>
          {['1\narriba izq', '2\narriba', '3\narriba der', '4\nizquierda', '5\ncentro', '6\nderecha', '7\nabajo izq', '8\nabajo', '9\nabajo der'].map((lbl, i) => (
            <Text key={i} style={s.vozGridItem}>{lbl}</Text>
          ))}
        </View>
      </View>

      {/* Overlay resultado */}
      <Animated.View style={[s.overlay, { opacity: overlayAnim }]} pointerEvents={fase === 'jugando' ? 'none' : 'auto'}>
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
    </SafeAreaView>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.bg, alignItems: 'center' },

  header: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12,
  },
  btnSalir: { backgroundColor: M.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnSalirTexto: { color: M.sub, fontSize: 15, fontWeight: '600' },
  titulo: { color: M.text, fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  srDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: M.border },
  srDotActive: { backgroundColor: '#4ade80' },

  statusWrap: { marginVertical: 10, alignItems: 'center', minHeight: 52 },
  statusTexto: { color: M.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  vozTexto: { color: M.sub, fontSize: 13, marginTop: 4, fontStyle: 'italic' },

  tablero: {
    width: CELL_SIZE * 3,
    height: CELL_SIZE * 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  celda: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderColor: M.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celdaGanadora: { backgroundColor: '#fbbf2422' },
  simbolo: { fontSize: CELL_SIZE * 0.6, fontWeight: '900', lineHeight: CELL_SIZE * 0.75 },
  labelNumero: { position: 'absolute', bottom: 6, right: 8 },
  numLabel: { color: M.border, fontSize: 14, fontWeight: '600' },

  vozGuia: { marginTop: 20, alignItems: 'center', paddingHorizontal: 16 },
  vozGuiaTitulo: { color: M.sub, fontSize: 12, marginBottom: 8, letterSpacing: 0.4 },
  vozGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  vozGridItem: { color: M.sub, fontSize: 11, textAlign: 'center', width: 72, lineHeight: 16 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: M.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: M.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    width: '80%',
  },
  overlayMsg: { color: M.text, fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 38 },
  btnOtra: { backgroundColor: M.btn, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, width: '100%', alignItems: 'center' },
  btnOtraTexto: { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver: { borderWidth: 2, borderColor: M.border, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center' },
  btnVolverTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
});
