import { useEffect, useState } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Perfil,
  EntradaAnimo,
  yaRecordo,
  marcarRecordado,
  cargarRecordatorios,
  borrarRecordatoriosViejos,
  cargarEntradasAnimo,
  cargarHistorial,
  musicaEscuchadaHoy,
  limpiarHistorialAnimo,
} from '../lib/memoria';
import { ModoNoche } from '../components/RosaOjos';
import { enviarAlertaTelegram, enviarMensajeTelegram, recibirMensajesVoz, obtenerUrlArchivo, MensajeVoz } from '../lib/telegram';

import { llamarClaude, transcribirAudio, obtenerComandosPendientes } from '../lib/ai';
import { tonoSegunEdad } from '../lib/claudeParser';

// ── Tipos de los refs que el hook necesita ────────────────────────────────────

export type NotificacionesRefs = {
  perfilRef:             React.RefObject<Perfil | null>;
  estadoRef:             React.RefObject<'esperando' | 'escuchando' | 'pensando' | 'hablando'>;
  noMolestarRef:         React.RefObject<boolean>;
  modoNocheRef:          React.RefObject<ModoNoche>;
  ultimaActividadRef:    React.RefObject<number>;
  ultimaCharlaRef:       React.RefObject<number>;
  alertaInactividadRef:  React.RefObject<number>;
  telegramOffsetRef:     React.RefObject<number>;
  inicioSesionRef:       React.RefObject<number>;
  climaRef:              React.RefObject<string>;
  setEstado:             (s: 'esperando' | 'escuchando' | 'pensando' | 'hablando') => void;
  hablar:                (texto: string) => Promise<void>;
  iniciarSpeechRecognition: () => void;
  modoNoche:             ModoNoche;
  musicaActivaRef:       React.RefObject<boolean>;
  enFlujoVozRef:         React.RefObject<boolean>;
  pararMusica:           () => void;
  iniciarSilbido:        () => void;
  detenerSilbido:        () => void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificaciones(refs: NotificacionesRefs, player: ReturnType<typeof useAudioPlayer>) {
  const {
    perfilRef, estadoRef, noMolestarRef, modoNocheRef,
    ultimaActividadRef, ultimaCharlaRef, alertaInactividadRef,
    telegramOffsetRef, inicioSesionRef, climaRef,
    setEstado, hablar, iniciarSpeechRecognition,
    modoNoche, musicaActivaRef, enFlujoVozRef, pararMusica, iniciarSilbido, detenerSilbido,
  } = refs;

  // Grabador para respuestas de voz
  const recorderResp = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ── Escuchar una respuesta de sí/no por voz ────────────────────────────────
  async function escucharRespuesta(): Promise<string> {
    try {
      ExpoSpeechRecognitionModule.stop();
      await new Promise(resolve => setTimeout(resolve, 400));

      setEstado('escuchando');
      estadoRef.current = 'escuchando';

      await recorderResp.prepareToRecordAsync();
      recorderResp.record();

      // Esperar hasta 8 segundos, pero cortar antes si el recorder ya terminó
      await new Promise<void>(resolve => {
        let elapsed = 0;
        const check = setInterval(() => {
          elapsed += 300;
          if (elapsed >= 8000) { clearInterval(check); resolve(); }
        }, 300);
      });

      await recorderResp.stop();
      const uri = recorderResp.uri;

      setEstado('pensando');
      estadoRef.current = 'pensando';

      if (!uri) return '';

      const texto = await transcribirAudio(uri);
      return texto.toLowerCase();
    } catch {
      return '';
    } finally {
      setEstado('esperando');
      estadoRef.current = 'esperando';
    }
  }

  function esAfirmativo(texto: string): boolean {
    return /\bsi\b|sí|dale|bueno|claro|ok|obvio|por supuesto|quiero|quiero contestar/.test(texto);
  }

  function esNegativo(texto: string): boolean {
    return /\bno\b|nop|ahora no|dejá|deja|no quiero/.test(texto);
  }

  // ── Grabar y transcribir respuesta para mandar por Telegram ──────────────────
  async function grabarYMandarRespuesta(chatId: string, nombreContacto: string, nombreAbuela: string): Promise<void> {
    await hablar('Dale, te escucho. Hablá cuando quieras.');

    try {
      setEstado('escuchando');
      estadoRef.current = 'escuchando';
      await recorderResp.prepareToRecordAsync();
      recorderResp.record();

      // Esperar hasta 10 segundos para dar tiempo a usuarios mayores
      await new Promise<void>(resolve => {
        let elapsed = 0;
        const check = setInterval(() => {
          elapsed += 300;
          if (elapsed >= 10000) { clearInterval(check); resolve(); }
        }, 300);
      });

      await recorderResp.stop();
      const uri = recorderResp.uri;

      if (!uri) {
        await hablar('No pude grabar el mensaje, perdoname.');
        return;
      }

      setEstado('pensando');
      estadoRef.current = 'pensando';

      const texto = await transcribirAudio(uri);

      if (!texto) {
        await hablar('No te escuché bien, no pude mandar el mensaje.');
        return;
      }

      // Mandar como mensaje de texto por Telegram
      await enviarAlertaTelegram(
        [chatId],
        `Mensaje de ${nombreAbuela}: "${texto}"`,
        perfilRef.current?.nombreAsistente,
      );

      await hablar(`Listo, le mandé tu mensaje a ${nombreContacto}.`);
    } catch {
      await hablar('Hubo un problema al mandar el mensaje, perdoname.');
    } finally {
      enFlujoVozRef.current = false;
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
  }

  // ── Flujo completo de mensaje de voz entrante ─────────────────────────────────
  async function manejarMensajeVoz(
    urlAudio: string,
    nombre: string,
    chatId: string,
    nombreAbuela: string,
  ): Promise<boolean> {
    enFlujoVozRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    // Pausar música si está activa
    const habiaMusica = musicaActivaRef.current;
    if (habiaMusica) pararMusica();

    let resultado = false;
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Verificar presencia
      await hablar(`¿Estás por ahí, ${nombreAbuela}?`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuestaPresencia = await escucharRespuesta();

      if (!respuestaPresencia || esNegativo(respuestaPresencia)) {
        return false;
      }

      // 2. Anunciar el mensaje
      await hablar(`Te llegó un mensaje de voz de ${nombre}.`);
      await new Promise(resolve => setTimeout(resolve, 800));

      // 3. Reproducir el audio
      try {
        player.replace({ uri: urlAudio });
        await new Promise(resolve => setTimeout(resolve, 1500));
        player.play();

        await new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, 45000);
          let lastPos = -1;
          let stallCount = 0;
          const interval = setInterval(() => {
            const pos = player.currentTime ?? 0;
            const dur = player.duration ?? 0;
            if (dur > 0.5 && pos >= dur - 0.5) {
              clearInterval(interval); clearTimeout(timeout); resolve();
              return;
            }
            if (pos === lastPos) {
              stallCount++;
              if (stallCount >= 10 && pos > 0.5) {
                clearInterval(interval); clearTimeout(timeout); resolve();
              }
            } else {
              stallCount = 0;
            }
            lastPos = pos;
          }, 300);
        });
      } catch {}

      // 4. Ofrecer contestar
      await new Promise(resolve => setTimeout(resolve, 500));
      await hablar(`¿Querés contestarle a ${nombre}?`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuestaContestar = await escucharRespuesta();

      if (esAfirmativo(respuestaContestar)) {
        await grabarYMandarRespuesta(chatId, nombre, nombreAbuela);
      } else {
        await hablar('Bueno, cuando quieras contestarle me avisás.');
      }
      resultado = true;
    } catch {
      // Error inesperado — el finally se encarga de liberar el flag
    } finally {
      // Garantiza que el flag siempre se libera, sin importar qué pasó
      enFlujoVozRef.current = false;
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
    return resultado;
  }

  // ── Chequear pendientes al desactivar no molestar ───────────────────────────
  async function chequearPendientesAlActivar(): Promise<void> {
    const p = perfilRef.current;
    if (!p) return;
    try {
      const raw = await AsyncStorage.getItem('vozPendiente');
      if (!raw) return;
      let todos: { fileId: string; chatId: string; fromName: string; timestamp: number }[] = [];
      try { todos = JSON.parse(raw); } catch { await AsyncStorage.removeItem('vozPendiente'); return; }
      const hace20h = Date.now() - 20 * 60 * 60 * 1000;
      const vigentes = todos.filter(m => m.timestamp > hace20h);
      if (!vigentes.length) { await AsyncStorage.removeItem('vozPendiente'); return; }

      const cantidad = vigentes.length;
      const texto = cantidad === 1
        ? 'Tenés un mensaje de voz sin escuchar.'
        : `Tenés ${cantidad} mensajes de voz sin escuchar.`;

      await hablar(texto);

      // Procesar el primero
      const [primero, ...resto] = vigentes;
      const urlAudio = await obtenerUrlArchivo(primero.fileId);
      if (!urlAudio) {
        await AsyncStorage.setItem('vozPendiente', JSON.stringify(resto));
        return;
      }

      await AsyncStorage.setItem('vozPendiente', JSON.stringify(resto));
      const contacto = (p.telegramContactos ?? []).find(c => c.id === primero.chatId);
      const nombre   = contacto?.nombre ?? primero.fromName;
      await manejarMensajeVoz(urlAudio, nombre, primero.chatId, p.nombreAbuela);
    } catch {}
  }

  // ── Generar cuerpo del resumen diario ────────────────────────────────────
  async function generarMensajeResumen(p: Perfil): Promise<string> {
    const entradas = await cargarEntradasAnimo();
    function fechaLocal(ts: number): string {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const hoy = fechaLocal(Date.now());
    const entradasHoy = entradas.filter((e: EntradaAnimo) => fechaLocal(e.timestamp) === hoy);
    const EMOJIS: Record<string, string> = {
      feliz: '😊 Contenta', triste: '😢 Triste', sorprendida: '😮 Sorprendida',
      pensativa: '🤔 Pensativa', neutral: '😐 Tranquila',
    };
    let animoLineas = 'sin registros';
    if (entradasHoy.length > 0) {
      const conteo: Record<string, number> = {};
      for (const e of entradasHoy) {
        const label = EMOJIS[e.expresion];
        if (!label) continue;
        conteo[e.expresion] = (conteo[e.expresion] ?? 0) + 1;
      }
      animoLineas = Object.entries(conteo)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  ${EMOJIS[k]}: ${v > 10 ? '+10' : v}`)
        .join('\n');
    }

    const historial = await cargarHistorial();
    const mensajesUsuario = historial.filter(m => m.role === 'user').map(m => m.content).slice(-10);
    let temasTexto = 'sin conversaciones hoy';
    if (mensajesUsuario.length > 0) {
      try {
        temasTexto = await llamarClaude({
          maxTokens: 80,
          system: 'Resumí en una sola línea corta los temas principales de estos mensajes de una señora mayor. Sin puntuación al final. Solo los temas, sin nombres propios. Máximo 15 palabras.',
          messages: [{ role: 'user', content: mensajesUsuario.join(' | ') }],
        }) || 'conversación general';
      } catch {
        temasTexto = `${mensajesUsuario.length} mensajes`;
      }
    }

    const minActiva = Math.round((Date.now() - inicioSesionRef.current) / 1000 / 60);
    const horasActiva = minActiva >= 60
      ? `${Math.floor(minActiva / 60)}h ${minActiva % 60}min`
      : `${minActiva} minutos`;

    const escuchodMusica = await musicaEscuchadaHoy();

    const alertasHoy = historial
      .filter(m => m.role === 'assistant' && /avisé a tu familia|avisando a tu familia/i.test(m.content))
      .length;

    const todosRec = await cargarRecordatorios();
    const recPendientes = todosRec.filter(r => r.fechaISO >= hoy).length;

    const enNoMolestar = noMolestarRef.current;

    const asistente = p.nombreAsistente ?? 'Rosita';
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
      `📋 <b>Resumen del día de ${p.nombreAbuela}</b>\n` +
      `<i>${fecha}</i>\n\n` +
      `😊 <b>Estado de ánimo:</b>\n${animoLineas}\n\n` +
      `💬 <b>Temas del día:</b> ${temasTexto}\n\n` +
      `🎵 <b>Música:</b> ${escuchodMusica ? 'Sí escuchó música' : 'No escuchó música'}\n\n` +
      `⏱ <b>Tiempo con ${asistente}:</b> ${horasActiva}` +
      (alertasHoy > 0 ? `\n\n🚨 <b>Alertas enviadas:</b> ${alertasHoy}` : '') +
      (recPendientes > 0 ? `\n\n⏰ <b>Recordatorios pendientes:</b> ${recPendientes}` : '') +
      (enNoMolestar ? `\n\n🔇 <b>Modo no molestar:</b> activo al cierre del día` : '')
    );
  }

  // ── Recordatorio de medicamentos ────────────────────────────────────────────
  useEffect(() => {
    function parsearHoraMed(med: string): number | null {
      const m = med.match(/(\d{1,2})(?::(\d{2}))?\s*h/i);
      if (!m) return null;
      return parseInt(m[1], 10);
    }

    async function chequearMedicamentos() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const horaActualVal = new Date().getHours();
      const minActual = new Date().getMinutes();
      if (minActual > 5) return;

      for (const med of p.medicamentos) {
        const hora = parsearHoraMed(med);
        if (hora === null || hora !== horaActualVal) continue;
        const clave = `med_${med}`;
        const ya = await yaRecordo(clave);
        if (ya) continue;
        await marcarRecordado(clave);
        const nombre = med.split(/\s+/)[0];
        await hablar(`${p.nombreAbuela}, es hora de tomar el ${nombre}.`);
        break;
      }
    }

    const id = setInterval(chequearMedicamentos, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Felicitaciones por fechas importantes ───────────────────────────────────
  useEffect(() => {
    function parsearFecha(texto: string): { dia: number; mes: number } | null {
      const MESES: Record<string, number> = {
        enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
        julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
      };
      const m = texto.toLowerCase().match(/(\d{1,2})\s+(\w+)/);
      if (!m) return null;
      const mes = MESES[m[2]];
      if (!mes) return null;
      return { dia: parseInt(m[1], 10), mes };
    }

    async function chequearFechas() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      const ahora = new Date();
      // Desfasado 2 minutos respecto al saludoMatutino (9:00-9:05) para no pisarse
      if (ahora.getHours() !== 9 || ahora.getMinutes() < 2 || ahora.getMinutes() > 7) return;

      for (const fecha of p.fechasImportantes) {
        const parsed = parsearFecha(fecha);
        if (!parsed) continue;
        if (parsed.dia !== ahora.getDate() || parsed.mes !== ahora.getMonth() + 1) continue;
        const clave = `fecha_${fecha}`;
        const ya = await yaRecordo(clave);
        if (ya) continue;
        await marcarRecordado(clave);
        try {
          const frase = await llamarClaude({
            maxTokens: 80,
            system: `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Generás UNA sola frase corta y cálida recordando una fecha especial. Respondé SOLO con la frase, sin etiquetas.`,
            messages: [{ role: 'user', content: `Hoy es: ${fecha}. Generá un recordatorio cálido para ${p.nombreAbuela}.` }],
          });
          if (frase && estadoRef.current === 'esperando') await hablar(frase);
        } catch {}
        break;
      }
    }

    const id = setInterval(chequearFechas, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Cumpleaños ───────────────────────────────────────────────────────────────
  const [esCumpleaños, setEsCumpleaños] = useState(false);
  const playerCumple = useAudioPlayer(require('../assets/audio/0319.mp3'));

  // Detecta si hoy es el cumpleaños al montar (para mostrar globos todo el día)
  useEffect(() => {
    (async () => {
      const p = perfilRef.current;
      if (!p?.fechaNacimiento) return;
      const ahora = new Date();
      const [mm, dd] = p.fechaNacimiento.split('-').map(Number);
      if (ahora.getMonth() + 1 === mm && ahora.getDate() === dd) {
        setEsCumpleaños(true);
      }
    })();
  }, []);

  // Saludo especial de cumpleaños a las 9am (reemplaza al saludo matutino)
  useEffect(() => {
    async function cumpleañosMatutino() {
      const p = perfilRef.current;
      if (!p?.fechaNacimiento) return;
      if (noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const ahora = new Date();
      if (ahora.getHours() !== 9 || ahora.getMinutes() > 8) return;
      const [mm, dd] = p.fechaNacimiento.split('-').map(Number);
      if (ahora.getMonth() + 1 !== mm || ahora.getDate() !== dd) return;
      const clave = `cumple_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      setEsCumpleaños(true);
      // Reproduce audio de cumpleaños
      try {
        playerCumple.seekTo(0);
        playerCumple.play();
        // Espera que termine (max 90s) o que deje de reproducir
        await new Promise<void>(resolve => {
          let ticks = 0;
          const check = setInterval(() => {
            ticks++;
            if (!playerCumple.playing || ticks > 180) { clearInterval(check); resolve(); }
          }, 500);
        });
      } catch {}
      // Saludo de cumpleaños con Claude
      try {
        const frase = await llamarClaude({
          maxTokens: 120,
          system: `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Hoy es el cumpleaños de ${p.nombreAbuela}. Generá UN saludo de cumpleaños breve, muy cálido y emotivo. No menciones la edad que cumple. Sin etiquetas, solo la frase.`,
          messages: [{ role: 'user', content: `Deseale un feliz cumpleaños a ${p.nombreAbuela} con mucho cariño.` }],
        });
        if (frase && estadoRef.current === 'esperando') await hablar(frase);
      } catch {}
    }

    const id = setInterval(cumpleañosMatutino, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Saludo matutino con fecha y clima ───────────────────────────────────────
  useEffect(() => {
    async function saludoMatutino() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const ahora = new Date();
      if (ahora.getHours() !== 9 || ahora.getMinutes() > 5) return;
      const clave = `saludo_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const dia   = diasSemana[ahora.getDay()];
      const fecha = `${ahora.getDate()} de ${meses[ahora.getMonth()]}`;
      try {
        const frase = await llamarClaude({
          maxTokens: 100,
          system: `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Generás UN saludo matutino breve y cálido que incluya el día, la fecha y una mención al clima. Respondé SOLO con la frase, sin etiquetas.`,
          messages: [{ role: 'user', content: `Hoy es ${dia} ${fecha}. ${climaRef.current} Saludá a ${p.nombreAbuela} con buenos días.` }],
        });
        if (frase && estadoRef.current === 'esperando') await hablar(frase);
      } catch {}
    }

    const id = setInterval(saludoMatutino, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Recordatorios personales ─────────────────────────────────────────────────
  useEffect(() => {
    async function chequearRecordatorios() {
      if (noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const hoy = new Date().toISOString().slice(0, 10);
      const todos = await cargarRecordatorios();
      const pendientes = todos.filter(r => r.fechaISO === hoy);
      for (const r of pendientes) {
        const clave = `recordatorio_${r.id}`;
        const ya = await yaRecordo(clave);
        if (ya) continue;
        await marcarRecordado(clave);
        const nombre = perfilRef.current?.nombreAbuela ?? '';
        await hablar(`${nombre}, te recuerdo que hoy tenés que ${r.texto}.`);
        break;
      }
    }

    borrarRecordatoriosViejos().catch(() => {});
    const id = setInterval(chequearRecordatorios, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Alerta de inactividad ───────────────────────────────────────────────────
  useEffect(() => {
    const HORAS_INACTIVIDAD = 4;
    async function chequearInactividad() {
      if (noMolestarRef.current) return;
      const hora = new Date().getHours();
      if (hora < 9 || hora >= 21) return;
      const minutosInactiva = (Date.now() - ultimaActividadRef.current) / 1000 / 60;
      if (minutosInactiva < HORAS_INACTIVIDAD * 60) return;
      if (Date.now() - alertaInactividadRef.current < 2 * 60 * 60 * 1000) return;
      alertaInactividadRef.current = Date.now();
      const p = perfilRef.current;
      if (!p) return;
      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;
      const nombre = p.nombreAbuela ?? 'Tu abuela';
      const horas  = Math.floor(minutosInactiva / 60);
      enviarAlertaTelegram(chatIds, `ℹ️ ${nombre} no interactuó con ${p.nombreAsistente ?? 'Rosita'} hace más de ${horas} horas.`, p.nombreAsistente);
    }

    const id = setInterval(chequearInactividad, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Polling de mensajes de voz de Telegram ──────────────────────────────────
  useEffect(() => {
    const INTERVALO_REINTENTO = 15 * 60 * 1000; // 15 minutos

    async function procesarMensaje(msg: MensajeVoz, p: Perfil): Promise<boolean> {
      const contacto  = (p.telegramContactos ?? []).find(c => c.id === msg.chatId);
      const nombre    = contacto?.nombre ?? msg.fromName;
      const urlAudio  = await obtenerUrlArchivo(msg.fileId);
      if (!urlAudio) return false;

      const hora = new Date().getHours();
      const horarioNocturno = hora >= 22 || hora < 9;
      const dormida = modoNocheRef.current === 'durmiendo' || modoNocheRef.current === 'soñolienta';

      if (horarioNocturno || dormida || noMolestarRef.current) {
        return false; // dejar en cola pendiente
      }

      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') {
        await new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, 15000); // máximo 15s de espera
          const check = setInterval(() => {
            if (estadoRef.current === 'esperando') { clearInterval(check); clearTimeout(timeout); resolve(); }
          }, 500);
        });
      }

      // manejarMensajeVoz se encarga de verificar presencia internamente
      const respondio = await manejarMensajeVoz(urlAudio, nombre, msg.chatId, p.nombreAbuela);
      return respondio;
    }

    async function chequearMensajesVoz() {
      const estadoActual = estadoRef.current as string;
      if (estadoActual === 'hablando' || estadoActual === 'pensando') return;

      const p = perfilRef.current;
      if (!p) return;

      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;

      const mensajes = await recibirMensajesVoz(telegramOffsetRef, chatIds);
      if (!mensajes.length) return;

      for (const msg of mensajes) {
        const procesado = await procesarMensaje(msg, p);
        if (!procesado) {
          // Guardar en cola pendiente para reintentar
          const rawP = await AsyncStorage.getItem('vozPendiente');
          let pendientes: any[] = [];
          try { pendientes = JSON.parse(rawP ?? '[]'); } catch { pendientes = []; }
          // Evitar duplicados
          const yaEsta = pendientes.some((m: any) => m.fileId === msg.fileId);
          if (!yaEsta) {
            pendientes.push({
              fileId:    msg.fileId,
              chatId:    msg.chatId,
              fromName:  msg.fromName,
              timestamp: Date.now(),
            });
          }
          const hace20h = Date.now() - 20 * 60 * 60 * 1000;
          await AsyncStorage.setItem('vozPendiente', JSON.stringify(
            pendientes.filter((m: any) => m.timestamp > hace20h)
          ));
        }
        break; // procesar de a uno por vez
      }
    }

    async function reintentar() {
      const estadoActual = estadoRef.current as string;
      if (estadoActual === 'hablando' || estadoActual === 'pensando') return;

      const hora = new Date().getHours();
      if (hora < 9 || hora >= 22) return;
      if (noMolestarRef.current) return;

      const p = perfilRef.current;
      if (!p) return;

      try {
        const raw = await AsyncStorage.getItem('vozPendiente');
        if (!raw) return;
        let todos: { fileId: string; chatId: string; fromName: string; timestamp: number }[] = [];
        try { todos = JSON.parse(raw); } catch { await AsyncStorage.removeItem('vozPendiente'); return; }
        const hace20h = Date.now() - 20 * 60 * 60 * 1000;
        const vigentes = todos.filter(m => m.timestamp > hace20h);
        if (!vigentes.length) { await AsyncStorage.removeItem('vozPendiente'); return; }

        const [primero, ...resto] = vigentes;
        const urlAudio = await obtenerUrlArchivo(primero.fileId);
        if (!urlAudio) {
          await AsyncStorage.setItem('vozPendiente', JSON.stringify(resto));
          return;
        }

        // Sacar de la cola y dejar que manejarMensajeVoz verifique presencia
        await AsyncStorage.setItem('vozPendiente', JSON.stringify(resto));

        const contacto = (p.telegramContactos ?? []).find(c => c.id === primero.chatId);
        const nombre   = contacto?.nombre ?? primero.fromName;
        const respondio = await manejarMensajeVoz(urlAudio, nombre, primero.chatId, p.nombreAbuela);

        // Si no respondió, volver a poner en la cola
        if (!respondio) {
          const rawActual = await AsyncStorage.getItem('vozPendiente');
          let actuales: any[] = [];
          try { actuales = JSON.parse(rawActual ?? '[]'); } catch { actuales = []; }
          actuales.unshift(primero);
          await AsyncStorage.setItem('vozPendiente', JSON.stringify(actuales));
        }
      } catch {}
    }

    async function chequearComandos() {
      const p = perfilRef.current;
      if (!p) return;
      const familiaId = await AsyncStorage.getItem('compania_familia_id');
      if (!familiaId) return;
      const comandos = await obtenerComandosPendientes(familiaId);
      for (const cmd of comandos) {
        if (cmd === 'informe') {
          const chatIds = (p.telegramContactos ?? []).map(c => c.id);
          if (!chatIds.length) continue;
          try {
            const mensaje = await generarMensajeResumen(p);
            await enviarMensajeTelegram(chatIds, mensaje);
          } catch {}
        }
      }
    }

    // Polling cada 3 min para mensajes nuevos y comandos pendientes
    const idPolling = setInterval(() => {
      chequearMensajesVoz();
      chequearComandos();
    }, 3 * 60 * 1000);
    // Reintento de pendientes cada 15 minutos
    const idReintento = setInterval(reintentar, INTERVALO_REINTENTO);

    return () => {
      clearInterval(idPolling);
      clearInterval(idReintento);
    };
  }, []);

  // ── Resumen diario a las 22hs ───────────────────────────────────────────────
  useEffect(() => {
    async function enviarResumenDiario() {
      const p = perfilRef.current;
      if (!p) return;
      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;
      const ahora = new Date();
      if (ahora.getHours() !== 22 || ahora.getMinutes() > 5) return;
      const clave = `resumen_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      const mensaje = await generarMensajeResumen(p);
      await enviarMensajeTelegram(chatIds, mensaje);
    }

    const id = setInterval(enviarResumenDiario, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Reseteo nocturno del historial de ánimo a las 23hs ──────────────────────
  useEffect(() => {
    async function resetearAnimo() {
      const ahora = new Date();
      if (ahora.getHours() !== 23 || ahora.getMinutes() > 5) return;
      const clave = `reset_animo_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      await limpiarHistorialAnimo();
    }

    const id = setInterval(resetearAnimo, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Timer de silbido ────────────────────────────────────────────────────────
  useEffect(() => {
    const DIEZ_MIN        = 10 * 60 * 1000;
    const ultimoSilbidoRef = { current: 0 };

    function puedeSilbar() {
      return estadoRef.current === 'esperando'
        && modoNoche === 'despierta'
        && !musicaActivaRef.current
        && !noMolestarRef.current
        && (Date.now() - ultimaCharlaRef.current) >= DIEZ_MIN;
    }

    async function seriedeSilbidos() {
      for (let i = 0; i < 3; i++) {
        if (!puedeSilbar()) break;
        iniciarSilbido();
        // Esperar que termine el audio (~4.5s en reproducirSilbido) + 500ms extra
        await new Promise(r => setTimeout(r, 5000));
        detenerSilbido();
        // Pausa entre silbidos
        if (i < 2) await new Promise(r => setTimeout(r, 3000));
      }
      ultimoSilbidoRef.current = Date.now();
    }

    const id = setInterval(() => {
      if (!puedeSilbar()) return;
      if ((Date.now() - ultimoSilbidoRef.current) < DIEZ_MIN) return;
      seriedeSilbidos();
    }, 30000); // chequea cada 30s

    return () => { clearInterval(id); detenerSilbido(); };
  }, [modoNoche]);

  async function triggerCumpleaños() {
    const p = perfilRef.current;
    setEsCumpleaños(true);
    try {
      playerCumple.seekTo(0);
      playerCumple.play();
      await new Promise<void>(resolve => {
        let ticks = 0;
        const check = setInterval(() => {
          ticks++;
          if (!playerCumple.playing || ticks > 180) { clearInterval(check); resolve(); }
        }, 500);
      });
    } catch {}
    try {
      const nombre = p?.nombreAbuela ?? 'vos';
      const frase = await llamarClaude({
        maxTokens: 120,
        system: `Sos ${p?.nombreAsistente ?? 'Rosita'}, ${p?.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${nombre}${p?.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p?.edad)} Hoy es el cumpleaños de ${nombre}. Generá UN saludo de cumpleaños breve, muy cálido y emotivo. No menciones la edad que cumple. Sin etiquetas, solo la frase.`,
        messages: [{ role: 'user', content: `Deseale un feliz cumpleaños a ${nombre} con mucho cariño.` }],
      });
      if (frase && estadoRef.current === 'esperando') await hablar(frase);
    } catch {}
    // En el test, apagar los globos al terminar para poder retestearlo
    setEsCumpleaños(false);
  }

  return { chequearPendientesAlActivar, esCumpleaños, triggerCumpleaños };
}