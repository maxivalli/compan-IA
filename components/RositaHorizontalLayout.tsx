/**
 * RositaHorizontalLayout — modo "dispositivo dedicado".
 *
 * Diseñado para tablet/celular apoyado en horizontal como acompañante fijo.
 * No tiene botones visibles — la entrada viene del control BLE beacon.
 * Como fallback táctil:
 *   - Tap en la cara  → toggleTalkOrStopMusic
 *   - Long press (2s) → triggerSOS
 *   - Ícono 🔕 esquina → toggleDoNotDisturb
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, PanResponder, Pressable, StyleSheet,
  Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RosaOjos, { BG, EYE_H, EYE_W, GAP, Expresion, ModoNoche } from './RosaOjos';
import ExpresionOverlay from './ExpresionOverlay';
import { AnimacionMusica, CieloNoche, WaveformDetectando, ZZZ } from './FondoAnimado';
import { Globos } from './EfectosExpresion';
import CameraAutoCaptura from './CameraAutoCaptura';
import { OvaloRosita } from './PanelCuero';
import { EstadoRosita } from '../hooks/useBrain';
import { AccionesRosita } from '../hooks/useAccionesRosita';
import { CODIGOS_ADVERSOS } from '../lib/clima';
import { nombreRadioOGenero } from '../lib/musica';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RositaHorizontalProps {
  modoReloj: boolean;
  onToggleModoReloj: () => void;
  hasListas: boolean;
  listasCount: number;
  onOpenListas: () => void;
  // Estado de Rosita
  estado:           EstadoRosita;
  expresion:        Expresion;
  modoNoche:        ModoNoche;
  musicaActiva:     boolean;
  silbando:         boolean;
  noMolestar:       boolean;
  linternaActiva:   boolean;
  detectandoSonido: boolean;

  // Fondo / clima (ciudad y temperatura no se muestran en horizontal)
  bgActual:       string;
  degradadoCielo: readonly [string, string, string] | readonly [string, string, string, string];
  esFondoNoche:   boolean;
  cieloTapado:    boolean;
  amaneciendo:    boolean;
  climaObj:       { temperatura: number; descripcion: string; codigoActual: number } | null;
  ultimaRadio?:   string | null;

  // Cámara
  mostrarCamara:    boolean;
  camaraFacing:     'front' | 'back';
  camaraSilenciosa: boolean;
  onFotoCapturada:  (base64: string) => void;
  onFotoCancelada:  () => void;

  // Foto Telegram
  fotoTelegram:        { url: string; descripcion: string } | null;
  onClearFotoTelegram: () => void;

  // Animaciones compartidas
  flashAnim: Animated.Value;

  // Cumpleaños
  esCumpleaños: boolean;
  onTriggerCumpleaños: () => void;

  // Acciones canónicas (touch y BLE llaman a lo mismo)
  acciones: AccionesRosita;

  // Callbacks de expresión
  onOjoPicado: () => void;
  onCaricia:   () => void;
  onRelampago: () => void;

  // Linterna
  apagarLinterna: () => void;

  // Detección de presencia
  deteccionPresenciaActiva: boolean;
  modoWatchingPresencia:    boolean;
  presenciaVista:           boolean;
}

function RelojHorizontalFullscreen({
  climaObj,
  musicaActiva = false,
  ultimaRadio = null,
}: {
  climaObj?: { temperatura: number; descripcion: string; codigoActual: number } | null;
  musicaActiva?: boolean;
  ultimaRadio?: string | null;
}) {
  const [tiempo, setTiempo] = useState(() => {
    const now = new Date();
    return {
      hh: String(now.getHours()).padStart(2, '0'),
      mm: String(now.getMinutes()).padStart(2, '0'),
    };
  });
  const latido   = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [infoIdx, setInfoIdx] = useState(0);
  const climaObjRef = useRef(climaObj);
  useEffect(() => { climaObjRef.current = climaObj; }, [climaObj]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setTiempo({
        hh: String(now.getHours()).padStart(2, '0'),
        mm: String(now.getMinutes()).padStart(2, '0'),
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(latido, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    const hasAlert = !!(climaObj?.codigoActual && CODIGOS_ADVERSOS.has(climaObj.codigoActual)) || (climaObj?.temperatura !== undefined && (climaObj.temperatura >= 35 || climaObj.temperatura <= 3));
    const screens = 1 + (musicaActiva ? 1 : 0) + (climaObj?.temperatura != null ? 1 : 0) + (hasAlert ? 1 : 0);
    setInfoIdx(prev => Math.min(prev, Math.max(0, screens - 1)));
  }, [climaObj, musicaActiva]);

  // Alternar hora ↔ radio ↔ temperatura ↔ alerta cada 5s con fade + slide + scale
  useEffect(() => {
    const id = setInterval(() => {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,    duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20,  duration: 400, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 400, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        setInfoIdx(prev => {
          const co = climaObjRef.current;
          const hasAlert = !!(co?.codigoActual && CODIGOS_ADVERSOS.has(co.codigoActual)) || (co?.temperatura !== undefined && (co.temperatura >= 35 || co.temperatura <= 3));
          const screens = 1 + (musicaActiva ? 1 : 0) + (co?.temperatura != null ? 1 : 0) + (hasAlert ? 1 : 0);
          const max = Math.max(0, screens - 1);
          slideAnim.setValue(20);
          return prev >= max ? 0 : prev + 1;
        });
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [musicaActiva]);

  const fontFamily = 'Poppins_700Bold';

  const dotHasAlert = !!(climaObj?.codigoActual && CODIGOS_ADVERSOS.has(climaObj.codigoActual)) || (climaObj?.temperatura !== undefined && (climaObj.temperatura >= 35 || climaObj.temperatura <= 3));
  const dotCount = 1 + (musicaActiva ? 1 : 0) + (climaObj?.temperatura != null ? 1 : 0) + (dotHasAlert ? 1 : 0);
  const alertaTexto = climaObj?.temperatura !== undefined && climaObj.temperatura >= 35 ? 'Calor extremo'
    : climaObj?.temperatura !== undefined && climaObj.temperatura <= 3 ? 'Frío extremo'
    : (climaObj?.descripcion || 'Alerta meteorológica');
  const radioScreenIdx = musicaActiva ? 1 : -1;
  const tempScreenIdx = 1 + (musicaActiva ? 1 : 0);
  const alertScreenIdx = tempScreenIdx + (climaObj?.temperatura != null ? 1 : 0);

  // Patrón igual al display vertical: montar/desmontar cada slide con {infoIdx === N && ...}
  // Esto evita que el Animated.View colapse a 0 al cambiar entre slides de distinta altura.
  // Excepción: la slide de hora usa opacity:0 (sin desmontarla) para preservar el nodo nativo
  // del Animated.Text del latido (useNativeDriver pierde el nodo si el componente se desmonta).
  return (
    <>
      <View style={styles.relojCarruselWrapper}>
        <Animated.View style={[styles.relojCarruselInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>
          {/* Pantalla 0: Hora — siempre montada, oculta con opacity sin cambiar position */}
          <View style={{ alignItems: 'center', opacity: infoIdx === 0 ? 1 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.relojHora, { fontFamily }]}>{tiempo.hh}</Text>
              <Animated.Text style={[styles.relojHora, { fontFamily, opacity: latido, marginHorizontal: 10 }]}>:</Animated.Text>
              <Text style={[styles.relojHora, { fontFamily }]}>{tiempo.mm}</Text>
            </View>
          </View>

          {/* Pantalla 1: Radio — montar/desmontar */}
          {musicaActiva && infoIdx === radioScreenIdx && (
            <View style={{ alignItems: 'center', ...StyleSheet.absoluteFillObject, justifyContent: 'center' }}>
              <AnimacionMusica />
              <Text style={[styles.relojSubtext, { fontSize: 28, marginTop: 14, maxWidth: 540 }]} numberOfLines={1}>
                {nombreRadioOGenero(ultimaRadio ?? 'FM Cristal 98.9')}
              </Text>
            </View>
          )}

          {/* Pantalla 2: Temperatura — montar/desmontar */}
          {climaObj?.temperatura != null && infoIdx === tempScreenIdx && (
            <View style={{ alignItems: 'center', ...StyleSheet.absoluteFillObject, justifyContent: 'center' }}>
              <Text style={[styles.relojHora, { fontFamily }]}>{`${Math.round(climaObj.temperatura)}°`}</Text>
              <Text style={[styles.relojSubtext, { fontSize: 28, marginTop: 10, maxWidth: 520 }]} numberOfLines={1}>
                {climaObj.descripcion}
              </Text>
            </View>
          )}

          {/* Pantalla 3: Alerta — montar/desmontar */}
          {dotHasAlert && infoIdx === alertScreenIdx && (
            <View style={{ alignItems: 'center', ...StyleSheet.absoluteFillObject, justifyContent: 'center' }}>
              <Text style={{ fontSize: 42, fontFamily, color: '#fbbf24', marginBottom: 10 }}>ALERTA</Text>
              <Text style={[styles.relojSubtext, { fontSize: 22, maxWidth: 500, color: '#ffffff' }]} numberOfLines={2}>
                {alertaTexto}
              </Text>
            </View>
          )}
        </Animated.View>

        {dotCount > 1 && (
          <View style={styles.relojDots}>
            {Array.from({ length: dotCount }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.relojDot,
                  i === infoIdx ? styles.relojDotActive : null,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </>
  );
}


// ── Componente ────────────────────────────────────────────────────────────────

export default function RositaHorizontalLayout(props: RositaHorizontalProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { bottom: safeBottom, top: safeTop, left: safeLeft, right: safeRight } = useSafeAreaInsets();
  const [faceBottomH, setFaceBottomH] = useState(0);

  const FACE_W = EYE_W * 2 + 32;
  const FACE_H = EYE_H + 120;
  const shortEdge = Math.min(screenW, screenH);
  const esTabletHorizontal = screenW > screenH && shortEdge >= 700;
  const eyeDominantScale = (screenH * 0.96) / EYE_H;
  const faceFitScale = (screenH * 1.16) / FACE_H;
  const widthFitScale = (screenW * 0.88) / FACE_W;
  const faceScale = Math.min(eyeDominantScale, faceFitScale, widthFitScale) * 0.8;
  const paddingTopCara = Math.max(0, Math.round(screenH * 0.005));
  const faceTranslateY = Math.max(0, Math.round(screenH * 0.20));
  const mouthOffsetY = 0;
  const eyeGapExtra = Math.round((32 + 10 * faceScale) * 0.85 - 32);
  const zipperOffsetY = esTabletHorizontal
    ? -Math.round(18 * faceScale)
    : -Math.round(33 * faceScale);
  const zipperScale = 0.92;

  // Gesto de caricia horizontal sobre la cara
  const panCaricia = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 40) props.onCaricia(); },
  })).current;

  // Color del indicator de estado (ring alrededor de la cara)
  const estadoColor = props.musicaActiva       ? '#E8392A'
    : props.estado === 'escuchando'            ? '#E85D24'
    : props.estado === 'pensando'              ? '#3b82f6'
    : props.estado === 'hablando'              ? '#22c55e'
    : 'transparent';

  const esBotonesNoche = props.modoNoche !== 'despierta';
  const esperandoActivo = !props.noMolestar && !props.musicaActiva && props.estado === 'esperando';
  const esperaPulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (esperandoActivo) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(esperaPulso, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(esperaPulso, { toValue: 0, duration: 900, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      esperaPulso.stopAnimation();
      esperaPulso.setValue(0);
    }
    return () => { anim?.stop(); };
  }, [esperandoActivo, esperaPulso]);

  // Gradiente del badge de estado — igual al badge vertical
  const estadoGradient: [string, string] = props.noMolestar          ? ['#4b5563', '#1f2937']
    : props.musicaActiva                                              ? ['#fdba74', '#ea580c']
    : props.estado === 'pensando'                                     ? ['#93c5fd', '#1d4ed8']
    : props.estado === 'hablando'                                     ? ['#86efac', '#15803d']
    : props.estado === 'escuchando'                                   ? ['#fca5a5', '#dc2626']
    : esBotonesNoche                                                  ? ['#2d3748', '#0f1117']
    : ['#4b5563', '#1f2937'];
  const estadoBadgeLabel = props.noMolestar  ? 'Silencio'
    : props.musicaActiva                     ? 'Parar'
    : props.estado === 'pensando'            ? 'Pensando...'
    : props.estado === 'hablando'            ? 'Hablando'
    : props.estado === 'escuchando'          ? 'Escuchando'
    : 'Esperando';

  return (
    <>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          if (props.linternaActiva) { props.apagarLinterna(); return; }
          props.acciones.toggleTalkOrStopMusic();
        }}
      >
        <LinearGradient
          colors={props.degradadoCielo}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          locations={props.degradadoCielo.length === 4 ? [0, 0.25, 0.55, 1] : [0, 0.4, 1]}
          style={{ flex: 1 }}
        >
          {props.esFondoNoche && !props.cieloTapado && <CieloNoche bgColor={props.bgActual} />}
          {props.esCumpleaños && <Globos />}

          <CameraAutoCaptura
            visible={props.mostrarCamara}
            facing={props.camaraFacing}
            silencioso={props.camaraSilenciosa}
            onCaptura={props.onFotoCapturada}
            onCancelar={props.onFotoCancelada}
          />

          {/* Foto recibida por Telegram */}
          {props.fotoTelegram && (
            <Modal transparent animationType="fade" statusBarTranslucent>
              <TouchableOpacity
                activeOpacity={1}
                onPress={props.onClearFotoTelegram}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Animated.Image
                  source={{ uri: props.fotoTelegram.url }}
                  style={{ width: '78%', aspectRatio: 1, resizeMode: 'cover', borderRadius: 8 }}
                />
              </TouchableOpacity>
            </Modal>
          )}

          {/* ── Cara principal — horizontal muestra ojos + boca dentro de cuadro ── */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {props.modoReloj ? (
              <View style={styles.relojFullscreen}>
                <RelojHorizontalFullscreen
                  climaObj={props.climaObj}
                  musicaActiva={props.musicaActiva}
                  ultimaRadio={props.ultimaRadio}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onLongPress={props.acciones.triggerSOS}
                  delayLongPress={2000}
                />

                <View
                  style={styles.faceTouchArea}
                  pointerEvents="box-none"
                  {...panCaricia.panHandlers}
                >
                  <View style={{
                    width: screenW,
                    height: screenH,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    paddingTop: paddingTopCara,
                  }}>
                    <ExpresionOverlay
                      capa="fondo"
                      expresion={props.expresion}
                      musicaActiva={props.musicaActiva}
                      temperatura={props.climaObj?.temperatura}
                      condicion={props.climaObj?.descripcion}
                      modoNoche={props.modoNoche}
                      esFondoNoche={props.esFondoNoche}
                      modoHorizontal
                    />
                    {faceBottomH > 0 && (
                      <OvaloRosita
                        faceScale={faceScale * 0.88}
                        screenW={screenW}
                        faceBottom={faceBottomH}
                      />
                    )}
                    <View
                      style={{ transform: [{ translateY: faceTranslateY }, { scale: 1.04 }], zIndex: 5 }}
                      onLayout={(e) => {
                        const { height } = e.nativeEvent.layout;
                        setFaceBottomH(paddingTopCara + faceTranslateY + height);
                      }}
                    >
                      <RosaOjos
                        estado={props.estado}
                        expresion={props.expresion}
                        modoNoche={props.modoNoche}
                        bgColor={props.bgActual}
                        silbando={props.silbando}
                      noMolestar={props.noMolestar}
                      onOjoPicado={props.onOjoPicado}
                      scale={faceScale}
                      amaneciendo={props.amaneciendo}
                      mouthOffsetY={mouthOffsetY}
                      eyeGapExtra={eyeGapExtra}
                      zipperOffsetY={zipperOffsetY}
                      zipperScale={zipperScale}
                      eyeOffsetY={esTabletHorizontal ? 70 : 0}
                    />
                    </View>
                    <ExpresionOverlay
                      capa="frente"
                      expresion={props.expresion}
                      musicaActiva={props.musicaActiva}
                      temperatura={props.climaObj?.temperatura}
                      condicion={props.climaObj?.descripcion}
                      modoNoche={props.modoNoche}
                      esFondoNoche={props.esFondoNoche}
                      silbando={props.silbando}
                      onRelampago={props.onRelampago}
                      esCumpleaños={props.esCumpleaños}
                      modoHorizontal
                      browOffsetY={esTabletHorizontal ? 10 : 70}
                      browOffsetX={esTabletHorizontal ? -17 : 19}
                      browScale={esTabletHorizontal ? 1.32 : 0.65}
                      browGap={esTabletHorizontal ? 25 : -15}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* ZZZ modo durmiendo — oculto en modo reloj para no tapar la hora */}
          {props.modoNoche === 'durmiendo' && !props.modoReloj && <ZZZ modoHorizontal />}

          {/* ── HUD mínimo ─────────────────────────────────────────────────── */}

          {/* Ciudad y temperatura: no se muestran en ningún layout */}

          {/* No molestar — esquina superior izquierda */}
          <TouchableOpacity
            onPress={props.acciones.toggleDoNotDisturb}
            style={[styles.iconBtn, { top: safeTop + 16, left: safeLeft + 16 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <LinearGradient
              colors={props.noMolestar ? ['#ea580c', '#9a3412'] : ['#1e293b', '#0f172a']}
              style={[StyleSheet.absoluteFill, { borderRadius: 27, opacity: 0.7 }]}
            />
            <View style={[StyleSheet.absoluteFill, { borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            <Ionicons
              name={props.noMolestar ? 'mic-off' : 'mic-outline'}
              size={22}
              color={props.noMolestar ? '#fff' : '#ffffffcc'}
            />
          </TouchableOpacity>

          {props.hasListas && (
            <TouchableOpacity
              onPress={props.onOpenListas}
              style={[styles.iconBtn, { top: safeTop + 16, right: safeRight + 16 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <LinearGradient
                colors={['#1e293b', '#0f172a']}
                style={[StyleSheet.absoluteFill, { borderRadius: 27, opacity: 0.7 }]}
              />
              <View style={[StyleSheet.absoluteFill, { borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
              <Ionicons name="document-text-outline" size={22} color="#ffffffcc" />
              <View style={styles.listasBadge}>
                <Text style={styles.listasBadgeText}>{props.listasCount > 9 ? '9+' : props.listasCount}</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={props.onToggleModoReloj}
            style={[styles.iconBtn, { left: safeLeft + 16, bottom: safeBottom + 16 }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <LinearGradient
              colors={props.modoReloj ? ['#3b82f6', '#1d4ed8'] : ['#1e293b', '#0f172a']}
              style={[StyleSheet.absoluteFill, { borderRadius: 27, opacity: 0.7 }]}
            />
            <View style={[StyleSheet.absoluteFill, { borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            <Ionicons
              name={props.modoReloj ? 'happy-outline' : 'time-outline'}
              size={22}
              color="#ffffffcc"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onLongPress={props.onTriggerCumpleaños}
            delayLongPress={1200}
            style={{ position: 'absolute', bottom: safeBottom + 54, right: safeRight + 74, width: 72, height: 72 }}
          />


          {props.deteccionPresenciaActiva && (
            <View style={[styles.presenciaBadge, {
              bottom: safeBottom + 20,
              right: safeRight + 132,
            }]}>
              <Ionicons
                name={props.presenciaVista ? 'person' : props.modoWatchingPresencia ? 'eye' : 'eye-outline'}
                size={15}
                color={props.presenciaVista ? '#22c55e' : props.modoWatchingPresencia ? '#ef4444' : 'rgba(255,255,255,0.65)'}
              />
            </View>
          )}

          {/* Badge de estado — esquina inferior derecha, mismo estilo que vertical */}
          <TouchableOpacity
            onPress={props.acciones.toggleTalkOrStopMusic}
            activeOpacity={0.85}
            style={[styles.estadoBadge, {
              bottom: safeBottom + 14,
              right: safeRight + 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.32)',
              overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.18, shadowRadius: 6,
            }]}
          >
            <LinearGradient
              colors={estadoGradient}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
            {props.detectandoSonido && props.estado === 'esperando'
              ? (
                <View style={styles.waveformCompactWrap}>
                  <WaveformDetectando barWidth={3} barHeight={14} gap={2} />
                </View>
              )
              : <>
                  {esperandoActivo ? (
                    <Animated.View
                      style={[
                        styles.estadoDotEsperando,
                        {
                          opacity: esperaPulso.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                          transform: [{ scale: esperaPulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
                        },
                      ]}
                    />
                  ) : (
                    <View style={[styles.estadoDot, { backgroundColor: estadoColor }]} />
                  )}
                  <Text style={styles.estadoTexto}>{estadoBadgeLabel}</Text>
                </>
            }
          </TouchableOpacity>

          {/* Flash overlay (relámpago / linterna) */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: props.flashAnim }]}
          />

        </LinearGradient>
      </Pressable>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  relojFullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  faceTouchArea: {
    ...StyleSheet.absoluteFillObject,
  },
  relojHora: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 172,
    letterSpacing: 2,
  },
  relojSubtext: {
    fontSize: 24,
    color: '#ffffff',
    textTransform: 'capitalize',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 8,
  },
  relojDots: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'center',
  },
  relojDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  relojDotActive: {
    width: 18,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  // Carrusel del modo reloj
  relojCarruselWrapper: {
    // minHeight = relojHora fontSize (172) × ~1.28 line-height ≈ 220px
    // Garantiza que el contenedor no colapse cuando el slide activo es
    // más pequeño (radio, alerta) y los dots no salten de posición.
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    // paddingBottom deja espacio para los dots absolutos (6px dot + algo de margen)
    paddingBottom: 26,
  },
  relojCarruselInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  relojSlideOculto: {
    // Quitar del flujo sin desmontar (native driver mantiene el nodo del Animated.Text
    // del latido del dos puntos, que se perdería si se desmontara el componente).
    opacity: 0,
    position: 'absolute',
  },
  estadoRing: {
    position:    'absolute',
    borderWidth: 3,
  },
  iconBtn: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  listasBadge: {
    position: 'absolute',
    top: 6,
    right: 5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E85D24',
    borderWidth: 1,
    borderColor: '#ffffff44',
  },
  listasBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  presenciaBadge: {
    position: 'absolute',
    zIndex: 20,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformWrap: {
    position:  'absolute',
    alignSelf: 'center',
  },
  waveformCompactWrap: {
    width: 52,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estadoBadge: {
    position:          'absolute',
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               6,
    paddingHorizontal: 12,
    paddingVertical:   7,
    minWidth:          108,
    height:            40,
    borderRadius:      20,
  },
  estadoDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  estadoDotEsperando: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#facc15',
    shadowColor: '#facc15',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  estadoTexto: {
    color:      '#ffffffcc',
    fontSize:   12,
    fontWeight: '500',
  },
});
