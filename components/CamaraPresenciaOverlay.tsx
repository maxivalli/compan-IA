import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView } from 'expo-camera';
import {
  detectFacesAsync,
  FaceDetectorMode,
  FaceDetectorLandmarks,
  FaceDetectorClassifications,
} from 'expo-face-detector';

const INTERVALO_MS = 2000; // captura cada 2 s cuando está activo

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
};

/**
 * Overlay invisible de cámara frontal.
 * Solo se monta cuando `activo=true` (modo watching: +30 min sin actividad).
 * Cada 2 s captura un frame y corre expo-face-detector sobre él.
 * Si detecta un rostro llama `onPresenciaDetectada`.
 */
export default function CamaraPresenciaOverlay({ activo, onPresenciaDetectada }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const corriendo = useRef(false);

  useEffect(() => {
    if (!activo) { corriendo.current = false; return; }

    corriendo.current = true;

    async function detectar() {
      if (!corriendo.current) return;
      try {
        const foto = await cameraRef.current?.takePictureAsync({
          quality:        0.1,
          skipProcessing: true,
          shutterSound:   false,
        });
        if (!foto?.uri || !corriendo.current) return;

        const result = await detectFacesAsync(foto.uri, {
          mode:               FaceDetectorMode.fast,
          detectLandmarks:    FaceDetectorLandmarks.none,
          runClassifications: FaceDetectorClassifications.none,
          tracking:           false,
        });
        if (result.faces.length > 0 && corriendo.current) {
          onPresenciaDetectada();
        }
      } catch {
        // Ignorar errores de captura (ej. cámara ocupada por foto Telegram)
      } finally {
        // setTimeout recursivo en lugar de setInterval:
        // evita que dos takePictureAsync se superpongan si la cámara tarda > 2s.
        if (corriendo.current) setTimeout(detectar, INTERVALO_MS);
      }
    }

    // Arrancar el ciclo
    const arranque = setTimeout(detectar, INTERVALO_MS);
    return () => { corriendo.current = false; clearTimeout(arranque); };
  }, [activo, onPresenciaDetectada]);

  if (!activo) return null;

  return (
    <View style={s.contenedor} pointerEvents="none">
      <CameraView
        ref={cameraRef}
        style={s.camara}
        facing="front"
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
    opacity: 0,       // invisible — solo detecta
    overflow: 'hidden',
  },
  camara: { flex: 1 },
});
