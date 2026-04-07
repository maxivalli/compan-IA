import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera as VisionCamera, useCameraDevice } from 'react-native-vision-camera';
import { Camera as FaceCamera, FaceDetectionOptions, Face } from 'react-native-vision-camera-face-detector';

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

  const faceDetectionOptions = useMemo<FaceDetectionOptions>(() => ({
    // Opciones conservadoras: suficiente para “presencia”, sin costos extra
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
    minFaceSize: 0.12,
    trackingEnabled: false,
  }), []);

  const onFaces = (faces: Face[]) => {
    if (!activo) return;
    if (faces.length === 0) return;
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
      <FaceCamera
        ref={camRef}
        style={s.camara}
        device={device}
        isActive={activo}
        faceDetectionOptions={faceDetectionOptions}
        faceDetectionCallback={onFaces}
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

