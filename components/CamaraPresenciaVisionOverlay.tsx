import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as PersonaDetector from '../modules/persona-detector/src/PersonaDetectorModule';

type Props = {
  activo: boolean;
  onPresenciaDetectada: () => void;
  onDebugLabels?: (labels: string[]) => void;
};

const CONFIANZA_MINIMA = 0.5;

export default function CamaraPresenciaVisionOverlay({ activo, onPresenciaDetectada, onDebugLabels }: Props) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (!activo) {
      PersonaDetector.stopDetection();
      return;
    }

    PersonaDetector.startDetection({
      confianzaMinima: CONFIANZA_MINIMA,
      etiquetas: PersonaDetector.ETIQUETAS_DEFAULT,
    });

    const personSub = PersonaDetector.addPersonDetectedListener(() => {
      onPresenciaDetectada();
    });

    const debugSub = PersonaDetector.addDebugLabelListener((label) => {
      onDebugLabels?.([label]);
    });

    return () => {
      personSub.remove();
      debugSub.remove();
      PersonaDetector.stopDetection();
    };
  }, [activo]);

  return null;
}
