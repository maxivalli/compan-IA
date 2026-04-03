import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import RosaOjos, { BG } from '../components/RosaOjos';
import type { Expresion } from '../components/RosaOjos';
import ExpresionOverlay from '../components/ExpresionOverlay';
import type { ModoNoche } from '../components/RosaOjos';

const EXPRESIONES: Expresion[] = [
  'neutral', 'feliz', 'ternura', 'entusiasmada', 'triste', 'sorprendida',
  'pensativa', 'preocupada', 'chiste', 'enojada', 'avergonzada',
  'cansada', 'bostezando', 'mimada',
];

const ESTADOS = ['esperando', 'escuchando', 'pensando', 'hablando'] as const;
const MODOS: ModoNoche[] = ['despierta', 'soñolienta', 'durmiendo'];

export default function PruebaExpresiones() {
  const [expresion, setExpresion] = useState<Expresion>('neutral');
  const [estado, setEstado]       = useState<typeof ESTADOS[number]>('esperando');
  const [modoNoche, setModoNoche] = useState<ModoNoche>('despierta');

  return (
    <View style={s.contenedor}>
      {/* ── Cara — mismo contenedor que en index.tsx ── */}
      <View style={s.ojoContenedor}>
        <ExpresionOverlay
          capa="fondo"
          expresion={expresion}
          musicaActiva={false}
          modoNoche={modoNoche}
        />
        <RosaOjos
          estado={estado}
          expresion={expresion}
          modoNoche={modoNoche}
          bgColor={BG}
        />
        <ExpresionOverlay
          capa="frente"
          expresion={expresion}
          musicaActiva={false}
          modoNoche={modoNoche}
        />
      </View>

      <Text style={s.label}>{expresion} · {estado} · {modoNoche}</Text>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* Expresiones */}
        <Text style={s.seccion}>Expresiones</Text>
        <View style={s.fila}>
          {EXPRESIONES.map(e => (
            <TouchableOpacity
              key={e}
              style={[s.btn, expresion === e && s.btnActivo]}
              onPress={() => setExpresion(e)}
            >
              <Text style={[s.btnTxt, expresion === e && s.btnTxtActivo]}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Estados */}
        <Text style={s.seccion}>Estados</Text>
        <View style={s.fila}>
          {ESTADOS.map(st => (
            <TouchableOpacity
              key={st}
              style={[s.btn, estado === st && s.btnActivo]}
              onPress={() => setEstado(st)}
            >
              <Text style={[s.btnTxt, estado === st && s.btnTxtActivo]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Modo noche */}
        <Text style={s.seccion}>Modo noche</Text>
        <View style={s.fila}>
          {MODOS.map(m => (
            <TouchableOpacity
              key={m}
              style={[s.btn, modoNoche === m && s.btnActivo]}
              onPress={() => setModoNoche(m)}
            >
              <Text style={[s.btnTxt, modoNoche === m && s.btnTxtActivo]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: BG, alignItems: 'center', paddingTop: 60 },
  ojoContenedor: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible', marginTop: 120 },
  label:      { color: '#ffffff88', fontSize: 13, marginBottom: 12 },
  scroll:     { paddingHorizontal: 16, paddingBottom: 40, alignItems: 'flex-start' },
  seccion:    { color: '#ffffff66', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  fila:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff33' },
  btnActivo:  { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  btnTxt:     { color: '#ffffffaa', fontSize: 13 },
  btnTxtActivo: { color: '#0D0D14', fontWeight: '600' },
});