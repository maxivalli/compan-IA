import { useCallback, useEffect, useRef, useState } from 'react';
import {
  iniciar, detener, hayAuriculares, esAuricularesBluetooth,
} from '../modules/amplificador-audio/src';

// Niveles de ganancia disponibles: 1.5× → 2× → 3× → apagado
const NIVELES = [1.5, 2.0, 3.0];

export function useAmplificador() {
  const [activo,      setActivo]      = useState(false);
  const [nivelIdx,    setNivelIdx]    = useState(0);   // índice en NIVELES
  const [auriculares, setAuriculares] = useState(false);
  const [esBluetooth, setEsBluetooth] = useState(false);

  const activoRef = useRef(false);

  // Detectar auriculares cada 2 segundos
  useEffect(() => {
    function detectar() {
      const hay = hayAuriculares();
      const bt  = hay ? esAuricularesBluetooth() : false;
      setAuriculares(hay);
      setEsBluetooth(bt);

      // Si sacaron los auriculares y el amplificador está activo, apagarlo
      if (!hay && activoRef.current) {
        activoRef.current = false;
        setActivo(false);
        detener();
      }
    }

    detectar(); // check inmediato al montar
    const id = setInterval(detectar, 2000);
    return () => clearInterval(id);
  }, []);

  // Reiniciar amplificador cuando cambia el nivel de ganancia
  useEffect(() => {
    if (activoRef.current) {
      detener();
      iniciar(NIVELES[nivelIdx]);
    }
  }, [nivelIdx]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (activoRef.current) detener();
    };
  }, []);

  /** Enciende / apaga el amplificador. */
  const toggleActivo = useCallback(() => {
    if (activoRef.current) {
      activoRef.current = false;
      setActivo(false);
      detener();
    } else {
      activoRef.current = true;
      setActivo(true);
      iniciar(NIVELES[nivelIdx]);
    }
  }, [nivelIdx]);

  /** Cicla al siguiente nivel de ganancia (si está activo, lo aplica de inmediato). */
  const siguienteNivel = useCallback(() => {
    setNivelIdx(prev => (prev + 1) % NIVELES.length);
  }, []);

  return {
    activo,
    ganancia:    NIVELES[nivelIdx],
    nivelIdx,
    auriculares,
    esBluetooth,
    toggleActivo,
    siguienteNivel,
    etiquetaGanancia: `${NIVELES[nivelIdx]}×`,
  };
}
