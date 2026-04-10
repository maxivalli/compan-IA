import { Perfil } from './memoria';
import { Dispositivo } from '../lib/smartthings';

export type RositaSystemPayload = {
  version: 'v1';
  perfil: {
    nombreAbuela: string;
    nombreAsistente?: string;
    vozGenero: 'femenina' | 'masculina';
    generoUsuario?: 'femenino' | 'masculino';
    edad?: number;
    familiares: string[];
    gustos: string[];
    medicamentos: string[];
    fechasImportantes: string[];
    recuerdos: string[];
    fechaNacimiento?: string;
    condicionFisica?: string;
  };
  dispositivos: Array<{
    id: string;
    nombre: string;
    tipo: string;
    online: boolean;
    estado?: boolean;
  }>;
  climaTexto: string;
  extraTemporal?: string;
  ciudad?: string | null;
  coords?: { lat: number; lon: number } | null;
  memoriaEpisodica?: string;
  seguimientos?: string;
};

export function buildRositaSystemPayload(params: {
  perfil: Perfil;
  dispositivos?: Dispositivo[];
  climaTexto: string;
  extraTemporal?: string;
  ciudad?: string | null;
  coords?: { lat: number; lon: number } | null;
  memoriaEpisodica?: string;
  seguimientos?: string;
}): RositaSystemPayload {
  const { perfil, dispositivos = [], climaTexto, extraTemporal = '', ciudad = null, coords = null, memoriaEpisodica = '', seguimientos = '' } = params;
  return {
    version: 'v1',
    perfil: {
      nombreAbuela: perfil.nombreAbuela,
      nombreAsistente: perfil.nombreAsistente,
      vozGenero: perfil.vozGenero,
      generoUsuario: perfil.generoUsuario,
      edad: perfil.edad,
      familiares: [...(perfil.familiares ?? [])],
      gustos: [...(perfil.gustos ?? [])],
      medicamentos: [...(perfil.medicamentos ?? [])],
      fechasImportantes: [...(perfil.fechasImportantes ?? [])],
      recuerdos: [...(perfil.recuerdos ?? [])],
      fechaNacimiento: perfil.fechaNacimiento,
      condicionFisica: perfil.condicionFisica,
    },
    dispositivos: dispositivos.map(d => ({
      id: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      online: d.online,
      estado: d.estado,
    })),
    climaTexto,
    extraTemporal,
    ciudad,
    coords,
    memoriaEpisodica,
    seguimientos,
  };
}
