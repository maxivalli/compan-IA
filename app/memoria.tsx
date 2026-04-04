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
  crearJuego,
  getCurrentTarget,
  getTileAtGridPos,
  getAllLabels,
  NUM_SETS,
  type MemoriaState,
} from '../lib/memoria_juego';
import { sintetizarVoz, VOICE_ID_FEMENINA } from '../lib/ai';
import { cargarPerfil } from '../lib/memoria';

// ── Paleta ─────────────────────────────────────────────────────────────────────
const M = {
  bg:       '#f8fafc',
  surface:  '#ffffff',
  border:   '#cbd5e1',
  text:     '#0f172a',
  sub:      '#475569',
  btn:      '#0097b2',
  btnText:  '#ffffff',
  cardBack: '#1e3a8a',
  correct:  '#22c55e',
  wrong:    '#ef4444',
  hint:     '#f59e0b',
  overlay:  'rgba(0,0,0,0.72)',
};

// ── Frases ─────────────────────────────────────────────────────────────────────
function al<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const FRASES_CORRECTA = ['¡Muy bien!', '¡Eso es!', '¡Perfecto!', '¡Ahí estaba!', '¡Excelente memoria!'];
const FRASES_MAL      = ['Esa no era... acá estaba.', 'No, acá estaba.', 'No era esa... mirá acá.'];
const FRASES_GANASTE  = ['¡Increíble! ¡Las encontraste todas! ¡Qué memoria!', '¡Perfecto! ¡Las acertaste todas!'];
const FRASE_FIN_BIEN  = '¡Muy bien! Encontraste bastantes.';
const FRASE_FIN_OK    = '¡Bien intentado! La próxima vez mejor.';

const TODAS_FRASES_ESTATICAS = [
  ...FRASES_CORRECTA,
  ...FRASES_MAL,
  ...FRASES_GANASTE,
  FRASE_FIN_BIEN,
  FRASE_FIN_OK,
  '¡Mirá bien dónde están!',
];

// ── Componente ficha ───────────────────────────────────────────────────────────
function MemoriaTile({
  emoji, bgColor, tileSize,
  faceAnim,           // Animated.Value: 1 = cara arriba, 0 = cara abajo
  isRevealed, isHint, isWrong,
  onPress, disabled,
}: {
  emoji:      string;
  bgColor:    string;
  tileSize:   number;
  faceAnim:   Animated.Value;
  isRevealed: boolean;
  isHint:     boolean;
  isWrong:    boolean;
  onPress:    () => void;
  disabled:   boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isWrong || isHint) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.14, duration: 100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
      ]).start();
    }
  }, [isWrong, isHint]);

  const frontOpacity = faceAnim;
  const backOpacity  = faceAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const emojiSize  = Math.round(tileSize * 0.48);
  const radius     = Math.round(tileSize * 0.18);

  const borderColor =
    isHint     ? M.hint    :
    isWrong    ? M.wrong   :
    isRevealed ? M.correct : 'transparent';
  const borderWidth = (isHint || isWrong || isRevealed) ? 4 : 0;

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={{ width: tileSize, height: tileSize }}
      >
        <View style={{
          width: tileSize, height: tileSize,
          borderRadius: radius,
          borderWidth, borderColor,
          overflow: 'hidden',
        }}>
          {/* Cara frontal: emoji + color */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', opacity: frontOpacity },
          ]}>
            <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 4 }}>{emoji}</Text>
          </Animated.View>
          {/* Cara trasera: azul oscuro */}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: M.cardBack, alignItems: 'center', justifyContent: 'center', opacity: backOpacity },
          ]}>
            <Text style={{ fontSize: Math.round(tileSize * 0.28), color: '#93c5fd', opacity: 0.45 }}>✦</Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Pantalla principal ─────────────────────────────────────────────────────────
type Fase    = 'mostrar' | 'jugando' | 'terminado';
type SubFase = 'normal' | 'animando';

export default function MemoriaScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet    = Math.min(width, height) >= 600;
  const ts          = isTablet ? 1.5 : 1;

  // ── Tamaño de fichas ──────────────────────────────────────────────────────────
  const tituloSize   = Math.round((isLandscape ? 26 : 36) * ts);
  const TILE_GAP     = Math.round((isTablet ? 12 : 8));
  const hdrH         = Math.round(52 * ts);
  const questCardH   = Math.round(90 * ts);
  const scoreLineH   = Math.round(28 * ts);
  const vertPad      = 24;

  const rawTileSize = isLandscape
    ? Math.min(
        (height - insets.top - insets.bottom - hdrH - TILE_GAP * 2 - vertPad) / 3,
        (width  - insets.left - insets.right) * 0.54 / 3 - TILE_GAP
      )
    : Math.min(
        (height - insets.top - insets.bottom - hdrH - questCardH - scoreLineH - TILE_GAP * 2 - vertPad) / 3,
        (width  - insets.left - insets.right - 32) / 3 - TILE_GAP
      );
  const tileSize = Math.max(Math.floor(rawTileSize), 56);
  const gridSize = tileSize * 3 + TILE_GAP * 2;

  // ── Estado ────────────────────────────────────────────────────────────────────
  const [setIdx,       setSetIdx]     = useState(0);
  const [game,         setGame]       = useState<MemoriaState>(() => crearJuego(0));
  const [fase,         setFase]       = useState<Fase>('mostrar');
  const [subFase,      setSubFase]    = useState<SubFase>('normal');
  const [countDown,    setCountDown]  = useState(5);
  const [revealedPos,  setRevealedPos] = useState<Set<number>>(new Set());
  const [wrongPos,     setWrongPos]   = useState<number | null>(null);
  const [hintPos,      setHintPos]    = useState<number | null>(null);
  const [escuchando,   setEscuchando] = useState(false);

  const overlayAnim  = useRef(new Animated.Value(0)).current;
  const hablandoRef  = useRef(false);
  // faceAnims[i] controla la ficha en posición de grilla i (0-8)
  // 1 = cara arriba (emoji visible), 0 = cara abajo (reverso visible)
  const faceAnims    = useRef(Array.from({ length: 9 }, () => new Animated.Value(1))).current;
  const feedbackPlayer = useAudioPlayer(null);
  const phraseCache    = useRef<Record<string, string>>({});

  // ── Pre-cacheo de frases ──────────────────────────────────────────────────────
  useEffect(() => {
    async function cachear() {
      const perfil  = await cargarPerfil().catch(() => null);
      const voiceId = perfil?.vozId ?? VOICE_ID_FEMENINA;

      // Frases estáticas + preguntas dinámicas de todos los sets
      const allLabels = getAllLabels();
      const fragsPreg = allLabels.flatMap(l => [
        `¡Ahora encontrá ${l}!`,
        `¿Y ${l}?`,
        `Ahora encontrá ${l}.`,
      ]);
      const todas = [...TODAS_FRASES_ESTATICAS, ...fragsPreg];

      for (const frase of todas) {
        if (phraseCache.current[frase]) continue;
        const base64 = await sintetizarVoz(frase, voiceId, 1.0, 'neutral').catch(() => null);
        if (!base64) continue;
        const slug = frase.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 26);
        const uri  = `${FileSystem.cacheDirectory}mem_${slug}.mp3`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
        phraseCache.current[frase] = uri;
      }
    }
    cachear();
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────────
  function decir(texto: string, onDone?: () => void) {
    hablandoRef.current = true;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setEscuchando(false);

    const uri  = phraseCache.current[texto];
    if (uri) { feedbackPlayer.replace({ uri }); feedbackPlayer.play(); }
    const durMs = Math.max(texto.length * 85, 800) + 600;

    function terminate() {
      hablandoRef.current = false;
      onDone?.();
      setTimeout(iniciarSR, 400);
    }
    setTimeout(() => {
      if (uri && feedbackPlayer.playing) {
        const poll = setInterval(() => {
          if (!feedbackPlayer.playing) { clearInterval(poll); terminate(); }
        }, 150);
        setTimeout(() => { clearInterval(poll); terminate(); }, 4000);
      } else {
        terminate();
      }
    }, durMs);
  }

  // ── SR ────────────────────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', e => {
    if (hablandoRef.current) return; // ignorar mientras Rosita habla
    const txt = (e.results?.[0]?.transcript ?? '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(salir|basta|volver|terminar|chau|me voy)\b/.test(txt)) {
      detenerSR(); router.replace('/');
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
    return () => detenerSR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Countdown y flip ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (fase !== 'mostrar') return;
    if (countDown <= 0) {
      // Voltear todas las fichas
      Animated.stagger(55, faceAnims.map(a =>
        Animated.timing(a, { toValue: 0, duration: 280, useNativeDriver: true })
      )).start(() => {
        setFase('jugando');
        const target = getCurrentTarget(game);
        if (target) decir(`¡Ahora encontrá ${target.design.label}!`);
      });
      return;
    }
    const id = setTimeout(() => setCountDown(c => c - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, countDown]);

  // ── Tap ficha ─────────────────────────────────────────────────────────────────
  function handleTap(gridPos: number) {
    if (fase !== 'jugando' || subFase !== 'normal' || hablandoRef.current) return;
    const target = getCurrentTarget(game);
    if (!target) return;

    const isCorrect = target.gridPos === gridPos;

    if (isCorrect) {
      setSubFase('animando');
      Animated.timing(faceAnims[gridPos], { toValue: 1, duration: 240, useNativeDriver: true }).start();
      setRevealedPos(prev => new Set([...prev, gridPos]));

      const newGame  = { ...game, currentAskIdx: game.currentAskIdx + 1, score: game.score + 1 };
      setGame(newGame);

      if (newGame.currentAskIdx >= 9) {
        decir(al(FRASES_GANASTE), () => {
          setFase('terminado');
          Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        });
      } else {
        const next = newGame.tiles[newGame.askedOrder[newGame.currentAskIdx]];
        decir(al(FRASES_CORRECTA), () => {
          setSubFase('normal');
          decir(`¿Y ${next.design.label}?`);
        });
      }
    } else {
      setSubFase('animando');
      setWrongPos(gridPos);
      setHintPos(target.gridPos);
      Animated.timing(faceAnims[target.gridPos], { toValue: 1, duration: 200, useNativeDriver: true }).start();

      const newGame = { ...game, currentAskIdx: game.currentAskIdx + 1 };
      setGame(newGame);

      decir(al(FRASES_MAL), () => {
        Animated.timing(faceAnims[target.gridPos], { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setWrongPos(null);
          setHintPos(null);

          if (newGame.currentAskIdx >= 9) {
            const finFrase = newGame.score >= 6 ? FRASE_FIN_BIEN : FRASE_FIN_OK;
            decir(finFrase, () => {
              setSubFase('normal');
              setFase('terminado');
              Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
            });
          } else {
            const next = newGame.tiles[newGame.askedOrder[newGame.currentAskIdx]];
            setSubFase('normal');
            decir(`Ahora encontrá ${next.design.label}.`);
          }
        });
      });
    }
  }

  // ── Reiniciar ─────────────────────────────────────────────────────────────────
  function reiniciar() {
    const nextIdx = (setIdx + 1) % NUM_SETS;
    const newGame = crearJuego(nextIdx);
    setSetIdx(nextIdx);
    setGame(newGame);
    setFase('mostrar');
    setSubFase('normal');
    setCountDown(5);
    setRevealedPos(new Set());
    setWrongPos(null);
    setHintPos(null);
    overlayAnim.setValue(0);
    faceAnims.forEach(a => a.setValue(1));
    setTimeout(iniciarSR, 300);
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  const target  = getCurrentTarget(game);
  const blocked = subFase !== 'normal' || fase !== 'jugando';

  const statusText =
    fase === 'mostrar'   ? `¡Mirá bien! ${countDown > 0 ? countDown + '...' : ''}` :
    fase === 'terminado' ? '¡Juego terminado!' :
    target               ? `Encontrá ${target.design.label}` :
    '';

  // Grilla 3×3
  const grid = (
    <View style={{ width: gridSize }}>
      {[0, 1, 2].map(row => (
        <View key={row} style={{ flexDirection: 'row', gap: TILE_GAP, marginBottom: row < 2 ? TILE_GAP : 0 }}>
          {[0, 1, 2].map(col => {
            const pos  = row * 3 + col;
            const tile = getTileAtGridPos(game, pos);
            const isRev = revealedPos.has(pos);
            if (!tile) return <View key={col} style={{ width: tileSize, height: tileSize }} />;
            return (
              <MemoriaTile
                key={col}
                emoji={tile.design.emoji}
                bgColor={tile.design.bgColor}
                tileSize={tileSize}
                faceAnim={faceAnims[pos]}
                isRevealed={isRev}
                isHint={hintPos === pos}
                isWrong={wrongPos === pos}
                onPress={() => handleTap(pos)}
                disabled={blocked || isRev || fase === 'mostrar'}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  // Tarjeta de pregunta
  const questionCard = (
    <View style={[sm.questionCard, isTablet && { paddingVertical: 16 }]}>
      {fase === 'mostrar' ? (
        <>
          <Text style={[sm.questionLabel, { fontSize: Math.round(12 * ts) }]}>MEMORIZÁ</Text>
          <Text style={[sm.questionText,  { fontSize: Math.round(20 * ts) }]}>¡Mirá bien dónde están!</Text>
          <Text style={[sm.countdownText, { fontSize: Math.round(40 * ts) }]}>{countDown > 0 ? countDown : '✓'}</Text>
        </>
      ) : target ? (
        <>
          <Text style={[sm.questionLabel, { fontSize: Math.round(12 * ts) }]}>ENCONTRÁ</Text>
          <Text style={[sm.questionEmoji, { fontSize: Math.round(40 * ts) }]}>{target.design.emoji}</Text>
          <Text style={[sm.questionText,  { fontSize: Math.round(18 * ts) }]}>{target.design.label}</Text>
        </>
      ) : (
        <Text style={[sm.questionText, { fontSize: Math.round(18 * ts) }]}>¡Terminaste!</Text>
      )}
    </View>
  );

  const scoreLine = fase === 'jugando' && (
    <Text style={[sm.scoreText, { fontSize: Math.round(14 * ts) }]}>
      ✓ {game.score}  ✗ {game.currentAskIdx - game.score}
    </Text>
  );

  return (
    <View style={[sm.safe, {
      paddingTop:    insets.top,
      paddingBottom: insets.bottom,
      paddingLeft:   insets.left,
      paddingRight:  insets.right,
    }]}>

      {/* Header — igual que tateti/ahorcado: solo Salir + dot */}
      <View style={[sm.header, { height: hdrH }]}>
        <TouchableOpacity
          onPress={() => { detenerSR(); router.replace('/'); }}
          style={[sm.btnSalir, isTablet && { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[sm.btnSalirTexto, isTablet && { fontSize: 22 }]}>✕ Salir</Text>
        </TouchableOpacity>
        <View style={[sm.srDot, escuchando && sm.srDotActive, isTablet && { width: 20, height: 20, borderRadius: 10 }]} />
      </View>

      {/* Cuerpo */}
      {isLandscape ? (
        <View style={sm.bodyLandscape}>
          <View style={sm.colLeft}>
            <Text style={[sm.titulo, { fontSize: tituloSize }]}>MEMORIA</Text>
            <Text style={[sm.statusText, { fontSize: Math.round(15 * ts) }]}>{statusText}</Text>
            {questionCard}
            {scoreLine}
          </View>
          <View style={sm.colRight}>
            {grid}
          </View>
        </View>
      ) : (
        <View style={sm.bodyPortrait}>
          <Text style={[sm.titulo, { fontSize: tituloSize }]}>MEMORIA</Text>
          <Text style={[sm.statusText, { fontSize: Math.round(15 * ts) }]}>{statusText}</Text>
          {questionCard}
          {scoreLine}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {grid}
          </View>
        </View>
      )}

      {/* Overlay fin */}
      <Animated.View
        style={[sm.overlay, { opacity: overlayAnim }]}
        pointerEvents={fase === 'terminado' ? 'auto' : 'none'}
      >
        <View style={[sm.overlayCard, isTablet && { padding: 48, gap: 24, borderRadius: 36 }]}>
          <Text style={[sm.overlayEmoji, isTablet && { fontSize: 72 }]}>
            {game.score === 9 ? '🏆' : game.score >= 6 ? '⭐' : '💪'}
          </Text>
          <Text style={[sm.overlayMsg, isTablet && { fontSize: 36, lineHeight: 48 }]}>
            {game.score === 9
              ? '¡Memoria perfecta!'
              : game.score >= 6
              ? `¡Muy bien!\n${game.score} de 9`
              : `¡Bien intentado!\n${game.score} de 9`}
          </Text>
          <TouchableOpacity
            style={[sm.btnOtra, isTablet && { paddingVertical: 24, borderRadius: 20 }]}
            onPress={reiniciar}
          >
            <Text style={[sm.btnOtraTexto, isTablet && { fontSize: 28 }]}>Jugar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sm.btnVolver, isTablet && { paddingVertical: 22, borderRadius: 20 }]}
            onPress={() => { detenerSR(); router.replace('/'); }}
          >
            <Text style={[sm.btnVolverTexto, isTablet && { fontSize: 26 }]}>Volver a Rosita</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

    </View>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const sm = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20,
  },
  btnSalir:      { backgroundColor: M.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  btnSalirTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
  titulo:        { color: M.text, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginBottom: 4 },
  srDot:         { width: 14, height: 14, borderRadius: 7, backgroundColor: M.border },
  srDotActive:   { backgroundColor: '#4ade80' },

  bodyLandscape: { flex: 1, flexDirection: 'row' },
  colLeft:  { flex: 1,   justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  colRight: { flex: 1.4, justifyContent: 'center', alignItems: 'center', paddingRight: 12 },

  bodyPortrait: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },

  statusText: { color: M.sub, fontWeight: '700', marginBottom: 6, textAlign: 'center' },

  questionCard: {
    backgroundColor: M.surface, borderRadius: 16, borderWidth: 1, borderColor: M.border,
    paddingHorizontal: 20, paddingVertical: 10,
    alignItems: 'center', width: '100%', marginBottom: 6,
  },
  questionLabel:  { color: M.sub, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  questionEmoji:  { lineHeight: 52, marginBottom: 2 },
  questionText:   { color: M.text, fontWeight: '800', textAlign: 'center' },
  countdownText:  { color: M.btn, fontWeight: '900', marginTop: 2 },

  scoreText: { color: M.sub, fontWeight: '600', marginBottom: 6 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: M.overlay,
    alignItems: 'center', justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: M.surface, borderRadius: 24,
    padding: 32, alignItems: 'center', gap: 16, width: '82%',
  },
  overlayEmoji:    { fontSize: 56 },
  overlayMsg:      { color: M.text, fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 38 },
  btnOtra:         { backgroundColor: M.btn, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, width: '100%', alignItems: 'center' },
  btnOtraTexto:    { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver:       { borderWidth: 2, borderColor: M.border, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center' },
  btnVolverTexto:  { color: M.sub, fontSize: 16, fontWeight: '600' },
});
