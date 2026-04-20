import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Detección de presencia en tiempo real usando ML Kit Image Labeling
 * vía react-native-vision-camera frame processor (corre en hilo nativo/JSI).
 *
 * No requiere que el usuario mire a la cámara:
 *  - Detecta cuerpo completo, de espaldas, de costado
 *  - Detecta partes del cuerpo visibles (brazo, mano, pierna)
 *  - Detecta ropa (camisa, pantalón, zapatos)
 *  - Detecta actividades humanas (sentado, parado, caminando)
 *
 * Funciona a 3 fps para minimizar consumo de batería.
 */

// Importación condicional — react-native-vision-camera no soporta web
let VisionCamera: any      = null;
let useCameraDevice: any   = () => null;
let LabelCamera: any       = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vc  = require('react-native-vision-camera');
  VisionCamera    = vc.Camera;
  useCameraDevice = vc.useCameraDevice;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vcl = require('react-native-vision-camera-image-labeler');
  LabelCamera = vcl.Camera;
}

// ── Etiquetas de ML Kit que indican presencia humana ─────────────────────────
// Incluye: cuerpo completo, partes del cuerpo, ropa, calzado, actividades.
// Sin necesidad de ver la cara.
const ETIQUETAS_HUMANAS = new Set([
  // Persona directa
  'person', 'human', 'people', 'man', 'woman', 'boy', 'girl',
  'adult', 'child', 'elder', 'senior',
  // Partes del cuerpo (visibles desde cualquier ángulo)
  'face', 'head', 'hair', 'arm', 'hand', 'finger', 'leg', 'foot',
  'shoulder', 'neck', 'back', 'chest', 'body', 'skin',
  // Ropa (muy confiable — casi siempre hay ropa si hay persona)
  'clothing', 'clothes', 'shirt', 't-shirt', 'blouse', 'top',
  'dress', 'skirt', 'pants', 'trousers', 'jeans', 'shorts',
  'jacket', 'coat', 'sweater', 'hoodie', 'suit',
  // Calzado
  'footwear', 'shoe', 'shoes', 'boot', 'sandal', 'sneaker',
  // Accesorios
  'glasses', 'hat', 'cap', 'bag', 'handbag', 'backpack',
  // Actividades humanas
  'sitting', 'standing', 'walking', 'running',
]);

const CONFIANZA_MINIMA = 0.3;    // umbral bajo para no perder detecciones
const FPS_DETECCION   = 3;       // 3 fps: suficiente para presencia, ahorra batería
const COOLDOWN_MS     = 1200;    // evita spam al callback (además del cooldown global)

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
  onDebugLabels?: (labels: string[]) => void;
};

export default function CamaraPresenciaVisionOverlay({ activo, onPresenciaDetectada, onDebugLabels }: Props) {
  const device     = useCameraDevice('front');
  const camRef     = useRef<any>(null);
  const lastHitRef = useRef(0);
  const [hasPerm, setHasPerm] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !activo || !VisionCamera) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await VisionCamera.requestCameraPermission();
        if (!cancelled) setHasPerm(status === 'granted');
      } catch {
        if (!cancelled) setHasPerm(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activo]);

  // Opciones del labeler — minConfidence 0.3 para detectar incluso presencias parciales
  const labelOptions = useMemo(() => ({ minConfidence: CONFIANZA_MINIMA as 0.3 }), []);

  /**
   * Extrae strings de etiquetas del payload que devuelve ML Kit.
   * El tipo Label es { [index: number]: { label: string, confidence: number } }
   * La librería puede devolver un array o un objeto indexado — se maneja los dos casos.
   */
  function extraerEtiquetas(payload: unknown): string[] {
    if (!payload) return [];
    const items = Array.isArray(payload)
      ? payload
      : Object.values(payload as Record<string, unknown>);
    return items
      .map((it: any) => String(it?.label ?? '').toLowerCase().trim())
      .filter(Boolean);
  }

  function onLabels(labelsPayload: unknown) {
    if (!activo) return;
    const etiquetas = extraerEtiquetas(labelsPayload);
    onDebugLabels?.(etiquetas);
    const hayPersona = etiquetas.some(e => ETIQUETAS_HUMANAS.has(e));
    if (!hayPersona) return;
    const ahora = Date.now();
    if (ahora - lastHitRef.current < COOLDOWN_MS) return;
    lastHitRef.current = ahora;
    onPresenciaDetectada();
  }

  if (Platform.OS === 'web' || !activo || !device || !hasPerm) return null;

  return (
    <View style={s.contenedor} pointerEvents="none">
      <LabelCamera
        ref={camRef}
        style={s.camara}
        device={device}
        isActive={activo}
        fps={FPS_DETECCION}
        options={labelOptions}
        callback={onLabels}
        pixelFormat="yuv"
      />
    </View>
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
