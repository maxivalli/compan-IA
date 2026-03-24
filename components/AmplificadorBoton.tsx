import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useEffect } from 'react';

type Props = {
  activo:           boolean;
  esBluetooth:      boolean;
  etiquetaGanancia: string;
  onToggle:         () => void;
  onNivel:          () => void;
  oscuro?:          boolean;
};

export default function AmplificadorBoton({
  activo, esBluetooth, etiquetaGanancia, onToggle, onNivel, oscuro,
}: Props) {
  // Pulso suave cuando está activo
  const pulso = useRef(new Animated.Value(1)).current;
  const loop  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loop.current?.stop();
    if (activo) {
      loop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulso, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulso, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      );
      loop.current.start();
    } else {
      pulso.setValue(1);
    }
    return () => loop.current?.stop();
  }, [activo]);

  const bgColor   = activo ? '#10B981' : oscuro ? '#1a1f2e' : '#ffffff22';
  const iconColor = activo ? '#ffffff' : '#ffffffbb';
  const labelColor = activo ? '#ffffff' : '#ffffffaa';

  return (
    <View style={s.wrap}>
      {/* Botón principal — enciende/apaga */}
      <Animated.View style={{ transform: [{ scale: pulso }] }}>
        <TouchableOpacity
          style={[s.boton, { backgroundColor: bgColor }]}
          onPress={onToggle}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activo ? 'headset' : 'headset-outline'}
            size={20}
            color={iconColor}
          />
          {activo && (
            <Text style={[s.estado, { color: labelColor }]}>ON</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Selector de nivel — solo visible cuando activo */}
      {activo && (
        <TouchableOpacity style={s.nivelBoton} onPress={onNivel} activeOpacity={0.75}>
          <Text style={s.nivelTexto}>{etiquetaGanancia}</Text>
        </TouchableOpacity>
      )}

      {/* Advertencia Bluetooth */}
      {activo && esBluetooth && (
        <View style={s.btWarn}>
          <Ionicons name="bluetooth" size={10} color="#FCD34D" />
          <Text style={s.btTexto}>BT</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  estado: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nivelBoton: {
    backgroundColor: '#10B98133',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#10B98155',
  },
  nivelTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  btWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FCD34D22',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  btTexto: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FCD34D',
  },
});
