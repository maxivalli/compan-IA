import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera as VisionCamera, useCameraDevice } from 'react-native-vision-camera';
import { Camera as LabelCamera, Label } from 'react-native-vision-camera-image-labeler';

const COOLDOWN_LOCAL_MS = 1200; // evita spam del callback (además del cooldown global en useCamaraPresencia)

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
};

/**
 * Overlay invisible de cámara frontal usando VisionCamera (frames en vivo).
 * Se monta solo cuando `activo=true` (modo watching).
 * Si detecta un rostro llama `onPresenciaDetectada`.
 */
export default function CamaraPresenciaVisionOverlay({ activo, onPresenciaDetectada }: Props) {
  const device = useCameraDevice('front');
  const camRef = useRef<VisionCamera | null>(null);
  const lastHitRef = useRef(0);
  const [hasPerm, setHasPerm] = useState<boolean>(false);

  useEffect(() => {
    if (!activo) return;
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

  const labelOptions = useMemo(() => ({ minConfidence: 0.5 as const }), []);

  function extraerLabels(payload: unknown): string[] {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      return payload
        .map((it: any) => String(it?.label ?? '').toLowerCase().trim())
        .filter(Boolean);
    }
    if (typeof payload === 'object') {
      return Object.values(payload as Record<string, any>)
        .map((it: any) => String(it?.label ?? '').toLowerCase().trim())
        .filter(Boolean);
    }
    return [];
  }

  const onLabels = (labelsPayload: Label[] | Label) => {
    if (!activo) return;
    const labels = extraerLabels(labelsPayload);
    const hayPersona = labels.some((label) =>
      label.includes('person') || label.includes('human') || label.includes('persona') || label.includes('face') || label.includes('cara'),
    );
    if (!hayPersona) return;
    const ahora = Date.now();
    if (ahora - lastHitRef.current < COOLDOWN_LOCAL_MS) return;
    lastHitRef.current = ahora;
    onPresenciaDetectada();
  };

  if (!activo) return null;
  if (!device) return null;
  if (!hasPerm) return null;

  return (
    <View style={s.contenedor} pointerEvents="none">
      <LabelCamera
        ref={camRef}
        style={s.camara}
        device={device}
        isActive={activo}
        options={labelOptions}
        callback={onLabels}
      />
    </View>
  );
}

const s = StyleSheet.create({
  contenedor: {
    position: 'absolute',
    width: 64,
    height: 64,
    bottom: 0,
    right: 0,
    opacity: 0.01, // mantener >0 evita issues en algunos Android
    overflow: 'hidden',
  },
  camara: { flex: 1 },
});

