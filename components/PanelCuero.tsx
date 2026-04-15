import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Panel de cuero envejecido estilo radio vintage.
 * Se posiciona absolutamente desde `top` hasta el fondo de la pantalla.
 * `top` debe venir del onLayout del ojoContenedor (y + height).
 */
export default function PanelCuero({ top }: { top: number }) {
  const { width: W } = useWindowDimensions();

  if (top === 0) return null;

  return (
    <View style={[s.panel, { top }]} pointerEvents="none">

      {/* ── Base cuero: gradiente horizontal — más claro al centro, oscuro en bordes ── */}
      <LinearGradient
        colors={['#3A1608', '#7A3C18', '#A05530', '#9A5028', '#7A3C18', '#3A1608']}
        locations={[0, 0.08, 0.38, 0.62, 0.92, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Sombra superior: transición suave donde la cara se une al panel ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.60)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']}
        locations={[0, 0.30, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 90 }}
      />

      {/* ── Sheen: destello de luz en el borde superior del cuero ── */}
      <LinearGradient
        colors={['rgba(255,190,120,0.20)', 'rgba(255,190,120,0.05)', 'rgba(255,190,120,0)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 60 }}
      />

      {/* ── Costura doble — detalle vintage de marroquinería ── */}
      <Svg
        width={W}
        height={40}
        style={{ position: 'absolute', top: 16 }}
      >
        {/* Primera línea de costura */}
        <Path
          d={`M 24,9 L ${W - 24},9`}
          stroke="#D4906A"
          strokeWidth={1.8}
          strokeDasharray="10,7"
          fill="none"
          opacity={0.82}
        />
        {/* Segunda línea de costura, desplazada para dar efecto de hilo doble */}
        <Path
          d={`M 24,20 L ${W - 24},20`}
          stroke="#D4906A"
          strokeWidth={1.8}
          strokeDasharray="10,7"
          strokeDashoffset={5}
          fill="none"
          opacity={0.42}
        />
      </Svg>

      {/* ── Viñeta inferior: los bordes inferiores quedan más oscuros ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.30)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }}
      />

    </View>
  );
}

const FRAME = 26; // grosor del marco en px
const R     = 22; // radio de las esquinas interiores

/**
 * Marco de cuero envejecido que rodea toda la pantalla.
 * Usa SVG con fillRule="evenodd" para un marco sólido con esquinas interiores redondeadas.
 */
export function MarcoCuero() {
  const { width: W, height: H } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();

  // Ventana interior: empieza debajo de la safe area + margen del marco
  const ix = FRAME;
  const iy = safeTop + FRAME;
  const iw = W - FRAME * 2;
  const ih = H - iy - FRAME;

  // Rectángulo exterior (toda la pantalla, horario)
  const outer = `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`;

  // Rectángulo interior redondeado (antihorario = recorte "evenodd")
  const inner = [
    `M ${ix + R} ${iy}`,
    `L ${ix + iw - R} ${iy}`,
    `Q ${ix + iw} ${iy} ${ix + iw} ${iy + R}`,
    `L ${ix + iw} ${iy + ih - R}`,
    `Q ${ix + iw} ${iy + ih} ${ix + iw - R} ${iy + ih}`,
    `L ${ix + R} ${iy + ih}`,
    `Q ${ix} ${iy + ih} ${ix} ${iy + ih - R}`,
    `L ${ix} ${iy + R}`,
    `Q ${ix} ${iy} ${ix + R} ${iy} Z`,
  ].join(' ');

  const frame = `${outer} ${inner}`;
  const ST    = 6; // distancia de la costura al borde interior

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          {/* Gradiente horizontal igual que PanelCuero */}
          {/* colorInterpolation="sRGB" asegura que el SVG interpole igual que expo-linear-gradient */}
          {/* Sin esto, react-native-svg usa linearRGB por defecto → el borde aparece más claro en móvil */}
          <SvgGradient id="cuero" x1="0" y1="0" x2="1" y2="0" colorInterpolation="sRGB">
            <Stop offset="0%"   stopColor="#3A1608" />
            <Stop offset="8%"   stopColor="#7A3C18" />
            <Stop offset="38%"  stopColor="#A05530" />
            <Stop offset="62%"  stopColor="#9A5028" />
            <Stop offset="92%"  stopColor="#7A3C18" />
            <Stop offset="100%" stopColor="#3A1608" />
          </SvgGradient>
          {/* Sheen: destello de luz cálida sobre el cuero */}
          <SvgGradient id="sheen" x1="0.5" y1="0" x2="0.5" y2="1" colorInterpolation="sRGB">
            <Stop offset="0%"   stopColor="rgba(255,190,120,0.20)" />
            <Stop offset="40%"  stopColor="rgba(255,190,120,0.06)" />
            <Stop offset="100%" stopColor="rgba(255,190,120,0)" />
          </SvgGradient>
        </Defs>

        {/* Cuero base */}
        <Path d={frame} fillRule="evenodd" fill="url(#cuero)" />
        {/* Sheen sobre el cuero */}
        <Path d={frame} fillRule="evenodd" fill="url(#sheen)" />

        {/* Costura doble — sobre el cuero superior (encima de la ventana) */}
        <Path d={`M ${ix + R} ${iy - ST} L ${ix + iw - R} ${iy - ST}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="10,7" fill="none" opacity={0.82} />
        <Path d={`M ${ix + R} ${iy - ST - 9} L ${ix + iw - R} ${iy - ST - 9}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="10,7" strokeDashoffset={5} fill="none" opacity={0.42} />

        {/* Costura lateral izquierda — sobre el cuero, a la izquierda de la ventana */}
        <Path d={`M ${ix - ST} ${iy + R} L ${ix - ST} ${iy + ih - R}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="8,6" fill="none" opacity={0.75} />

        {/* Costura lateral derecha — sobre el cuero, a la derecha de la ventana */}
        <Path d={`M ${ix + iw + ST} ${iy + R} L ${ix + iw + ST} ${iy + ih - R}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="8,6" fill="none" opacity={0.75} />

        {/* Sombra interior — profundidad en el borde de la ventana */}
        <Path d={frame} fillRule="evenodd"
          fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={4} />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
});
