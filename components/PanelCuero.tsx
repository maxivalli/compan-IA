import { View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

export function OvaloRosita({ faceScale = 1, screenW = 390, faceBottom = 0 }: {
  faceScale?: number;
  screenW?: number;
  faceBottom?: number;
}) {
  const W = Math.round(440 * faceScale);
  const H = Math.round(520 * faceScale);
  const left = Math.round((screenW - W) / 2);
  const top  = Math.round(faceBottom - H * 0.82);
  return (
    <View style={{ position: 'absolute', width: W, height: H, left, top }} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="ovaloGlow" cx="50%" cy="44%" rx="50%" ry="50%">
            <Stop offset="0%"   stopColor="#FFF6E8" stopOpacity="0.72" />
            <Stop offset="25%"  stopColor="#FFF6E8" stopOpacity="0.50" />
            <Stop offset="50%"  stopColor="#FFF6E8" stopOpacity="0.28" />
            <Stop offset="70%"  stopColor="#FFF6E8" stopOpacity="0.12" />
            <Stop offset="85%"  stopColor="#FFF6E8" stopOpacity="0.04" />
            <Stop offset="100%" stopColor="#FFF6E8" stopOpacity="0"    />
          </RadialGradient>
        </Defs>
        <Ellipse cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2} fill="url(#ovaloGlow)" />
      </Svg>
    </View>
  );
}
