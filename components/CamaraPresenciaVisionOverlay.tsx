import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Detección de presencia en tiempo real usando ML Kit Image Labeling
 * vía react-native-vision-camera frame processor (corre en hilo nativo/JSI).
 *
 * Frame processor usa runOnJS de Reanimated (no worklets-core) para cruzar
 * al hilo JS — compatible con VisionCamera v4 que corre en el runtime de Reanimated.
 */

let useCameraDevice: any  = () => null;
let Camera: any           = null;
let useFrameProcessor: any = () => undefined;
let VisionCameraProxy: any = null;
let runOnJS: any          = (fn: any) => fn;

if (Platform.OS !== 'web') {
  const vc = require('react-native-vision-camera');
  useCameraDevice    = vc.useCameraDevice;
  Camera             = vc.Camera;
  useFrameProcessor  = vc.useFrameProcessor;
  VisionCameraProxy  = vc.VisionCameraProxy;
  runOnJS = require('react-native-reanimated').runOnJS;
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

class PluginErrorBoundary extends Component<{ children: React.ReactNode; onError: (e: Error) => void }, { crashed: boolean }> {
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
    if (Platform.OS === 'web' || !activo || !Camera) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await Camera.requestCameraPermission();
        if (!cancelled) setHasPerm(status === 'granted');
      } catch {
        if (!cancelled) setHasPerm(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activo]);

  // Plugin nativo de ML Kit — inicializado una vez
  const plugin = useMemo(() => {
    if (Platform.OS === 'web' || !VisionCameraProxy) return null;
    try {
      return VisionCameraProxy.initFrameProcessorPlugin('labelerImage', { minConfidence: CONFIANZA_MINIMA });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    if (!device)  { onDebugLabels?.(['NO_DEVICE']); return; }
    if (!hasPerm) { onDebugLabels?.(['NO_PERM']);   return; }
    if (!plugin)  { onDebugLabels?.(['PLUGIN_NULL']); return; }
    onDebugLabels?.(['CAMERA_READY']);
  }, [activo, device, hasPerm, plugin]);

  const onLabelsJS = (labelsPayload: unknown) => {
    if (!activo) return;
    let etiquetas: string[] = [];
    try {
      const items = Array.isArray(labelsPayload)
        ? labelsPayload
        : Object.values(labelsPayload as Record<string, unknown>);
      etiquetas = items
        .map((it: any) => String(it?.label ?? '').toLowerCase().trim())
        .filter(Boolean);
    } catch {}
    onDebugLabels?.(etiquetas.length > 0 ? etiquetas : ['MLKIT_EMPTY']);
    const hayPersona = etiquetas.some(e => ETIQUETAS_HUMANAS.has(e));
    if (!hayPersona) return;
    const ahora = Date.now();
    if (ahora - lastHitRef.current < COOLDOWN_MS) return;
    lastHitRef.current = ahora;
    onPresenciaDetectada();
  };

  const frameProcessor = useFrameProcessor((frame: any) => {
    'worklet';
    if (!plugin) return;
    const data = plugin.call(frame);
    // runOnJS cruza del runtime de Reanimated al hilo JS
    runOnJS(onLabelsJS)(data);
  }, [plugin, activo]);

  if (Platform.OS === 'web' || !activo || !device || !hasPerm) return null;

  return (
    <PluginErrorBoundary onError={(e) => onDebugLabels?.([`CRASH: ${e.message}`])}>
      <View style={s.contenedor} pointerEvents="none">
        <Camera
          style={s.camara}
          device={device}
          isActive={activo}
          fps={FPS_DETECCION}
          frameProcessor={frameProcessor}
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
