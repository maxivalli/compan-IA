import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
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
import { pausarSRPrincipalParaJuego, reanudarSRPrincipalTrasJuego } from '../lib/rositaSpeechForGames';

// ── Niveles ────────────────────────────────────────────────────────────────────
type Nivel = 1 | 2 | 3;
const NIVEL_TILES: Record<Nivel, number> = { 1: 4, 2: 6, 3: 9 };
const NIVEL_COLS:  Record<Nivel, number> = { 1: 2, 2: 3, 3: 3 };
const NIVEL_ROWS:  Record<Nivel, number> = { 1: 2, 2: 2, 3: 3 };

const CLICK_ASSET = require('../assets/audio/click.mp3');

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

const FRASES_CORRECTA  = ['¡Muy bien!', '¡Eso es!', '¡Perfecto!', '¡Ahí estaba!', '¡Excelente memoria!'];
const FRASES_MAL       = ['Esa no era... acá estaba.', 'No, acá estaba.', 'No era esa... mirá acá.'];
const FRASES_GANASTE   = ['¡Increíble! ¡Las encontraste todas! ¡Qué memoria!', '¡Perfecto! ¡Las acertaste todas!'];
const FRASE_FIN_BIEN       = '¡Muy bien! Encontraste bastantes.';
const FRASE_FIN_OK         = '¡Bien intentado! La próxima vez mejor.';
const FRASE_NIVEL_2        = '¡Muy bien! ¡Siguiente nivel, con seis fichas!';
const FRASE_NIVEL_3        = '¡Excelente! ¡Último nivel! ¡Ahora con las nueve fichas!';
const FRASE_NIVEL_FALLIDO  = '¡Casi! Volvamos a intentarlo desde el principio.';

// Mínimo de aciertos para pasar de nivel: ceil(tiles × 0.65) — ej: 3/4, 4/6, 6/9
function minParaAvanzar(numTiles: number) { return Math.ceil(numTiles * 0.65); }

const TODAS_FRASES_ESTATICAS = [
  ...FRASES_CORRECTA, ...FRASES_MAL, ...FRASES_GANASTE,
  FRASE_FIN_BIEN, FRASE_FIN_OK, FRASE_NIVEL_2, FRASE_NIVEL_3, FRASE_NIVEL_FALLIDO,
  '¡Mirá bien dónde están!',
];

// ── Componente ficha ───────────────────────────────────────────────────────────
function MemoriaTile({
  emoji, bgColor, tileSize, faceAnim,
  isRevealed, isHint, isWrong, onPress, disabled,
}: {
  emoji: string; bgColor: string; tileSize: number;
  faceAnim: Animated.Value;
  isRevealed: boolean; isHint: boolean; isWrong: boolean;
  onPress: () => void; disabled: boolean;
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
  const emojiSize    = Math.round(tileSize * 0.48);
  const radius       = Math.round(tileSize * 0.18);
  const borderColor  = isHint ? M.hint : isWrong ? M.wrong : isRevealed ? M.correct : 'transparent';
  const borderWidth  = (isHint || isWrong || isRevealed) ? 4 : 0;

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <Pressable onPress={onPress} disabled={disabled} style={{ width: tileSize, height: tileSize }}>
        <View style={{ width: tileSize, height: tileSize, borderRadius: radius, borderWidth, borderColor, overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', opacity: frontOpacity }]}>
            <Text style={{ fontSize: emojiSize, lineHeight: emojiSize + 4 }}>{emoji}</Text>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: M.cardBack, alignItems: 'center', justifyContent: 'center', opacity: backOpacity }]}>
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
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet    = Math.min(width, height) >= 600;
  const ts          = isTablet ? 1.08 : 1; // 1.5 × 0.85 × 0.85 — tablet achicado 30%

  // ── Estado ────────────────────────────────────────────────────────────────────
  const [setIdx,      setSetIdx]      = useState(0);
  const [nivel,       setNivel]       = useState<Nivel>(1);
  const [game,        setGame]        = useState<MemoriaState>(() => crearJuego(0, NIVEL_TILES[1]));
  const [fase,        setFase]        = useState<Fase>('mostrar');
  const [subFase,     setSubFase]     = useState<SubFase>('normal');
  const [countDown,   setCountDown]   = useState(5);
  const [revealedPos, setRevealedPos] = useState<Set<number>>(new Set());
  const [wrongPos,    setWrongPos]    = useState<number | null>(null);
  const [hintPos,     setHintPos]     = useState<number | null>(null);
  const [escuchando,  setEscuchando]  = useState(false);

  const overlayAnim    = useRef(new Animated.Value(0)).current;
  const hablandoRef    = useRef(false);
  const lastSpokeRef   = useRef(0); // timestamp fin de TTS para bloquear eco
  const gameRef        = useRef(game);
  const nivelRef       = useRef(nivel);
  // faceAnims[i] controla la ficha en posición de grilla i (0-8)
  const faceAnims      = useRef(Array.from({ length: 9 }, () => new Animated.Value(1))).current;
  const clickPlayer    = useAudioPlayer(CLICK_ASSET);
  const feedbackPlayer = useAudioPlayer(null);
  const phraseCache    = useRef<Record<string, string>>({});

  // Mantener refs sincronizados sin stale closures
  gameRef.current  = game;
  nivelRef.current = nivel;

  // ── Tamaños reactivos ─────────────────────────────────────────────────────────
  const numCols    = NIVEL_COLS[nivel];
  const numRows    = NIVEL_ROWS[nivel];
  const numTiles   = NIVEL_TILES[nivel];

  const tituloSize  = Math.round((isLandscape ? 26 : 36) * ts);
  const TILE_GAP    = isTablet ? 12 : 8;
  const hdrH        = Math.round(52 * ts);
  const cardSize    = Math.round((isLandscape ? Math.min(height * 0.55, 200) : Math.min(width * 0.5, 220)) * ts);
  const questCardH  = cardSize;
  const scoreLineH  = Math.round(28 * ts);
  const vertPad     = 24;

  const rawTileSize = isLandscape
    ? Math.min(
        (height - insets.top - insets.bottom - hdrH - TILE_GAP * (numRows - 1) - vertPad) / numRows,
        (width  - insets.left - insets.right) * 0.54 / numCols - TILE_GAP
      )
    : Math.min(
        (height - insets.top - insets.bottom - hdrH - questCardH - scoreLineH - TILE_GAP * (numRows - 1) - vertPad) / numRows,
        (width  - insets.left - insets.right - 32) / numCols - TILE_GAP
      );
  const tileSize = Math.max(Math.floor(rawTileSize), 56);
  const gridW    = tileSize * numCols + TILE_GAP * (numCols - 1);

  // ── Pre-cacheo de frases ──────────────────────────────────────────────────────
  useEffect(() => {
    async function cachear() {
      const perfil  = await cargarPerfil().catch(() => null);
      const voiceId = perfil?.vozId ?? VOICE_ID_FEMENINA;
      const allLabels = getAllLabels();
      const fragsPreg = allLabels.flatMap(l => [
        `¡Ahora encontrá ${l}!`,
        `¿Y ${l}?`,
        `Ahora encontrá ${l}.`,
      ]);
      for (const frase of [...TODAS_FRASES_ESTATICAS, ...fragsPreg]) {
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
      lastSpokeRef.current = Date.now(); // marca fin de TTS
      onDone?.();
      setTimeout(iniciarSR, 800); // 800ms de silencio antes de reactivar SR
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
    if (hablandoRef.current) return;
    if (Date.now() - lastSpokeRef.current < 1000) return; // ignorar eco post-TTS
    const txt = (e.results?.[0]?.transcript ?? '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(salir|basta|no quiero jugar|volver|terminar|chau|me voy)\b/.test(txt)) {
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
    pausarSRPrincipalParaJuego();
    iniciarSR();
    return () => {
      detenerSR();
      reanudarSRPrincipalTrasJuego();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Countdown y flip ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (fase !== 'mostrar') return;
    if (countDown <= 0) {
      const n = NIVEL_TILES[nivelRef.current];
      Animated.stagger(55, faceAnims.slice(0, n).map(a =>
        Animated.timing(a, { toValue: 0, duration: 280, useNativeDriver: true })
      )).start(() => {
        setFase('jugando');
        const target = getCurrentTarget(gameRef.current);
        if (target) decir(`¡Ahora encontrá ${target.design.label}!`);
      });
      return;
    }
    const id = setTimeout(() => setCountDown(c => c - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, countDown]);

  // ── Avanzar nivel ─────────────────────────────────────────────────────────────
  function avanzarNivel(nextNivel: Nivel) {
    const nextNumTiles = NIVEL_TILES[nextNivel];
    const newGame      = crearJuego(setIdx, nextNumTiles);
    setNivel(nextNivel);
    setGame(newGame);
    setFase('mostrar');
    setSubFase('normal');
    setCountDown(5);
    setRevealedPos(new Set());
    setWrongPos(null);
    setHintPos(null);
    faceAnims.forEach(a => a.setValue(1));
  }

  // ── Tap ficha ─────────────────────────────────────────────────────────────────
  function handleTap(gridPos: number) {
    if (fase !== 'jugando' || subFase !== 'normal') return;
    const target = getCurrentTarget(game);
    if (!target) return;

    const isCorrect = target.gridPos === gridPos;
    try { clickPlayer.seekTo(0); clickPlayer.play(); } catch {}

    if (isCorrect) {
      setSubFase('animando');
      Animated.timing(faceAnims[gridPos], { toValue: 1, duration: 240, useNativeDriver: true }).start();
      setRevealedPos(prev => new Set([...prev, gridPos]));

      const newGame = { ...game, currentAskIdx: game.currentAskIdx + 1, score: game.score + 1 };
      setGame(newGame);

      if (newGame.currentAskIdx >= numTiles) {
        // Nivel completo
        if (nivel < 3) {
          const frase = nivel === 1 ? FRASE_NIVEL_2 : FRASE_NIVEL_3;
          decir(frase, () => avanzarNivel((nivel + 1) as Nivel));
        } else {
          decir(al(FRASES_GANASTE), () => {
            setFase('terminado');
            Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
          });
        }
      } else {
        const next = newGame.tiles[newGame.askedOrder[newGame.currentAskIdx]];
        decir(al(FRASES_CORRECTA), () => {
          setSubFase('normal');
          decir(`¿Y ${next.design.label}?`);
        });
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

          if (newGame.currentAskIdx >= numTiles) {
            const paso = newGame.score >= minParaAvanzar(numTiles);
            if (nivel < 3 && paso) {
              const frase = nivel === 1 ? FRASE_NIVEL_2 : FRASE_NIVEL_3;
              decir(frase, () => avanzarNivel((nivel + 1) as Nivel));
            } else {
              const finFrase = paso ? FRASE_FIN_BIEN : (nivel < 3 ? FRASE_NIVEL_FALLIDO : FRASE_FIN_OK);
              decir(finFrase, () => {
                setSubFase('normal');
                setFase('terminado');
                Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
              });
            }
          } else {
            const next = newGame.tiles[newGame.askedOrder[newGame.currentAskIdx]];
            setSubFase('normal');
            decir(`Ahora encontrá ${next.design.label}.`);
          }
        });
      });
    }
  }

  // ── Reiniciar desde el principio ──────────────────────────────────────────────
  function reiniciar() {
    const nextIdx = (setIdx + 1) % NUM_SETS;
    setSetIdx(nextIdx);
    overlayAnim.setValue(0);
    avanzarNivel(1); // siempre arranca del nivel 1
    // avanzarNivel usa setIdx stale — lo sobreescribimos con nextIdx
    const newGame = crearJuego(nextIdx, NIVEL_TILES[1]);
    setGame(newGame);
    setTimeout(iniciarSR, 300);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const target  = getCurrentTarget(game);
  const blocked = subFase !== 'normal' || fase !== 'jugando';

  const statusText =
    fase === 'mostrar'   ? `¡Mirá bien! ${countDown > 0 ? countDown + '...' : ''}` :
    fase === 'terminado' ? '¡Juego terminado!' :
    target               ? `Encontrá ${target.design.label}` : '';

  // Indicador de nivel (3 puntos)
  const levelDots = (
    <View style={sm.levelDots}>
      {([1, 2, 3] as Nivel[]).map(n => (
        <View key={n} style={[sm.dot, n <= nivel ? sm.dotActive : sm.dotInactive, isTablet && { width: 12, height: 12, borderRadius: 6 }]} />
      ))}
    </View>
  );

  // Grilla adaptable
  const grid = (
    <View style={{ width: gridW }}>
      {Array.from({ length: numRows }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap: TILE_GAP, marginBottom: row < numRows - 1 ? TILE_GAP : 0 }}>
          {Array.from({ length: numCols }, (_, col) => {
            const pos  = row * numCols + col;
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
                disabled={blocked || isRev}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  // Tarjeta de pregunta
  const questionCard = (
    <View style={[sm.questionCard, { width: cardSize, height: cardSize }]}>
      {fase === 'mostrar' ? (
        <>
          <Text style={[sm.questionLabel, { fontSize: Math.round(13 * ts) }]}>MEMORIZÁ</Text>
          <Text style={[sm.countdownText, { fontSize: Math.round(cardSize * 0.45) }]}>{countDown > 0 ? countDown : '✓'}</Text>
        </>
      ) : target ? (
        <Text style={[sm.questionEmoji, { fontSize: Math.round(cardSize * 0.62) }]}>{target.design.emoji}</Text>
      ) : (
        <Text style={[sm.questionText, { fontSize: Math.round(20 * ts) }]}>¡Terminaste!</Text>
      )}
    </View>
  );

  const scoreLine = fase === 'jugando' && (
    <Text style={[sm.scoreText, { fontSize: Math.round(32 * ts) }]}>
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

      {/* Header */}
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
            {levelDots}
            <Text style={[sm.statusText, { fontSize: Math.round(26 * ts) }]}>{statusText}</Text>
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
          {levelDots}
          <Text style={[sm.statusText, { fontSize: Math.round(26 * ts) }]}>{statusText}</Text>
          {questionCard}
          {scoreLine}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {grid}
          </View>
        </View>
      )}

      {/* Overlay fin (solo tras nivel 3) */}
      <Animated.View
        style={[sm.overlay, { opacity: overlayAnim }]}
        pointerEvents={fase === 'terminado' ? 'auto' : 'none'}
      >
        <View style={[sm.overlayCard, isTablet && { padding: 48, gap: 24, borderRadius: 36 }]}>
          <Text style={[sm.overlayEmoji, isTablet && { fontSize: 72 }]}>
            {game.score === numTiles ? '🏆' : game.score >= minParaAvanzar(numTiles) ? '⭐' : '💪'}
          </Text>
          <Text style={[sm.overlayMsg, isTablet && { fontSize: 36, lineHeight: 48 }]}>
            {game.score === numTiles
              ? '¡Memoria perfecta!'
              : game.score >= minParaAvanzar(numTiles)
              ? `¡Muy bien!\n${game.score} de ${numTiles}`
              : `¡Bien intentado!\n${game.score} de ${numTiles}`}
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
  srDot:         { width: 14, height: 14, borderRadius: 7, backgroundColor: M.border },
  srDotActive:   { backgroundColor: '#4ade80' },

  bodyLandscape: { flex: 1, flexDirection: 'row' },
  colLeft:  { flex: 1,   justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  colRight: { flex: 1.4, justifyContent: 'center', alignItems: 'center', paddingRight: 12 },

  bodyPortrait: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },

  titulo:     { color: M.text, fontWeight: '900', letterSpacing: 4, textAlign: 'center', marginBottom: 4 },
  levelDots:  { flexDirection: 'row', gap: 8, marginBottom: 28 },
  dot:        { width: 9, height: 9, borderRadius: 5 },
  dotActive:  { backgroundColor: M.btn },
  dotInactive:{ backgroundColor: M.border },

  statusText: { color: M.sub, fontWeight: '700', marginBottom: 6, textAlign: 'center' },

  questionCard: {
    backgroundColor: M.surface, borderRadius: 20, borderWidth: 1, borderColor: M.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  questionLabel:  { color: M.sub, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  questionEmoji:  { lineHeight: undefined },
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
  overlayEmoji:   { fontSize: 56 },
  overlayMsg:     { color: M.text, fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 38 },
  btnOtra:        { backgroundColor: M.btn, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, width: '100%', alignItems: 'center' },
  btnOtraTexto:   { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver:      { borderWidth: 2, borderColor: M.border, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center' },
  btnVolverTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
});
