import { View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

export function OvaloRosita({ faceScale = 1, screenW = 390, faceBottom = 0, esNoche = false }: {
  faceScale?: number;
  screenW?: number;
  faceBottom?: number;
  esNoche?: boolean;
}) {
  const W = Math.round(440 * faceScale);
  const H = Math.round(520 * faceScale);
  const left = Math.round((screenW - W) / 2);
  const top  = Math.round(faceBottom - H * 0.82);
  const pad = Math.round(W * 0.08);
  const cW  = W + pad * 2;
  const cH  = H + pad * 2;
  return (
    <View style={{ position: 'absolute', width: cW, height: cH, left: left - pad, top: top - pad, opacity: esNoche ? 0.45 : 1 }} pointerEvents="none">
      <Svg width={cW} height={cH}>
        <Defs>
          <RadialGradient id="ovaloGlow" cx="50%" cy="44%" rx="50%" ry="50%">
            <Stop offset="0%"   stopColor="#FFF6E8" stopOpacity="0.72" />
            <Stop offset="25%"  stopColor="#FFF6E8" stopOpacity="0.50" />
            <Stop offset="50%"  stopColor="#FFF6E8" stopOpacity="0.28" />
            <Stop offset="70%"  stopColor="#FFF6E8" stopOpacity="0.10" />
            <Stop offset="82%"  stopColor="#FFF6E8" stopOpacity="0.03" />
            <Stop offset="92%"  stopColor="#FFF6E8" stopOpacity="0"    />
            <Stop offset="100%" stopColor="#FFF6E8" stopOpacity="0"    />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cW / 2} cy={cH / 2} rx={W / 2} ry={H / 2} fill="url(#ovaloGlow)" />
      </Svg>
    </View>
  );
}
