import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, {
  useProgress,
  useTrackPlayerEvents,
  Event as TPEvent,
} from 'react-native-track-player';

import { fetchCapitulosAudiolibro } from '../lib/ai';
import { Capitulo, getProgreso, saveProgreso, NOMBRE_LIBRO } from '../lib/audiolibro';
import { pausarSRPrincipalParaJuego, reanudarSRPrincipalTrasJuego } from '../lib/rositaSpeechForGames';
import { setupMusicaPlayer } from '../lib/musicaPlayer';

// ── Paleta ────────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0f1117',
  surface: '#1a1d27',
  card:    '#23263a',
  border:  '#2e3247',
  accent:  '#7c6af7',
  accentL: '#a99bf9',
  text:    '#f1f3ff',
  sub:     '#8890b0',
  danger:  '#ef4444',
};

export default function AudiolibroScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const { width }  = useWindowDimensions();
  const params     = useLocalSearchParams<{ tituloId?: string }>();
  const tituloId   = params.tituloId ?? 'el_principito';

  const [capitulos,     setCapitulos]     = useState<Capitulo[]>([]);
  const [cargando,      setCargando]      = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [capActual,     setCapActual]     = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);

  // Refs para evitar stale closures en callbacks RNTP
  const capitRef  = useRef<Capitulo[]>([]);
  const capRef    = useRef(0);
  const repRef    = useRef(false);
  const guardadoRef = useRef(false);

  useEffect(() => { capitRef.current = capitulos; }, [capitulos]);
  useEffect(() => { capRef.current   = capActual;  }, [capActual]);
  useEffect(() => { repRef.current   = reproduciendo; }, [reproduciendo]);

  // Posición en curso para guardar progreso
  const progress = useProgress(500);
  const posRef   = useRef(0);
  useEffect(() => { posRef.current = progress.position; }, [progress.position]);

  // ── Control RNTP ───────────────────────────────────────────────────────────

  const cargarEnRNTP = useCallback(async (url: string, titulo: string, posSegundos: number, autoplay: boolean) => {
    await setupMusicaPlayer();
    await TrackPlayer.reset();
    await TrackPlayer.add({
      url,
      title:  titulo,
      artist: NOMBRE_LIBRO[tituloId] ?? tituloId,
    });
    if (posSegundos > 0) await TrackPlayer.seekTo(posSegundos);
    if (autoplay) await TrackPlayer.play();
  }, [tituloId]);

  // Avanzar al siguiente capítulo cuando termina el audio
  useTrackPlayerEvents([TPEvent.PlaybackQueueEnded], async () => {
    const caps   = capitRef.current;
    const capIdx = capRef.current;
    const sig    = capIdx + 1;
    if (sig < caps.length) {
      setCapActual(sig);
      const cap = caps[sig];
      if (cap) await cargarEnRNTP(cap.url, cap.titulo, 0, true);
    } else {
      setReproduciendo(false);
      if (caps.length > 0) saveProgreso(tituloId, caps[0].idx, 0).catch(() => {});
    }
  });

  // ── Carga inicial ──────────────────────────────────────────────────────────

  async function cargarCapitulosYProgreso() {
    try {
      setCargando(true);
      setError(null);
      const caps     = await fetchCapitulosAudiolibro(tituloId);
      const progreso = await getProgreso(tituloId);
      setCapitulos(caps);
      capitRef.current = caps;

      if (progreso && caps.length > 0) {
        const idx    = caps.findIndex(c => c.idx === progreso.capituloIdx);
        const capIdx = idx >= 0 ? idx : 0;
        setCapActual(capIdx);
        capRef.current = capIdx;
        const cap = caps[capIdx];
        if (cap) await cargarEnRNTP(cap.url, cap.titulo, progreso.posicionSegundos, true);
      } else if (caps.length > 0) {
        setCapActual(0);
        capRef.current = 0;
        const cap = caps[0];
        if (cap) await cargarEnRNTP(cap.url, cap.titulo, 0, true);
      }
    } catch {
      setError('No se pudieron cargar los capítulos. Verificá tu conexión.');
    } finally {
      setCargando(false);
    }
  }

  // ── Controles ──────────────────────────────────────────────────────────────

  async function cargarCapitulo(arrayIdx: number, posSegundos: number, autoplay: boolean) {
    const caps = capitRef.current;
    const cap  = caps[arrayIdx];
    if (!cap) return;
    setCapActual(arrayIdx);
    capRef.current = arrayIdx;
    if (autoplay) setReproduciendo(true);
    else          setReproduciendo(false);
    guardadoRef.current = false;
    await cargarEnRNTP(cap.url, cap.titulo, posSegundos, autoplay);
  }

  async function togglePlay() {
    if (reproduciendo) {
      await TrackPlayer.pause();
      setReproduciendo(false);
      guardarProgreso();
    } else {
      await TrackPlayer.play();
      setReproduciendo(true);
    }
  }

  function anterior() {
    if (capActual > 0) {
      guardarProgreso();
      cargarCapitulo(capActual - 1, 0, reproduciendo).catch(() => {});
    }
  }

  function siguiente() {
    if (capActual < capitulos.length - 1) {
      guardarProgreso();
      cargarCapitulo(capActual + 1, 0, reproduciendo).catch(() => {});
    }
  }

  function guardarProgreso() {
    const caps = capitRef.current;
    const cap  = caps[capRef.current];
    if (!cap) return;
    saveProgreso(tituloId, cap.idx, posRef.current).catch(() => {});
  }

  function cerrar() {
    guardarProgreso();
    TrackPlayer.pause().catch(() => {});
    reanudarSRPrincipalTrasJuego();
    router.back();
  }

  useEffect(() => {
    pausarSRPrincipalParaJuego();
    cargarCapitulosYProgreso();
    return () => {
      guardarProgreso();
      TrackPlayer.pause().catch(() => {});
      reanudarSRPrincipalTrasJuego();
    };
  }, []);

  // Guardar progreso automático cada 15s durante reproducción
  useEffect(() => {
    if (!reproduciendo) return;
    const id = setInterval(() => { guardarProgreso(); }, 15000);
    return () => clearInterval(id);
  }, [reproduciendo, capActual]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const capInfo     = capitulos[capActual];
  const duracion    = progress.duration ?? 0;
  const posicion    = progress.position ?? 0;
  const progresoPct = duracion > 0 ? posicion / duracion : 0;
  const nombreLibro = NOMBRE_LIBRO[tituloId] ?? tituloId;

  function formatTiempo(s: number): string {
    const m  = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }

  const isTablet = width >= 768;
  const fs = (n: number) => n * (isTablet ? 1.3 : 1);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={cerrar} style={styles.btnCerrar} hitSlop={12}>
          <Ionicons name="chevron-down" size={fs(28)} color={C.accentL} />
        </TouchableOpacity>
        <Text style={[styles.headerTitulo, { fontSize: fs(18) }]}>{nombreLibro}</Text>
        <View style={{ width: 80 }} />
      </View>

      {cargando ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={[styles.subTxt, { marginTop: 16, fontSize: fs(16) }]}>Cargando capítulos…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.errorTxt, { fontSize: fs(16) }]}>{error}</Text>
          <TouchableOpacity onPress={cargarCapitulosYProgreso} style={[styles.btnRetry, { marginTop: 20 }]}>
            <Text style={{ color: C.text, fontSize: fs(15) }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Player principal */}
          <View style={[styles.playerCard, isTablet && { marginHorizontal: 40, paddingVertical: 36 }]}>
            <Text style={[styles.capTitulo, { fontSize: fs(22) }]} numberOfLines={2}>
              {capInfo ? `${capActual + 1}. ${capInfo.titulo}` : '—'}
            </Text>
            <Text style={[styles.capSub, { fontSize: fs(14) }]}>
              Capítulo {capActual + 1} de {capitulos.length}
            </Text>

            {/* Barra de progreso */}
            <View style={styles.barraWrap}>
              <View style={styles.barraFondo}>
                <View style={[styles.barraRelleno, { width: `${progresoPct * 100}%` }]} />
              </View>
              <View style={styles.barraTimers}>
                <Text style={styles.timerTxt}>{formatTiempo(posicion)}</Text>
                <Text style={styles.timerTxt}>{duracion > 0 ? formatTiempo(duracion) : '--:--'}</Text>
              </View>
            </View>

            {/* Controles */}
            <View style={styles.controles}>
              <TouchableOpacity
                onPress={anterior}
                disabled={capActual === 0}
                style={[styles.btnControl, capActual === 0 && styles.btnDisabled]}
              >
                <Ionicons name="play-skip-back" size={fs(28)} color={C.text} />
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlay} style={styles.btnPlay}>
                <Ionicons
                  name={reproduciendo ? 'pause' : 'play'}
                  size={fs(34)}
                  color="#fff"
                  style={reproduciendo ? undefined : { marginLeft: 4 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={siguiente}
                disabled={capActual >= capitulos.length - 1}
                style={[styles.btnControl, capActual >= capitulos.length - 1 && styles.btnDisabled]}
              >
                <Ionicons name="play-skip-forward" size={fs(28)} color={C.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Lista de capítulos */}
          <Text style={[styles.listaHeader, { fontSize: fs(14) }]}>CAPÍTULOS</Text>
          <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 20 }}>
            {capitulos.map((cap, idx) => (
              <Pressable
                key={cap.publicId}
                onPress={() => { guardarProgreso(); cargarCapitulo(idx, 0, true).catch(() => {}); }}
                style={({ pressed }) => [
                  styles.capItem,
                  idx === capActual && styles.capItemActivo,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.capNumBadge}>
                  <Text style={[styles.capNum, { fontSize: fs(13) }]}>{idx + 1}</Text>
                </View>
                <Text
                  style={[
                    styles.capItemTxt,
                    idx === capActual && styles.capItemTxtActivo,
                    { fontSize: fs(16) },
                  ]}
                  numberOfLines={2}
                >
                  {cap.titulo}
                </Text>
                {idx === capActual && reproduciendo && (
                  <Text style={[styles.capPlaying, { fontSize: fs(12) }]}>♪</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitulo:  { color: C.text, fontWeight: '700', flex: 1, textAlign: 'center' },
  btnCerrar:     { width: 80, alignItems: 'flex-start' },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  subTxt:        { color: C.sub },
  errorTxt:      { color: C.danger, textAlign: 'center' },
  btnRetry:      { backgroundColor: C.card, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },

  playerCard:    { backgroundColor: C.surface, marginHorizontal: 16, borderRadius: 20, padding: 24, alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  capTitulo:     { color: C.text, fontWeight: '700', textAlign: 'center' },
  capSub:        { color: C.sub },

  barraWrap:     { width: '100%', gap: 4 },
  barraFondo:    { width: '100%', height: 6, backgroundColor: C.card, borderRadius: 3, overflow: 'hidden' },
  barraRelleno:  { height: '100%', backgroundColor: C.accent, borderRadius: 3 },
  barraTimers:   { flexDirection: 'row', justifyContent: 'space-between' },
  timerTxt:      { color: C.sub, fontSize: 12 },

  controles:     { flexDirection: 'row', alignItems: 'center', gap: 32, marginTop: 4 },
  btnControl:    { padding: 8 },
  btnControlTxt: { color: C.text },
  btnDisabled:   { opacity: 0.3 },
  btnPlay:       { backgroundColor: C.accent, width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },

  listaHeader:   { color: C.sub, fontWeight: '700', letterSpacing: 1, marginHorizontal: 20, marginBottom: 6 },
  lista:         { flex: 1, marginHorizontal: 12 },
  capItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  capItemActivo: { backgroundColor: C.card },
  capNumBadge:   { width: 32, height: 32, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  capNum:        { color: C.sub, fontWeight: '600' },
  capItemTxt:    { flex: 1, color: C.sub },
  capItemTxtActivo: { color: C.text, fontWeight: '600' },
  capPlaying:    { color: C.accent, fontWeight: '700' },
});
