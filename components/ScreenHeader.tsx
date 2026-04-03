import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const primary    = '#0097b2';
const onPrimary  = '#ffffff';

type Props = {
  titulo:     string;
  eyebrow?:   string;
  subtitulo?: string;
  icono?:     string;   // Ionicons name shown on the right
  onBack?:    () => void;
};

export default function ScreenHeader({ titulo, eyebrow, subtitulo, icono, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goBack = onBack ?? (() => router.back());

  return (
    <View style={[s.header, { paddingTop: insets.top + 16 }]}>
      <Pressable
        onPress={goBack}
        style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
        android_ripple={{ color: '#ffffff44', radius: 18, borderless: true }}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={24} color={onPrimary} />
      </Pressable>

      <View style={s.textos}>
        {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
        <Text style={s.titulo}>{titulo}</Text>
        {subtitulo ? <Text style={s.subtitulo}>{subtitulo}</Text> : null}
      </View>

      {icono ? (
        <Ionicons name={icono as any} size={28} color={onPrimary} style={{ opacity: 0.55, marginBottom: 2 }} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: primary,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    elevation: 2,
    shadowColor: primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  textos:    { flex: 1 },
  eyebrow:   { fontSize: 11, fontWeight: '500', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 2 },
  titulo:    { fontSize: 28, fontWeight: '300', color: onPrimary, letterSpacing: -0.3, lineHeight: 34 },
  subtitulo: { fontSize: 12, color: '#ffffffcc', marginTop: 3, letterSpacing: 0.2 },
});
