import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

type Props = {
  visible: boolean;
  onCaptura: (base64: string) => void;
  onCancelar: () => void;
  facing?: 'front' | 'back';
  silencioso?: boolean;
};

export default function CameraAutoCaptura({ visible, onCaptura, onCancelar, facing = 'front', silencioso = false }: Props) {
  const [permission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cuenta, setCuenta] = useState(3);
  const capturedRef      = useRef(false);
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const cuentaArrancoRef = useRef(false);

  useEffect(() => {
    if (!visible) { setCuenta(3); capturedRef.current = false; cuentaArrancoRef.current = false; return; }
    if (!permission?.granted) { onCancelar(); return; }
    // Silencioso: arrancar en 1 (no 0) para esperar a que la cámara esté lista.
    // onCameraReady lo bajará a 0, disparando la captura recién cuando hay feed.
    setCuenta(silencioso ? 1 : 3);
    capturedRef.current = false;
    cuentaArrancoRef.current = false;
  }, [visible, permission?.granted]);

  function onCameraReady() {
    if (cuentaArrancoRef.current) return;
    cuentaArrancoRef.current = true;
    if (silencioso) { setCuenta(0); return; } // cámara lista → disparar captura
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCuenta(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current!); intervalRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Disparar cuando llega a 0
  useEffect(() => {
    if (!visible || cuenta !== 0 || capturedRef.current) return;
    capturedRef.current = true;
    (async () => {
      try {
        const foto = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
        if (foto?.base64) onCaptura(foto.base64);
        else onCancelar();
      } catch {
        onCancelar();
      }
    })();
  }, [cuenta, visible]);

  if (!visible) return null;

  if (silencioso) {
    // Cámara invisible — sin modal, sin UI, captura sin interrumpir al usuario
    return (
      <View style={styles.invisible} pointerEvents="none">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={onCameraReady} />
      </View>
    );
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.contenedor}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={onCameraReady} />

        {/* Overlay oscuro con cuenta regresiva */}
        <View style={styles.overlay}>
          {cuenta > 0 ? (
            <Text style={styles.numero}>{cuenta}</Text>
          ) : (
            <Text style={styles.flash}>📸</Text>
          )}
        </View>

        <TouchableOpacity style={styles.cancelar} onPress={onCancelar}>
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  invisible:  { position: 'absolute', width: 1, height: 1, opacity: 0 },
  contenedor: { flex: 1, backgroundColor: '#000' },
  overlay:    { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  numero:     { fontSize: 140, fontWeight: '800', color: '#fff', opacity: 0.9, textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  flash:      { fontSize: 100 },
  cancelar:   { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: '#00000088', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  cancelarTexto: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
