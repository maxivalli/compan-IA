import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

/**
 * Detección de presencia por movimiento (frame diff).
 * Compara fotogramas consecutivos de la cámara frontal.
 * No requiere que el usuario mire a la cámara — detecta cualquier movimiento
 * en el campo visual (persona caminando, agitando la mano, etc.).
 *
 * Estrategia:
 *  - Captura un frame cada INTERVALO_MS a calidad mínima (0.05)
 *  - Compara la distribución de bytes JPEG del frame actual vs el anterior
 *  - Si la diferencia supera UMBRAL_MOVIMIENTO → onPresenciaDetectada()
 */

const INTERVALO_MS       = 1500;  // ms entre capturas
const UMBRAL_TAMANIO     = 0.09;  // si el tamaño del JPEG difiere >9% → movimiento
const UMBRAL_BYTES       = 0.025; // si el diff de bytes muestreados supera 2.5% → movimiento
const SKIP_HEADER        = 600;   // saltar header JPEG (~450 bytes = 600 chars base64)
const SAMPLES            = 400;   // cantidad de muestras a comparar

function hayMovimiento(prev: string, curr: string): boolean {
  // 1. Diferencia de tamaño: cuando alguien entra al encuadre,
  //    la compresión JPEG cambia significativamente.
  const lenMax = Math.max(prev.length, curr.length);
  if (Math.abs(prev.length - curr.length) / lenMax > UMBRAL_TAMANIO) return true;

  // 2. Comparar bytes muestreados de la sección de datos (evitar header)
  const len = Math.min(prev.length, curr.length);
  const available = len - SKIP_HEADER;
  if (available < SAMPLES) return false;

  const step = Math.floor(available / SAMPLES);
  let diffTotal = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const pos = SKIP_HEADER + i * step;
    // charCodeAt sobre base64 da valores en rango ~43–122 (diferencia máx ~79)
    diffTotal += Math.abs(prev.charCodeAt(pos) - curr.charCodeAt(pos));
  }
  return (diffTotal / (SAMPLES * 79)) > UMBRAL_BYTES;
}

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
};

export default function CamaraPresenciaOverlay({ activo, onPresenciaDetectada }: Props) {
  const cameraRef     = useRef<CameraView>(null);
  const corriendo     = useRef(false);
  const frameAnterior = useRef<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // Pedir permiso cuando se activa
  useEffect(() => {
    if (Platform.OS === 'web' || !activo) return;
    if (!permission?.granted) requestPermission().catch(() => {});
  }, [activo, permission?.granted]);

  // Loop de captura y comparación
  useEffect(() => {
    if (Platform.OS === 'web' || !activo || !permission?.granted) {
      corriendo.current = false;
      frameAnterior.current = null;
      return;
    }

    corriendo.current = true;

    async function detectar() {
      if (!corriendo.current) return;
      try {
        const foto = await cameraRef.current?.takePictureAsync({
          quality:        0.15,   // calidad baja pero suficiente para detectar movimiento a distancia
          base64:         true,   // no escribir a disco
          skipProcessing: true,
          shutterSound:   false,
        });

        if (!foto?.base64 || !corriendo.current) return;

        const prev = frameAnterior.current;
        frameAnterior.current = foto.base64;

        // El primer frame solo sirve de referencia, no comparar
        if (prev && hayMovimiento(prev, foto.base64)) {
          onPresenciaDetectada();
        }
      } catch {
        // Ignorar errores de captura (ej. cámara ocupada por flujo de foto)
      } finally {
        if (corriendo.current) setTimeout(detectar, INTERVALO_MS);
      }
    }

    const arranque = setTimeout(detectar, INTERVALO_MS);
    return () => {
      corriendo.current = false;
      frameAnterior.current = null;
      clearTimeout(arranque);
    };
  }, [activo, permission?.granted, onPresenciaDetectada]);

  if (Platform.OS === 'web' || !activo || !permission?.granted) return null;

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
    opacity: 0.01,    // invisible (0.01 evita cuelgues en Android vs 0)
    overflow: 'hidden',
  },
  camara: { flex: 1 },
});
