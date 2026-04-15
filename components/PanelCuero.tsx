import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
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

// Paleta idéntica a PanelCuero — se declara aquí para compartirla fácilmente
const CUERO_COLORS  = ['#3A1608', '#7A3C18', '#A05530', '#9A5028', '#7A3C18', '#3A1608'] as const;
const CUERO_LOCS    = [0, 0.08, 0.38, 0.62, 0.92, 1] as const;
const HORIZ         = { start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } };

// Colores de los flancos verticales (porción izquierda/derecha de la misma paleta,
// ~6.5 % del ancho total ≈ FRAME px sobre un teléfono de ~390 dp)
// Interpolación entre stop 0 % (#3A1608) y stop 8 % (#7A3C18) al 81 % de ese tramo
const FLANCO_INNER  = '#6E3416';   // ~81 % entre #3A1608 y #7A3C18
const FLANCO_L      = [CUERO_COLORS[0], FLANCO_INNER] as const;
const FLANCO_R      = [FLANCO_INNER, CUERO_COLORS[0]] as const;

/**
 * Marco de cuero envejecido que rodea toda la pantalla.
 *
 * NOTA: La versión anterior usaba SVG fillRule="evenodd" + gradient fill, que
 * en Android (react-native-svg) no renderiza el relleno degradado — el path
 * queda transparente y se ve el fondo de la app en su lugar.
 * Esta versión usa expo-linear-gradient (igual que PanelCuero) para garantizar
 * colores idénticos en iOS y Android.
 */
export function MarcoCuero() {
  const { width: W, height: H } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();

  const ix = FRAME;
  const iy = safeTop + FRAME;   // top del área interior (debajo de status bar + marco)
  const iw = W - FRAME * 2;
  const ih = H - iy - FRAME;
  const ST = 6;                 // distancia costura → borde interior

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">

      {/* ── Franja superior (incluye zona de status bar + grosor del marco) ── */}
      <LinearGradient
        colors={CUERO_COLORS} locations={CUERO_LOCS}
        {...HORIZ}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: iy }}
      />

      {/* ── Franja inferior ── */}
      <LinearGradient
        colors={CUERO_COLORS} locations={CUERO_LOCS}
        {...HORIZ}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: FRAME }}
      />

      {/* ── Flanco izquierdo ── */}
      <LinearGradient
        colors={FLANCO_L}
        {...HORIZ}
        style={{ position: 'absolute', top: iy, left: 0, width: FRAME, height: ih }}
      />

      {/* ── Flanco derecho ── */}
      <LinearGradient
        colors={FLANCO_R}
        {...HORIZ}
        style={{ position: 'absolute', top: iy, right: 0, width: FRAME, height: ih }}
      />

      {/* ── Sheen: destello de luz cálida en el borde superior ── */}
      <LinearGradient
        colors={['rgba(255,190,120,0.18)', 'rgba(255,190,120,0.05)', 'rgba(255,190,120,0)']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: iy + 20 }}
      />

      {/* ── Sombra superior: transición suave entre el ojo y el marco ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: iy, left: FRAME, right: FRAME, height: 14 }}
      />

      {/* ── Costuras + sombra interior del borde de ventana (SVG — solo strokes, sin fills) ── */}
      <Svg width={W} height={H}>
        {/* Costura doble superior */}
        <Path d={`M ${ix + R} ${iy - ST} L ${ix + iw - R} ${iy - ST}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="10,7" fill="none" opacity={0.82} />
        <Path d={`M ${ix + R} ${iy - ST - 9} L ${ix + iw - R} ${iy - ST - 9}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="10,7" strokeDashoffset={5} fill="none" opacity={0.42} />

        {/* Costura izquierda */}
        <Path d={`M ${ix - ST} ${iy + R} L ${ix - ST} ${iy + ih - R}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="8,6" fill="none" opacity={0.75} />

        {/* Costura derecha */}
        <Path d={`M ${ix + iw + ST} ${iy + R} L ${ix + iw + ST} ${iy + ih - R}`}
          stroke="#D4906A" strokeWidth={1.5} strokeDasharray="8,6" fill="none" opacity={0.75} />

        {/* Sombra interior — profundidad en el borde de la ventana interior */}
        <Path
          d={[
            `M ${ix + R} ${iy}`,
            `L ${ix + iw - R} ${iy}`,
            `Q ${ix + iw} ${iy} ${ix + iw} ${iy + R}`,
            `L ${ix + iw} ${iy + ih - R}`,
            `Q ${ix + iw} ${iy + ih} ${ix + iw - R} ${iy + ih}`,
            `L ${ix + R} ${iy + ih}`,
            `Q ${ix} ${iy + ih} ${ix} ${iy + ih - R}`,
            `L ${ix} ${iy + R}`,
            `Q ${ix} ${iy} ${ix + R} ${iy}`,
          ].join(' ')}
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={4}
        />
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
