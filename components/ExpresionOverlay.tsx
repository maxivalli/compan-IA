import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Expresion, ModoNoche } from './RosaOjos';
import {
  Lagrimas, Corazones, Mejillas, SignosPregunta, Exclamaciones,
  Carcajada, NotasMusica, CenoEnojado, Grawlixes,
  Bonete, GorroNavidad,
} from './EfectosExpresion';
import {
  GotasLluvia, Nieve, Viento, CalorEfecto,
  Sol, Relampagos, Nubes,
} from './EfectosClima';

type Props = {
  expresion:    Expresion;
  musicaActiva: boolean;
  temperatura?: number;
  condicion?:   string;
  modoNoche:    ModoNoche;
  capa?:        'fondo' | 'frente';
  silbando?:    boolean;
  onRelampago?: () => void;
};

// Detecta si hoy es cumpleaños o Navidad para mostrar el accesorio correspondiente
function detectarAccesorio(): 'bonete' | 'gorro' | null {
  const ahora = new Date();
  const mes   = ahora.getMonth() + 1;
  const dia   = ahora.getDate();
  if (mes === 12 && dia === 25) return 'gorro';
  return null;
}

export default function ExpresionOverlay({
  expresion, musicaActiva, temperatura, condicion,
  modoNoche, capa = 'frente', silbando = false, onRelampago,
  esCumpleaños = false,
}: Props & { esCumpleaños?: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const { width: screenW } = useWindowDimensions();
  const faceScale = screenW >= 600 ? Math.min(screenW / 390, 1.7) : 1;

  const horaActual = new Date().getHours();
  const esNoche    = horaActual >= 20 || horaActual < 5;
  const esLluvia  = !!condicion?.toLowerCase().match(/lluvia|lloviendo|tormenta/);
  const esTormenta= !!condicion?.toLowerCase().match(/tormenta/);
  const esNieve   = !!condicion?.toLowerCase().match(/nieve|nevad|granizo/) || (temperatura !== undefined && temperatura <= 1);
  const esViento  = !!condicion?.toLowerCase().match(/viento|ventoso|ráfaga|rafaga/);
  const esCalor   = !esLluvia && !esNieve && (temperatura !== undefined && temperatura > 35);
  const esNublado = !!condicion?.toLowerCase().match(/nublado|nuboso|cubierto|parcial|algunas nubes/);

  // Accesorio: cumpleaños tiene prioridad sobre Navidad
  const accesorioFallback = detectarAccesorio();
  const accesorio: 'bonete' | 'gorro' | null = esCumpleaños ? 'bonete' : accesorioFallback;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: expresion === 'neutral' ? 0 : 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [expresion]);

  if (capa === 'fondo') return (
    <View style={s.overlay} pointerEvents="none">
      {esLluvia                                                           && <GotasLluvia />}
      {esNieve                                                            && <Nieve />}
      {esViento                                                           && <Viento />}
      {esCalor                                                            && <CalorEfecto />}
      {esNublado && !esLluvia                                             && <Nubes />}
      {!esNoche && !musicaActiva && !esLluvia && !esNublado && !esNieve && !esViento && <Sol />}
    </View>
  );

  return (
    <View style={s.overlay} pointerEvents="none">
      {esTormenta && <Relampagos onRelampago={onRelampago} />}

      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
        <View
style={{ width: 320, height: 409, transform: [{ scale: faceScale }], overflow: 'visible' }}
        >
          {/* Accesorios estacionales — van por encima de todo */}
          {accesorio === 'bonete' && <Bonete />}
          {accesorio === 'gorro'  && <GorroNavidad />}

          {(musicaActiva || silbando) && <NotasMusica />}

          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, overflow: 'visible' }]}>
            {expresion === 'triste'      && <Lagrimas />}
            {expresion === 'feliz'       && <Corazones />}
            {expresion === 'mimada'      && <Corazones />}
            {expresion === 'mimada'      && <Mejillas />}
            {expresion === 'sorprendida' && <Exclamaciones />}
            {expresion === 'pensativa'   && <SignosPregunta />}
            {expresion === 'chiste'      && <Carcajada />}
            {expresion === 'enojada'     && <CenoEnojado />}
            {expresion === 'enojada'     && <Grawlixes />}
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: -20, right: -20,
    top: -60,  bottom: -70,
    overflow: 'visible',
  },
});