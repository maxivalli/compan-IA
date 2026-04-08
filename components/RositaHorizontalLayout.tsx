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
import { useFonts, Poppins_700Bold } from '@expo-google-fonts/poppins';
import RosaOjos, { BG, EYE_H, EYE_W, GAP, Expresion, ModoNoche, CAT_FACE_TOP_EXTRA, CAT_SVG_H } from './RosaOjos';
import ExpresionOverlay from './ExpresionOverlay';
import { CieloNoche, WaveformDetectando, ZZZ } from './FondoAnimado';
import { Globos } from './EfectosExpresion';
import CameraAutoCaptura from './CameraAutoCaptura';
import { EstadoRosita } from '../hooks/useBrain';
import { AccionesRosita } from '../hooks/useAccionesRosita';
import { CODIGOS_ADVERSOS } from '../lib/clima';

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
  cabezaGato?: boolean;
}

function RelojHorizontalFullscreen({ climaObj }: { climaObj?: { temperatura: number; descripcion: string; codigoActual: number } | null }) {
  const [fontsLoaded] = useFonts({ Poppins_700Bold });
  const [tiempo, setTiempo] = useState(() => {
    const now = new Date();
    return {
      hh: String(now.getHours()).padStart(2, '0'),
      mm: String(now.getMinutes()).padStart(2, '0'),
    };
  });
  const latido  = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [infoIdx, setInfoIdx] = useState<0|1|2>(0);
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

  // Alternar hora ↔ temperatura ↔ alerta cada 5s
  useEffect(() => {
    if (climaObj?.temperatura == null) return;
    const id = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setInfoIdx(prev => {
           const co = climaObjRef.current;
           const hasAlert = !!(co?.codigoActual && CODIGOS_ADVERSOS.has(co.codigoActual)) || (co?.temperatura !== undefined && (co.temperatura >= 35 || co.temperatura <= 3));
           const max = hasAlert ? 2 : 1;
           return prev >= max ? 0 : (prev + 1) as 0|1|2;
        });
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(id);
  }, [climaObj?.temperatura]);

  const fontFamily = fontsLoaded ? 'Poppins_700Bold' : undefined;

  // Nunca desmontar la vista de hora: el native driver pierde el nodo y el latido muere.
  // Controlamos visibilidad con opacity + position absolute en la vista oculta.
  return (
    <Animated.View style={[styles.relojWrap, { opacity: fadeAnim }]}>
      <View style={[infoIdx !== 0 && { opacity: 0, position: 'absolute' }, { flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={[styles.relojHora, { fontFamily }]}>{tiempo.hh}</Text>
        <Animated.Text style={[styles.relojHora, { fontFamily, opacity: latido, marginHorizontal: 10 }]}>:</Animated.Text>
        <Text style={[styles.relojHora, { fontFamily }]}>{tiempo.mm}</Text>
      </View>
      {climaObj?.temperatura != null && (
        <View style={[infoIdx !== 1 && { opacity: 0, position: 'absolute' }, { flexDirection: 'row', alignItems: 'center' }]}>
          <Text style={[styles.relojHora, { fontFamily }]}>{`${Math.round(climaObj.temperatura)}°`}</Text>
          {(!!(climaObj?.codigoActual && CODIGOS_ADVERSOS.has(climaObj.codigoActual)) || (climaObj?.temperatura !== undefined && (climaObj.temperatura >= 35 || climaObj.temperatura <= 3))) ? (
            <Ionicons name="warning" size={96} color="#FFD700" style={{ transform: [{ translateY: 6 }], marginLeft: 24 }} />
          ) : null}
        </View>
      )}
      <View style={[infoIdx !== 2 && { opacity: 0, position: 'absolute' }, { flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={[styles.relojHora, { fontFamily, fontSize: 72, textAlign: 'center' }]} adjustsFontSizeToFit numberOfLines={1}>
          {climaObj?.temperatura !== undefined && climaObj.temperatura >= 35 ? 'CALOR EXTREMO' : climaObj?.temperatura !== undefined && climaObj.temperatura <= 3 ? 'FRÍO EXTREMO' : (climaObj?.descripcion?.toUpperCase() || 'ALERTA METEOROLÓGICA')}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function RositaHorizontalLayout(props: RositaHorizontalProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { bottom: safeBottom, top: safeTop, left: safeLeft, right: safeRight } = useSafeAreaInsets();

  const FACE_W = EYE_W * 2 + 32;
  const FACE_H = EYE_H + 120;
  const shortEdge = Math.min(screenW, screenH);
  const esTabletHorizontal = screenW > screenH && shortEdge >= 700;
  const eyeDominantScale = (screenH * 0.96) / EYE_H;
  const faceFitScale = (screenH * 1.16) / FACE_H;
  const widthFitScale = (screenW * 0.88) / FACE_W;
  // Con cabezaGato, el componente mide CAT_SVG_H*scale de alto — limitamos para que quepa en pantalla
  const catFitScale = props.cabezaGato !== false ? (screenH * 0.94) / CAT_SVG_H : Infinity;
  const faceScale = Math.min(
    Math.min(eyeDominantScale, faceFitScale, widthFitScale) * 0.8,
    catFitScale,
  );
  const paddingTopCara = Math.max(0, Math.round(screenH * 0.005));
  const catOffset = props.cabezaGato !== false ? Math.round(CAT_FACE_TOP_EXTRA * faceScale) : 0;
  const faceTranslateY = Math.max(0, Math.round(screenH * 0.20) - catOffset);
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
                <RelojHorizontalFullscreen climaObj={props.climaObj} />
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
                    <View style={{ transform: [{ translateY: faceTranslateY }, { scale: 1.04 }] }}>
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
                      cabezaGato={props.cabezaGato !== false}
                      eyeOffsetY={esTabletHorizontal ? 70 : 0}
                      noseOffsetY={-10}
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
                      browOffsetY={props.cabezaGato !== false ? (esTabletHorizontal ? 75 : 115) : (esTabletHorizontal ? 10 : 70)}
                      browOffsetX={props.cabezaGato !== false ? (esTabletHorizontal ? 10 : 22) : (esTabletHorizontal ? -17 : 19)}
                      browScale={props.cabezaGato !== false ? (esTabletHorizontal ? 0.85 : 0.6) : (esTabletHorizontal ? 1.32 : 0.65)}
                      browGap={props.cabezaGato !== false ? (esTabletHorizontal ? 0 : -20) : (esTabletHorizontal ? 25 : -15)}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* ZZZ modo durmiendo */}
          {props.modoNoche === 'durmiendo' && <ZZZ modoHorizontal />}

          {/* ── HUD mínimo ─────────────────────────────────────────────────── */}

          {/* Ciudad y temperatura: no se muestran en ningún layout */}

          {/* No molestar — esquina superior izquierda */}
          <TouchableOpacity
            onPress={props.acciones.toggleDoNotDisturb}
            style={[styles.iconBtn, { top: safeTop + 16, left: safeLeft + 16 }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={props.noMolestar ? 'mic-off' : 'mic-outline'}
              size={24}
              color={props.noMolestar ? '#E85D24' : '#ffffffcc'}
            />
          </TouchableOpacity>

          {props.hasListas && (
            <TouchableOpacity
              onPress={props.onOpenListas}
              style={[styles.iconBtn, { top: safeTop + 16, right: safeRight + 16 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="document-text-outline" size={24} color="#ffffffcc" />
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
            <Ionicons
              name={props.modoReloj ? 'happy-outline' : 'time-outline'}
              size={24}
              color="#ffffffcc"
            />
          </TouchableOpacity>

          <TouchableOpacity
            onLongPress={props.onTriggerCumpleaños}
            delayLongPress={1200}
            style={{ position: 'absolute', bottom: safeBottom + 54, right: safeRight + 74, width: 72, height: 72 }}
          />


          {/* Indicator de estado — esquina inferior derecha */}
          {(props.estado !== 'esperando' || (props.detectandoSonido && !props.noMolestar)) && (
            <View style={[styles.estadoBadge, { bottom: safeBottom + 14, right: safeRight + 16 }]}>
              {props.detectandoSonido && props.estado === 'esperando'
                ? <WaveformDetectando />
                : <>
                    <View style={[styles.estadoDot, { backgroundColor: estadoColor }]} />
                    <Text style={styles.estadoTexto}>
                      {props.estado === 'escuchando' ? 'Escuchando'
                        : props.estado === 'pensando' ? 'Pensando...'
                        : props.estado === 'hablando' ? 'Hablando'
                        : ''}
                    </Text>
                  </>
              }
            </View>
          )}

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
  relojWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relojHora: {
    color: '#ffffffbf',
    fontSize: 172,
    letterSpacing: 2,
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
    backgroundColor: '#00000033',
    borderWidth: 1,
    borderColor: '#ffffff22',
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
  waveformWrap: {
    position:  'absolute',
    alignSelf: 'center',
  },
  estadoBadge: {
    position:       'absolute',
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:   20,
    backgroundColor: '#00000033',
  },
  estadoDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  estadoTexto: {
    color:      '#ffffffcc',
    fontSize:   12,
    fontWeight: '500',
  },
});
