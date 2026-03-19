import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Expresion, ModoNoche } from './RosaOjos';
import {
  Lagrimas, Corazones, Mejillas, SignosPregunta, Exclamaciones,
  SudorFrio, Carcajada, NotasMusica, CenoEnojado, Grawlixes,
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

export default function ExpresionOverlay({
  expresion, musicaActiva, temperatura, condicion,
  modoNoche, capa = 'frente', silbando = false, onRelampago,
}: Props) {
  const fade = useRef(new Animated.Value(0)).current;

  const hora      = new Date().getHours();
  const esNoche   = hora >= 20 || hora < 7;
  const esLluvia  = !!condicion?.toLowerCase().match(/lluvia|lloviendo|tormenta/);
  const esTormenta= !!condicion?.toLowerCase().match(/tormenta/);
  const esNieve   = !!condicion?.toLowerCase().match(/nieve|nevad|granizo/) || (temperatura !== undefined && temperatura <= 1);
  const esViento  = !!condicion?.toLowerCase().match(/viento|ventoso|ráfaga|rafaga/);
  const esCalor   = !esLluvia && !esNieve && (temperatura !== undefined && temperatura > 35);
  const esNublado = !!condicion?.toLowerCase().match(/nublado|nuboso|cubierto|parcial|algunas nubes/);

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
      {esTormenta                   && <Relampagos onRelampago={onRelampago} />}
      {(musicaActiva || silbando)   && <NotasMusica />}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {expresion === 'triste'      && <Lagrimas />}
        {expresion === 'feliz'       && <Corazones />}
        {expresion === 'mimada'      && <Corazones />}
        {expresion === 'mimada'      && <Mejillas />}
        {expresion === 'sorprendida' && <Exclamaciones />}
        {expresion === 'sorprendida' && <SudorFrio />}
        {expresion === 'pensativa'   && <SignosPregunta />}
        {expresion === 'chiste'      && <Carcajada />}
        {expresion === 'enojada'     && <CenoEnojado />}
        {expresion === 'enojada'     && <Grawlixes />}
      </Animated.View>
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
