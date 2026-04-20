import React, { Component, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRunOnJS } from 'react-native-worklets-core';

/**
 * Detección de presencia en tiempo real usando ML Kit Image Labeling
 * vía vision-camera-image-labeler (plugin oficial para VisionCamera v4).
 *
 * labelImage() ya es un worklet nativo — no necesita VisionCameraProxy.
 * useRunOnJS (worklets-core) para cruzar al hilo JS con un boolean plano.
 */

let useCameraDevice: any   = () => null;
let Camera: any            = null;
let useFrameProcessor: any = () => undefined;
let labelImage: any        = null;

if (Platform.OS !== 'web') {
  const vc = require('react-native-vision-camera');
  useCameraDevice   = vc.useCameraDevice;
  Camera            = vc.Camera;
  useFrameProcessor = vc.useFrameProcessor;
  labelImage = require('vision-camera-image-labeler').labelImage;
}

const ETIQUETAS_HUMANAS = [
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
];

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

  useEffect(() => {
    if (!activo) return;
    if (!device)  { onDebugLabels?.(['NO_DEVICE']); return; }
    if (!hasPerm) { onDebugLabels?.(['NO_PERM']);   return; }
    onDebugLabels?.(['CAMERA_READY']);
  }, [activo, device, hasPerm]);

  const onResultJS = useRunOnJS((hayPersona: boolean, debugLabel: string) => {
    onDebugLabels?.([debugLabel]);
    if (!hayPersona) return;
    const ahora = Date.now();
    if (ahora - lastHitRef.current < COOLDOWN_MS) return;
    lastHitRef.current = ahora;
    onPresenciaDetectada();
  }, [activo, onDebugLabels, onPresenciaDetectada]);

  const frameProcessor = useFrameProcessor((frame: any) => {
    'worklet';
    const labels = labelImage(frame);
    let hayPersona = false;
    let primeraEtiqueta = 'MLKIT_EMPTY';
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      if (l.confidence < CONFIANZA_MINIMA) continue;
      const lbl = String(l.label ?? '').toLowerCase().trim();
      if (i === 0) primeraEtiqueta = lbl;
      for (let j = 0; j < ETIQUETAS_HUMANAS.length; j++) {
        if (lbl === ETIQUETAS_HUMANAS[j]) { hayPersona = true; break; }
      }
      if (hayPersona) break;
    }
    onResultJS(hayPersona, hayPersona ? `HIT:${primeraEtiqueta}` : primeraEtiqueta);
  }, [onResultJS]);

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
