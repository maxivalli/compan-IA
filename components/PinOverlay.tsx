import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { eliminarPIN, obtenerPIN } from '../lib/memoria';

const M = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#b8eaf4',
  onPrimaryContainer: '#001f26',
  surface:          '#f5fafb',
  surfaceVariant:   '#dbe4e6',
  onSurface:        '#171d1e',
  onSurfaceVariant: '#3f484a',
  outline:          '#6f797a',
  error:            '#ba1a1a',
};

type Modo = 'verificar' | 'crear' | 'cambiar';

type Props = {
  modo: Modo;
  onSuccess: (pin: string) => void;
  onCancel?: () => void;
};

export default function PinOverlay({ modo, onSuccess, onCancel }: Props) {
  const [digitos,  setDigitos]  = useState('');
  const [confirma, setConfirma] = useState('');
  const [fase,     setFase]     = useState<'entrada' | 'confirmar'>('entrada');
  const [error,    setError]    = useState('');
  const [intentos, setIntentos] = useState(0);
  const shake        = useRef(new Animated.Value(0)).current;
  const evalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (evalTimerRef.current) clearTimeout(evalTimerRef.current);
  }, []);

  function sacudir() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.sequence([
      Animated.timing(shake, { toValue: 10,  duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,   duration: 40, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 40, useNativeDriver: true }),
    ]).start();
  }

  function presionar(d: string) {
    const actual = fase === 'confirmar' ? confirma : digitos;
    if (actual.length >= 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nuevo = actual + d;
    fase === 'confirmar' ? setConfirma(nuevo) : setDigitos(nuevo);
    if (nuevo.length === 4) { evalTimerRef.current = setTimeout(() => evaluar(nuevo), 120); }
  }

  function borrar() {
    if (fase === 'confirmar') setConfirma(c => c.slice(0, -1));
    else setDigitos(d => d.slice(0, -1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setError('');
  }

  async function evaluar(valor: string) {
    if (modo === 'verificar') {
      const pin = await obtenerPIN();
      if (valor === pin) {
        onSuccess(valor);
      } else {
        const nuevosIntentos = intentos + 1;
        setIntentos(nuevosIntentos);
        setError(nuevosIntentos >= 3 ? 'PIN incorrecto. ¿Lo olvidaste?' : 'PIN incorrecto');
        setDigitos('');
        sacudir();
      }
      return;
    }
    if (fase === 'entrada') {
      setFase('confirmar');
      return;
    }
    if (valor === digitos) {
      onSuccess(digitos);
    } else {
      setError('Los PINs no coinciden');
      setDigitos(''); setConfirma(''); setFase('entrada');
      sacudir();
    }
  }

  function olvidePIN() {
    Alert.alert(
      '¿Olvidaste el PIN?',
      'Si eliminás el PIN, cualquiera podrá acceder a la configuración. ¿Querés continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar PIN y entrar',
          style: 'destructive',
          onPress: async () => {
            await eliminarPIN();
            onSuccess('');
          },
        },
      ]
    );
  }

  const actual = fase === 'confirmar' ? confirma : digitos;
  const titulo = modo === 'verificar'
    ? 'Ingresá tu PIN'
    : fase === 'confirmar'
      ? 'Confirmá el PIN'
      : 'Creá un PIN de 4 dígitos';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={st.backdrop}>
      <View style={st.card}>
        <Ionicons name="lock-closed-outline" size={32} color={M.primary} style={{ marginBottom: 12 }} />
        <Text style={st.titulo}>{titulo}</Text>
        {error !== '' && <Text style={st.error}>{error}</Text>}

        <Animated.View style={[st.dots, { transform: [{ translateX: shake }] }]}>
          {[0,1,2,3].map(i => (
            <View key={i} style={[st.dot, i < actual.length && st.dotActivo]} />
          ))}
        </Animated.View>

        <View style={st.teclado}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((t, i) => (
            <TouchableOpacity
              key={i}
              style={[st.tecla, t === '' && st.teclaVacia]}
              onPress={() => t === '⌫' ? borrar() : t !== '' ? presionar(t) : null}
              activeOpacity={t === '' ? 1 : 0.6}
              disabled={t === ''}
            >
              <Text style={st.teclaTexto}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {modo === 'verificar' && intentos >= 3 && (
          <TouchableOpacity onPress={olvidePIN} style={{ marginTop: 12 }}>
            <Text style={{ color: M.error, fontSize: 14, textDecorationLine: 'underline' }}>
              Olvidé mi PIN
            </Text>
          </TouchableOpacity>
        )}

        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={{ marginTop: 8 }}>
            <Text style={{ color: M.onSurfaceVariant, fontSize: 14 }}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
  card:    { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: 300, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
  titulo:  { fontSize: 16, fontWeight: '500', color: '#171d1e', marginBottom: 20 },
  error:   { fontSize: 13, color: '#ba1a1a', marginBottom: 12, marginTop: -8, textAlign: 'center' },
  dots:    { flexDirection: 'row', gap: 16, marginBottom: 28 },
  dot:     { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#6f797a' },
  dotActivo: { backgroundColor: '#0097b2', borderColor: '#0097b2' },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', width: 216, gap: 12 },
  tecla:   { width: 60, height: 60, borderRadius: 30, backgroundColor: '#dbe4e6', alignItems: 'center', justifyContent: 'center' },
  teclaVacia: { backgroundColor: 'transparent' },
  teclaTexto: { fontSize: 22, fontWeight: '400', color: '#171d1e' },
});
