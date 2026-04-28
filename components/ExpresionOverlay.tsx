import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Expresion, ModoNoche } from './RosaOjos';
import {
  Lagrimas, Corazones, Mejillas, SignosPregunta, Exclamaciones,
  Carcajada, NotasMusica, Grawlixes,
  Bonete, GorroNavidad, Destellos, Confetti, GotaSudor,
  Cejas,
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
  modoHorizontal?: boolean;
  esFondoNoche?: boolean;
};

// Detecta si hoy es Navidad para mostrar el gorro navideño
// (fuera del componente: solo cambia una vez por día, no necesita recalcular en cada render)
const ACCESORIO_GLOBAL: 'bonete' | 'gorro' | null = (() => {
  const ahora = new Date();
  const mes   = ahora.getMonth() + 1;
  const dia   = ahora.getDate();
  if (mes === 12 && dia === 25) return 'gorro';
  return null;
})();

export default memo(function ExpresionOverlay({
  expresion, musicaActiva, temperatura, condicion,
  modoNoche, capa = 'frente', silbando = false, onRelampago, modoHorizontal = false,
  esFondoNoche = false,
  esCumpleaños = false, browOffsetY = 0, browOffsetX = 0, browScale = 1, browGap = 0, faceScale: propFaceScale,
  noMolestar = false,
}: Props & { esCumpleaños?: boolean; browOffsetY?: number; browOffsetX?: number; browScale?: number; browGap?: number; faceScale?: number; noMolestar?: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const fadeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const faceScale = propFaceScale ?? (screenW >= 600 ? Math.min(screenW / 390, 1.7) : 1);
  const esHorizontalPantalla = modoHorizontal || screenW > screenH;

  const clima = useMemo(() => {
    const c = condicion?.toLowerCase() ?? '';
    const esLluvia  = !!c.match(/lluvia|lloviendo|llovizna|chaparrón|tormenta/);
    const esTormenta= !!c.match(/tormenta/);
    const esNieve   = !!c.match(/nieve|nevad|granizo/) || (temperatura !== undefined && temperatura <= 1);
    const esViento  = !!c.match(/viento|ventoso|ráfaga|rafaga/);
    const esCalor   = !esLluvia && !esNieve && (temperatura !== undefined && temperatura > 35);
    const esParcial = !!c.match(/parcialmente/);
    const esNublado = !!c.match(/nublado|nuboso|cubierto|parcial|algunas nubes/);
    const esSoleado = !!c.match(/soleado|despejado|sol con|cielo claro/);
    return { esLluvia, esTormenta, esNieve, esViento, esCalor, esParcial, esNublado, esSoleado };
  }, [condicion, temperatura]);

  const { esLluvia, esTormenta, esNieve, esViento, esCalor, esParcial, esNublado, esSoleado } = clima;

  // Accesorio: cumpleaños tiene prioridad sobre Navidad
  const accesorio: 'bonete' | 'gorro' | null = esCumpleaños ? 'bonete' : ACCESORIO_GLOBAL;

  // El sol no aparece si es de noche por hora (esFondoNoche) O si Rosita no está despierta.
  // esFondoNoche viene del padre (hora >= 20 || hora < 5) y evita que el sol se muestre
  // cuando modoNoche='despierta' pero el reloj marca noche (ej: usuario interactuó a las 22h).
  const esNocheEfectiva = esFondoNoche || modoNoche !== 'despierta';

  useEffect(() => {
    fadeAnimRef.current?.stop();
    fadeAnimRef.current = Animated.timing(fade, {
      toValue: expresion === 'neutral' ? 0 : 1,
      duration: 400,
      useNativeDriver: true,
    });
    fadeAnimRef.current.start();
    return () => fadeAnimRef.current?.stop();
  }, [expresion]);

  if (capa === 'fondo') return (
    <View style={[s.overlay, { zIndex: 1 }]} pointerEvents="none">
      {!esNocheEfectiva && !musicaActiva && !esLluvia && !esViento && !esNieve && (esSoleado || esParcial) && <Sol modoHorizontal={esHorizontalPantalla} />}
      {esLluvia                                                           && <GotasLluvia />}
      {esNieve                                                            && <Nieve />}
      {esViento                                                           && <Viento />}
      {esCalor                                                            && <CalorEfecto />}
      {(esNublado || esLluvia || esNieve)                                 && <Nubes />}
    </View>
  );

  return (
    <View style={[s.overlay, { zIndex: 10 }]} pointerEvents="none">
      {esTormenta && <Relampagos onRelampago={onRelampago} />}

      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
        <View
style={{ width: 320, height: 409, transform: [{ scale: faceScale }], overflow: 'visible' }}
        >
          {/* Accesorios estacionales — van por encima de todo */}
          {accesorio === 'bonete' && <Bonete />}
          {accesorio === 'gorro'  && <GorroNavidad />}

          {(musicaActiva || silbando) && <NotasMusica horizontal={esHorizontalPantalla} />}

          <Cejas expresion={expresion} offsetY={browOffsetY} offsetX={browOffsetX} scale={browScale} gap={browGap} modoNoche={modoNoche} noMolestar={noMolestar} />

          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, overflow: 'visible' }]}>
            {expresion === 'triste'        && <Lagrimas />}
            {expresion === 'ternura'       && <Corazones />}
            {expresion === 'feliz'         && <Destellos />}
            {expresion === 'entusiasmada'  && <Confetti />}
            {expresion === 'mimada'        && <Corazones />}
            {expresion === 'mimada'        && !esHorizontalPantalla && <Mejillas />}
            {expresion === 'sorprendida'   && !esTormenta && <Exclamaciones />}
            {expresion === 'pensativa'     && <SignosPregunta />}
            {expresion === 'avergonzada'    && <GotaSudor />}
            {expresion === 'chiste'        && <Carcajada />}
            {expresion === 'enojada'       && (
              <View style={esHorizontalPantalla ? { transform: [{ translateY: 62 }] } : undefined}>
                <Grawlixes />
              </View>
            )}
          </Animated.View>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: -20, right: -20,
    top: -60,  bottom: -70,
    overflow: 'visible',
    zIndex: 10,
  },
});
