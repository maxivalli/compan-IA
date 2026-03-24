import { useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import type { Lista } from '../lib/memoria';

type Props = {
  visible:   boolean;
  listas:    Lista[];
  onBorrar:  (nombre: string) => void;
  onClose:   () => void;
};

export default function ListasModal({ visible, listas, onBorrar, onClose }: Props) {
  const [tabIndex, setTabIndex] = useState(0);

  const lista = listas[tabIndex] ?? null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.backdrop}>
        <View style={s.sheet}>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.titulo}>Mis listas</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={s.cerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          {listas.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll}>
              <View style={s.tabs}>
                {listas.map((l, i) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[s.tab, i === tabIndex && s.tabActivo]}
                    onPress={() => setTabIndex(i)}
                  >
                    <Text style={[s.tabTexto, i === tabIndex && s.tabTextoActivo]}>
                      {l.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Contenido */}
          {lista ? (
            <>
              <Text style={s.nombreLista}>{lista.nombre}</Text>
              <ScrollView style={s.items} contentContainerStyle={{ paddingBottom: 20 }}>
                {lista.items.length === 0 ? (
                  <Text style={s.vacio}>Lista vacía</Text>
                ) : (
                  lista.items.map((item, i) => (
                    <View key={i} style={s.item}>
                      <Text style={s.bullet}>•</Text>
                      <Text style={s.itemTexto}>{item}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity
                style={s.btnBorrar}
                onPress={() => {
                  onBorrar(lista.nombre);
                  setTabIndex(Math.max(0, tabIndex - 1));
                }}
              >
                <Text style={s.btnBorrarTexto}>Borrar esta lista</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={s.vacio}>No hay listas todavía. Pedile a Rosita que cree una.</Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  cerrar: {
    fontSize: 20,
    color: '#888',
    padding: 4,
  },
  tabsScroll: {
    marginBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  tabActivo: {
    backgroundColor: '#6C63FF',
  },
  tabTexto: {
    fontSize: 14,
    color: '#555',
    textTransform: 'capitalize',
  },
  tabTextoActivo: {
    color: '#fff',
    fontWeight: '600',
  },
  nombreLista: {
    fontSize: 18,
    fontWeight: '600',
    color: '#444',
    textTransform: 'capitalize',
    marginBottom: 12,
  },
  items: {
    flexGrow: 0,
    maxHeight: 300,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  bullet: {
    fontSize: 18,
    color: '#6C63FF',
    lineHeight: 24,
  },
  itemTexto: {
    fontSize: 17,
    color: '#333',
    flex: 1,
    lineHeight: 24,
  },
  vacio: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginVertical: 24,
  },
  btnBorrar: {
    marginTop: 16,
    marginBottom: 32,
    paddingVertical: 14,
    backgroundColor: '#ffeeee',
    borderRadius: 12,
    alignItems: 'center',
  },
  btnBorrarTexto: {
    fontSize: 15,
    color: '#d94040',
    fontWeight: '600',
  },
});
