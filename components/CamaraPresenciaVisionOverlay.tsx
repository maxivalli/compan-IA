import React, { Component, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Detección de presencia en tiempo real usando ML Kit Image Labeling
 * vía react-native-vision-camera-image-labeler.
 *
 * Usa el componente Camera con prop `callback` (sin frame processor / worklets),
 * compatible con newArchEnabled: false.
 */

let useCameraDevice: any = () => null;
let NativeCamera: any    = null;
let LabelCamera: any     = null;

if (Platform.OS !== 'web') {
  const vc  = require('react-native-vision-camera');
  useCameraDevice = vc.useCameraDevice;
  NativeCamera    = vc.Camera;
  LabelCamera     = require('react-native-vision-camera-image-labeler').Camera;
}

const ETIQUETAS_HUMANAS = new Set([
  'person', 'human', 'people', 'man', 'woman', 'boy', 'girl',
  'adult', 'child', 'elder', 'senior',
  'face', 'head', 'hair', 'arm', 'hand', 'finger', 'leg', 'foot',
  'shoulder', 'neck', 'back', 'chest', 'body', 'skin',
  'clothing', 'clothes', 'shirt', 't-shirt', 'blouse', 'top',
  'dress', 'skirt', 'pants', 'trousers', 'jeans', 'shorts',
  'jacket', 'coat', 'sweater', 'hoodie', 'suit',
  'footwear', 'shoe', 'shoes', 'boot', 'sandal', 'sneaker',
  'glasses', 'hat', 'cap', 'bag', 'handbag', 'backpack',
  'sitting', 'standing', 'walking', 'running',
]);

const CONFIANZA_MINIMA = 0.3;
const FPS_DETECCION   = 3;
const COOLDOWN_MS     = 1200;

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
  onDebugLabels?: (labels: string[]) => void;
};

class PluginErrorBoundary extends Component<
  { children: React.ReactNode; onError: (e: Error) => void },
  { crashed: boolean }
> {
  state = { crashed: false };
  componentDidCatch(error: Error) {
    this.props.onError(error);
    this.setState({ crashed: true });
  }
  render() { return this.state.crashed ? null : this.props.children; }
}

export default function CamaraPresenciaVisionOverlay({ activo, onPresenciaDetectada, onDebugLabels }: Props) {
  const device     = useCameraDevice('front');
  const lastHitRef = useRef(0);
  const [hasPerm, setHasPerm] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !activo || !NativeCamera) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await NativeCamera.requestCameraPermission();
        if (!cancelled) setHasPerm(status === 'granted');
      } catch {
        if (!cancelled) setHasPerm(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activo]);

  useEffect(() => {
    if (!activo) return;
    if (!device)  { onDebugLabels?.(['NO_DEVICE']); return; }
    if (!hasPerm) { onDebugLabels?.(['NO_PERM']);   return; }
    onDebugLabels?.(['CAMERA_READY']);
  }, [activo, device, hasPerm]);

  const handleLabels = (labels: any[]) => {
    if (!Array.isArray(labels) || labels.length === 0) {
      onDebugLabels?.(['MLKIT_EMPTY']);
      return;
    }

    let hayPersona    = false;
    let primeraEtiq   = 'UNKNOWN';

    for (let i = 0; i < labels.length; i++) {
      const l    = labels[i];
      const conf = typeof l.confidence === 'number' ? l.confidence : (l.score ?? 0);
      if (conf < CONFIANZA_MINIMA) continue;
      const lbl = String(l.label ?? l.text ?? '').toLowerCase().trim();
      if (i === 0) primeraEtiq = lbl || 'NOLABEL';
      if (ETIQUETAS_HUMANAS.has(lbl)) { hayPersona = true; break; }
    }

    onDebugLabels?.([hayPersona ? `HIT:${primeraEtiq}` : primeraEtiq]);

    if (!hayPersona) return;
    const ahora = Date.now();
    if (ahora - lastHitRef.current < COOLDOWN_MS) return;
    lastHitRef.current = ahora;
    onPresenciaDetectada();
  };

  if (Platform.OS === 'web' || !activo || !device || !hasPerm || !LabelCamera) return null;

  return (
    <PluginErrorBoundary onError={(e) => onDebugLabels?.([`CRASH: ${e.message}`])}>
      <View style={s.contenedor} pointerEvents="none">
        <LabelCamera
          style={s.camara}
          device={device}
          isActive={activo}
          fps={FPS_DETECCION}
          options={{ minConfidence: CONFIANZA_MINIMA }}
          callback={handleLabels}
          pixelFormat="yuv"
        />
      </View>
    </PluginErrorBoundary>
  );
}

const s = StyleSheet.create({
  contenedor: {
    position: 'absolute',
    width: 160,
    height: 160,
    bottom: 0,
    right: 0,
    opacity: 0.01,
    overflow: 'hidden',
  },
  camara: { flex: 1 },
});
