import { useRef } from 'react';
import { Image, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = { onDone: () => void };

const SPLASH_BG = '#ffffff';
const LOGO_SIZE = 200;

/**
 * Misma apariencia que el splash nativo (app.json); después de hideAsync() anima
 * un pulso suave y un fade-out antes de mostrar la app.
 */
export function AnimatedSplash({ onDone }: Props) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const started = useRef(false);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const begin = () => {
    if (started.current) return;
    started.current = true;

    void SplashScreen.hideAsync()
      .catch(() => {})
      .then(() => {
        scale.value = withSequence(
          withTiming(1.06, { duration: 280 }),
          withTiming(1, { duration: 220 }),
        );
        opacity.value = withDelay(
          480,
          withTiming(0, { duration: 420 }, (finished) => {
            if (finished) runOnJS(onDone)();
          }),
        );
      });
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: SPLASH_BG,
        justifyContent: 'center',
        alignItems: 'center',
      }}
      onLayout={begin}
    >
      <Animated.View style={[fadeStyle, { justifyContent: 'center', alignItems: 'center' }]}>
        <Animated.View style={logoStyle}>
          <Image
            source={require('../assets/images/splash-icon.png')}
            style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
