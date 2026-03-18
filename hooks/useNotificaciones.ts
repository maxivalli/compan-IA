import { useEffect } from 'react';
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
} from '../lib/memoria';
import { ModoNoche } from '../components/RosaOjos';
import { enviarAlertaTelegram, enviarMensajeTelegram, recibirMensajesVoz, obtenerUrlArchivo, MensajeVoz } from '../lib/telegram';

import { llamarClaude, transcribirAudio } from '../lib/ai';
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
    // Safety: liberar el flag en 60s si algo falla sin limpiarlo
    const safetyTimer = setTimeout(() => {
      if (enFlujoVozRef.current) {
        enFlujoVozRef.current = false;
        setEstado('esperando');
        estadoRef.current = 'esperando';
        iniciarSpeechRecognition();
      }
    }, 60000);
    ExpoSpeechRecognitionModule.stop();

    // Pausar música si está activa
    const habiaMusica = musicaActivaRef.current;
    if (habiaMusica) pararMusica();

    await new Promise(resolve => setTimeout(resolve, 500));

    // 1. Verificar presencia
    await hablar(`¿Estás por ahí, ${nombreAbuela}?`);
    // Pausa extra para asegurarse que el TTS terminó completamente
    await new Promise(resolve => setTimeout(resolve, 500));
    const respuestaPresencia = await escucharRespuesta();

    if (!respuestaPresencia || esNegativo(respuestaPresencia)) {
      clearTimeout(safetyTimer);
      enFlujoVozRef.current = false;
      return false;
    }

    // 2. Anunciar el mensaje — pausa larga antes de reproducir para que el TTS no se pise
    await hablar(`Te llegó un mensaje de voz de ${nombre}.`);
    await new Promise(resolve => setTimeout(resolve, 800));

    // 3. Reproducir el audio
    try {
      player.replace({ uri: urlAudio });
      await new Promise(resolve => setTimeout(resolve, 1500));
      player.play();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 30000); // máximo 30s
        const interval = setInterval(() => {
          if (!player.playing) { clearInterval(interval); clearTimeout(timeout); resolve(); }
        }, 300);
      });
    } catch {}

    // 4. Pausa antes de ofrecer contestar
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. Ofrecer contestar
    await hablar(`¿Querés contestarle a ${nombre}?`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const respuestaContestar = await escucharRespuesta();

    clearTimeout(safetyTimer);
    if (esAfirmativo(respuestaContestar)) {
      await grabarYMandarRespuesta(chatId, nombre, nombreAbuela);
    } else {
      await hablar('Bueno, cuando quieras contestarle me avisás.');
      enFlujoVozRef.current = false;
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
    return true;
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

    // Polling cada 3 min para mensajes nuevos
    const idPolling = setInterval(chequearMensajesVoz, 3 * 60 * 1000);
    // Reintento de pendientes cada 15 minutos
    const idReintento = setInterval(reintentar, INTERVALO_REINTENTO);

    return () => {
      clearInterval(idPolling);
      clearInterval(idReintento);
    };
  }, []);

  // ── Resumen diario a las 21hs ───────────────────────────────────────────────
  useEffect(() => {
    async function enviarResumenDiario() {
      const p = perfilRef.current;
      if (!p) return;
      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;
      const ahora = new Date();
      if (ahora.getHours() !== 21 || ahora.getMinutes() > 5) return;
      const clave = `resumen_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);

      const entradas = await cargarEntradasAnimo();
      const hoy = ahora.toISOString().slice(0, 10);
      const entradasHoy = entradas.filter((e: EntradaAnimo) =>
        new Date(e.timestamp).toISOString().slice(0, 10) === hoy
      );
      const EMOJIS: Record<string, string> = {
        feliz: '😊 contenta', triste: '😢 triste', sorprendida: '😮 sorprendida',
        pensativa: '🤔 pensativa', neutral: '😐 tranquila',
      };
      let animoTexto = 'sin registros';
      if (entradasHoy.length > 0) {
        const conteo: Record<string, number> = {};
        for (const e of entradasHoy) conteo[e.expresion] = (conteo[e.expresion] ?? 0) + 1;
        const predominante = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
        animoTexto = EMOJIS[predominante] ?? predominante;
        if (entradasHoy.length > 1) {
          animoTexto += ` (${Object.entries(conteo).map(([k, v]) => `${EMOJIS[k] ?? k} ×${v}`).join(', ')})`;
        }
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

      const asistente = p.nombreAsistente ?? 'Rosita';
      const fecha = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      const mensaje =
        `📋 *Resumen del día de ${p.nombreAbuela}*\n` +
        `_${fecha}_\n\n` +
        `😊 *Estado de ánimo:* ${animoTexto}\n` +
        `💬 *Temas:* ${temasTexto}\n` +
        `⏱ *Tiempo con ${asistente}:* ${horasActiva}`;

      await enviarMensajeTelegram(chatIds, mensaje);
    }

    const id = setInterval(enviarResumenDiario, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Timer de silbido ────────────────────────────────────────────────────────
  useEffect(() => {
    const QUINCE_MIN = 15 * 60 * 1000;
    const id = setInterval(() => {
      const esperando = estadoRef.current === 'esperando';
      const despierta = modoNoche === 'despierta';
      const sinCharla = (Date.now() - ultimaCharlaRef.current) >= QUINCE_MIN;
      const sinMusica = !musicaActivaRef.current;
      if (esperando && despierta && sinCharla && sinMusica && !noMolestarRef.current) {
        iniciarSilbido();
      } else {
        detenerSilbido();
      }
    }, 15000);
    return () => { clearInterval(id); detenerSilbido(); };
  }, [modoNoche]);

  return { chequearPendientesAlActivar };
}