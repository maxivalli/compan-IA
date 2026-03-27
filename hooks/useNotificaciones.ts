import { useEffect, useRef, useState } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Perfil,
  EntradaAnimo,
  cargarPerfil,
  obtenerFamiliaId,
  yaRecordo,
  marcarRecordado,
  cargarRecordatorios,
  borrarRecordatorio,
  borrarRecordatoriosViejos,
  cargarEntradasAnimo,
  cargarHistorial,
  musicaEscuchadaHoy,
  limpiarHistorialAnimo,
  fechaLocal,
} from '../lib/memoria';
import { ModoNoche } from '../components/RosaOjos';
import { enviarAlertaTelegram, enviarMensajeTelegram, recibirMensajesVoz, recibirMensajesFoto, recibirMensajesTexto, obtenerUrlArchivo, MensajeVoz, MensajeFoto, MensajeTexto } from '../lib/telegram';
import { obtenerClima, climaATexto, CODIGOS_ADVERSOS } from '../lib/clima';

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
  climaRef:              React.RefObject<string>;
  ciudadRef:             React.RefObject<string>;
  coordRef:              React.RefObject<{ lat: number; lon: number } | null>;
  setClimaObj:           (c: { temperatura: number; descripcion: string } | null) => void;
  setEstado:             (s: 'esperando' | 'escuchando' | 'pensando' | 'hablando') => void;
  hablar:                (texto: string) => Promise<void>;
  iniciarSpeechRecognition: () => void;
  modoNoche:             ModoNoche;
  musicaActivaRef:       React.RefObject<boolean>;
  enFlujoVozRef:         React.RefObject<boolean>;
  proximaAlarmaRef:      React.RefObject<number>;
  pararMusica:           () => void;
  iniciarSilbido:        () => void;
  detenerSilbido:        () => void;
  flujoFoto:             (silencioso?: boolean, destChatId?: string) => Promise<void>;
  mostrarFoto:           (urlFoto: string, descripcion: string) => void;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotificaciones(refs: NotificacionesRefs, player: ReturnType<typeof useAudioPlayer>) {
  // Cola FIFO — serializa los handlers de Telegram para evitar race conditions
  const colaRef = useRef<Promise<void>>(Promise.resolve());

  // Blacklist de recordatorios/alarmas ya disparados: useRef para sobrevivir remounts del componente
  const disparadosRef = useRef(new Set<string>());
  function encolar(fn: () => Promise<void>): void {
    colaRef.current = colaRef.current.then(fn).catch(() => {});
  }

  const {
    perfilRef, estadoRef, noMolestarRef, modoNocheRef,
    ultimaActividadRef, ultimaCharlaRef, alertaInactividadRef,
    telegramOffsetRef, climaRef, ciudadRef, coordRef, setClimaObj,
    setEstado, hablar, iniciarSpeechRecognition,
    modoNoche, musicaActivaRef, enFlujoVozRef, proximaAlarmaRef, pararMusica, iniciarSilbido, detenerSilbido, flujoFoto, mostrarFoto,
  } = refs;

  // Grabador para respuestas de voz
  const recorderResp = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ── Escuchar una respuesta de sí/no por voz ────────────────────────────────
  async function escucharRespuesta(): Promise<string> {
    try {
      ExpoSpeechRecognitionModule.stop();
      await new Promise(resolve => setTimeout(resolve, 200));

      setEstado('escuchando');
      estadoRef.current = 'escuchando';

      await recorderResp.prepareToRecordAsync();
      recorderResp.record();

      // Esperar hasta 6 segundos (suficiente para un sí/no, sin pausas innecesarias)
      await new Promise<void>(resolve => {
        let elapsed = 0;
        const check = setInterval(() => {
          elapsed += 300;
          if (elapsed >= 6000) { clearInterval(check); resolve(); }
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

  // Extrae el mensaje incluido en la respuesta afirmativa, si lo hay
  // Ej: "sí, decile que lo quiero mucho" → "decile que lo quiero mucho"
  function extraerMensajeDeRespuesta(texto: string): string {
    const limpio = texto
      .replace(/^(sí|si|dale|bueno|claro|ok|obvio|por supuesto|quiero contestar)[,\s]*/i, '')
      .trim();
    return limpio;
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
  ): Promise<'respondido' | 'rechazado' | 'ignorado'> {
    enFlujoVozRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    // Pausar música si está activa
    const habiaMusica = musicaActivaRef.current;
    if (habiaMusica) pararMusica();

    let resultado: 'respondido' | 'rechazado' | 'ignorado' = 'ignorado';
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Verificar presencia
      await hablar(`¿Estás por ahí, ${nombreAbuela}?`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuestaPresencia = await escucharRespuesta();

      if (esNegativo(respuestaPresencia)) return 'rechazado'; // dijo "no" → descartar
      if (!respuestaPresencia) return 'ignorado';             // silencio → reintentar

      // 2. Anunciar el mensaje
      await hablar(`Te llegó un mensaje de voz de ${nombre}.`);
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. Reproducir el audio
      try {
        player.replace({ uri: urlAudio });
        await new Promise(resolve => setTimeout(resolve, 400));
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
      await new Promise(resolve => setTimeout(resolve, 300));
      await hablar(`¿Querés contestarle a ${nombre}?`);
      await new Promise(resolve => setTimeout(resolve, 200));
      const respuestaContestar = await escucharRespuesta();

      if (esAfirmativo(respuestaContestar)) {
        const mensajeInline = extraerMensajeDeRespuesta(respuestaContestar);
        if (mensajeInline.length > 3) {
          // Ya dijo el mensaje junto con el "sí" — mandarlo directamente sin pedir de nuevo
          const chatIds = [chatId];
          const nombre_ = perfilRef.current?.nombreAbuela ?? '';
          await enviarAlertaTelegram(chatIds, `Mensaje de ${nombre_}: "${mensajeInline}"`, perfilRef.current?.nombreAsistente);
          await hablar(`Listo, le mandé tu mensaje a ${nombre}.`);
        } else {
          await grabarYMandarRespuesta(chatId, nombre, nombreAbuela);
        }
      } else {
        await hablar('Bueno, cuando quieras contestarle me avisás.');
      }
      resultado = 'respondido';
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

  // ── Flujo completo de foto entrante de Telegram ───────────────────────────────
  async function manejarMensajeFoto(
    msg: MensajeFoto,
    nombre: string,
    nombreAbuela: string,
  ): Promise<'respondido' | 'rechazado' | 'ignorado'> {
    enFlujoVozRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    const habiaMusica = musicaActivaRef.current;
    if (habiaMusica) pararMusica();

    let resultado: 'respondido' | 'rechazado' | 'ignorado' = 'ignorado';
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Verificar presencia
      await hablar(`¿Estás por ahí, ${nombreAbuela}? ${nombre} te mandó una foto.`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuesta = await escucharRespuesta();

      if (esNegativo(respuesta)) return 'rechazado';
      if (!respuesta) return 'ignorado';

      // 2. Mostrar foto en pantalla + describir con voz
      mostrarFoto(msg.urlFoto, msg.descripcion);
      await new Promise(resolve => setTimeout(resolve, 600));
      await hablar(msg.descripcion);

      resultado = 'respondido';
    } catch {
    } finally {
      enFlujoVozRef.current = false;
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
    return resultado;
  }

  // ── Flujo completo de mensaje de texto entrante de Telegram ──────────────────
  async function manejarMensajeTexto(
    msg: MensajeTexto,
    nombreAbuela: string,
  ): Promise<'respondido' | 'rechazado' | 'ignorado'> {
    enFlujoVozRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    const habiaMusica = musicaActivaRef.current;
    if (habiaMusica) pararMusica();

    let resultado: 'respondido' | 'rechazado' | 'ignorado' = 'ignorado';
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Verificar presencia
      await hablar(`¿Estás por ahí, ${nombreAbuela}? ${msg.fromName} te mandó un mensaje.`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuestaPresencia = await escucharRespuesta();

      if (esNegativo(respuestaPresencia)) return 'rechazado';
      if (!respuestaPresencia) return 'ignorado';

      // 2. Leer el mensaje en voz alta
      const textoSeguro = msg.texto.slice(0, 300); // límite de seguridad
      await hablar(`${msg.fromName} te dice: ${textoSeguro}`);
      await new Promise(resolve => setTimeout(resolve, 800));

      // 3. Ofrecer contestar
      await hablar(`¿Querés contestarle a ${msg.fromName}?`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const respuestaContestar = await escucharRespuesta();

      if (esAfirmativo(respuestaContestar)) {
        const mensajeInline = extraerMensajeDeRespuesta(respuestaContestar);
        if (mensajeInline.length > 3) {
          const chatIds = [msg.chatId];
          await enviarAlertaTelegram(chatIds, `Mensaje de ${nombreAbuela}: "${mensajeInline}"`, perfilRef.current?.nombreAsistente);
          await hablar(`Listo, le mandé tu mensaje a ${msg.fromName}.`);
        } else {
          await grabarYMandarRespuesta(msg.chatId, msg.fromName, nombreAbuela);
        }
      } else {
        await hablar('Bueno, cuando quieras contestarle me avisás.');
      }
      resultado = 'respondido';
    } catch {
    } finally {
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
    const hoy = fechaLocal(Date.now());
    const entradasHoy = entradas.filter((e: EntradaAnimo) => fechaLocal(e.timestamp) === hoy);
    const masc = perfilRef.current?.generoUsuario === 'masculino';
    const ETIQUETAS: Record<string, string> = {
      feliz:       `😊 ${masc ? 'Contento'    : 'Contenta'}`,
      triste:      '😢 Triste',
      sorprendida: `😮 ${masc ? 'Sorprendido' : 'Sorprendida'}`,
      pensativa:   `🤔 ${masc ? 'Pensativo'   : 'Pensativa'}`,
      neutral:     `😐 ${masc ? 'Tranquilo'   : 'Tranquila'}`,
    };
    let animoLineas = 'sin registros';
    if (entradasHoy.length > 0) {
      const total = entradasHoy.length;
      const conteo: Record<string, number> = {};
      for (const e of entradasHoy) {
        if (!ETIQUETAS[e.expresion]) continue;
        conteo[e.expresion] = (conteo[e.expresion] ?? 0) + 1;
      }
      const lineas: string[] = [];
      for (const [mood, count] of Object.entries(conteo).sort((a, b) => b[1] - a[1])) {
        const label = ETIQUETAS[mood];
        const pct = Math.round((count / total) * 100);
        if (mood === 'triste') {
          // La tristeza siempre se muestra con un aviso, sin importar qué tan minoritaria sea
          lineas.push(`  ${label}: ${count} momento${count > 1 ? 's' : ''} (${pct}%) ⚠️`);
        } else if (pct >= 50) {
          lineas.push(`  ${label}: principalmente (${pct}%)`);
        } else if (pct >= 20) {
          lineas.push(`  ${label}: varios momentos (${pct}%)`);
        } else if (pct >= 5) {
          lineas.push(`  ${label}: algunos momentos (${pct}%)`);
        }
        // Estados con < 5% se omiten (excepto triste, ya cubierto arriba)
      }
      animoLineas = lineas.join('\n');
    }

    const historial = await cargarHistorial();
    const mensajesUsuario = historial.filter(m => m.role === 'user').map(m => m.content).slice(-10);
    let temasTexto = 'sin conversaciones hoy';
    if (mensajesUsuario.length > 0) {
      try {
        temasTexto = await llamarClaude({
          maxTokens: 80,
          system: `Resumí en una sola línea corta los temas principales de estos mensajes de ${perfilRef.current?.generoUsuario === 'masculino' ? 'un señor mayor' : 'una señora mayor'}. Sin puntuación al final. Solo los temas, sin nombres propios. Máximo 15 palabras.`,
          messages: [{ role: 'user', content: mensajesUsuario.join(' | ') }],
        }) || 'conversación general';
      } catch {
        temasTexto = `${mensajesUsuario.length} mensajes`;
      }
    }

    const cantCharlas = entradasHoy.length;
    const minAprox = Math.round(cantCharlas * 0.5); // ~30 seg por intercambio
    const horasActiva = cantCharlas === 0
      ? 'sin charlas hoy'
      : minAprox >= 60
        ? `${Math.floor(minAprox / 60)}h ${minAprox % 60}min aprox.`
        : `${minAprox} min aprox.`;

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
      `💬 <b>Charlas con ${asistente}:</b> ${cantCharlas} vez${cantCharlas !== 1 ? 'es' : ''} hoy (${horasActiva})` +
      (alertasHoy > 0 ? `\n\n🚨 <b>Alertas enviadas:</b> ${alertasHoy}` : '') +
      (recPendientes > 0 ? `\n\n⏰ <b>Recordatorios pendientes:</b> ${recPendientes}` : '') +
      (enNoMolestar ? `\n\n🔇 <b>Modo no molestar:</b> activo al cierre del día` : '')
    );
  }

  // ── Cumpleaños — hooks y estado deben estar en el scope del hook ─────────────
  const [esCumpleaños, setEsCumpleaños] = useState(false);
  const playerCumple = useAudioPlayer(require('../assets/audio/0319.mp3'));

  // Detecta si hoy es el cumpleaños al montar (para mostrar globos todo el día)
  useEffect(() => {
    (async () => {
      // Leer directamente de storage por si perfilRef aún no cargó
      const p = perfilRef.current ?? await cargarPerfil();
      if (!p?.fechaNacimiento) return;
      const ahora = new Date();
      const [mm, dd] = p.fechaNacimiento.split('-').map(Number);
      if (ahora.getMonth() + 1 === mm && ahora.getDate() === dd) setEsCumpleaños(true);
    })();
  }, []);

  // ── Reloj Maestro — un único setInterval reemplaza 5 efectos de 1 minuto ─────
  useEffect(() => {
    function parsearHoraMed(med: string): number | null {
      const m = med.match(/(\d{1,2})(?::(\d{2}))?\s*h/i);
      if (!m) return null;
      return parseInt(m[1], 10);
    }

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

    async function chequearMedicamentos() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const horaActualVal = new Date().getHours();
      const minActual = new Date().getMinutes();
      if (minActual > 15) return;
      for (const med of p.medicamentos) {
        const hora = parsearHoraMed(med);
        if (hora === null || hora !== horaActualVal) continue;
        const clave = `med_${med}`;
        const ya = await yaRecordo(clave);
        if (ya) continue;
        await marcarRecordado(clave);
        const nombre = med.split(/\s+/)[0];
        const textoRecordatorio = `${p.nombreAbuela}, es hora de tomar el ${nombre}.`;
        await AsyncStorage.setItem('medPendiente', JSON.stringify({ texto: textoRecordatorio, ts: Date.now() }));
        await hablar(textoRecordatorio);
        break;
      }
    }

    async function chequearFechas() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      const ahora = new Date();
      // Desfasado 2 minutos respecto al saludoMatutino para no pisarse
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
            system: `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Usá el nombre de la persona con naturalidad. Respondé con una sola frase corta y cálida, sin etiquetas.`,
            messages: [{ role: 'user', content: `Hoy es: ${fecha}. Generá un recordatorio cálido para ${p.nombreAbuela}.` }],
          });
          if (frase && estadoRef.current === 'esperando') { await hablar(frase); ultimaCharlaRef.current = Date.now(); }
        } catch {}
        break;
      }
    }

    async function cumpleañosMatutino() {
      const p = perfilRef.current;
      if (!p?.fechaNacimiento || noMolestarRef.current) return;
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
        const frase = await llamarClaude({
          maxTokens: 120,
          system: `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Usá el nombre de la persona con naturalidad. Respondé con una sola frase corta y emotiva, sin etiquetas.`,
          messages: [{ role: 'user', content: `Deseale un feliz cumpleaños a ${p.nombreAbuela} con mucho cariño.` }],
        });
        if (frase && estadoRef.current === 'esperando') { await hablar(frase); ultimaCharlaRef.current = Date.now(); }
      } catch {}
    }

    async function saludoMatutino() {
      const p = perfilRef.current;
      if (!p || noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      // Si una alarma (u otra charla) acaba de sonar en los últimos 10 minutos, no saludar
      if (Date.now() - ultimaCharlaRef.current < 10 * 60 * 1000) return;
      const ahora = new Date();
      // Respetar horaFinNoche del perfil (default 9) y dar ventana de 30 minutos
      const horaDespertar = p.horaFinNoche ?? 9;
      const horaActual = ahora.getHours();
      const minActual  = ahora.getMinutes();
      const minutosDesdeDespertar = (horaActual - horaDespertar) * 60 + minActual;
      if (minutosDesdeDespertar < 0 || minutosDesdeDespertar > 30) return;
      const clave = `saludo_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const dia   = diasSemana[ahora.getDay()];
      const fecha = `${ahora.getDate()} de ${meses[ahora.getMonth()]}`;
      const esNavidad  = ahora.getMonth() === 11 && ahora.getDate() === 25;
      const esAñoNuevo = ahora.getMonth() === 0  && ahora.getDate() === 1;
      const systemBase = `Sos ${p.nombreAsistente ?? 'Rosita'}, ${p.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${p.nombreAbuela}${p.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p.edad)} Usá el nombre de la persona con naturalidad. Respondé en una sola frase corta y cálida, sin etiquetas.`;
      try {
        let frase: string | null;
        if (esNavidad) {
          frase = await llamarClaude({ maxTokens: 120, system: systemBase, messages: [{ role: 'user', content: `Hoy es Navidad. Generá UN saludo de Navidad breve y emotivo para ${p.nombreAbuela}.` }] });
        } else if (esAñoNuevo) {
          frase = await llamarClaude({ maxTokens: 120, system: systemBase, messages: [{ role: 'user', content: `Hoy es Año Nuevo. Generá UN saludo breve y esperanzador para ${p.nombreAbuela}.` }] });
        } else {
          frase = await llamarClaude({ maxTokens: 120, system: systemBase, messages: [{ role: 'user', content: `Hoy es ${dia} ${fecha}. ${climaRef.current} Saludá a ${p.nombreAbuela} con buenos días, mencioná el día y el clima brevemente, con calidez y buen humor. Cerrá con una pregunta corta y cálida que invite a charlar, por ejemplo sobre cómo amaneció o qué tiene pensado hacer hoy.` }] });
        }
        if (frase && estadoRef.current === 'esperando') await hablar(frase);
      } catch {}
    }

    async function chequearAlarmas() {
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const ahora = Date.now();
      const todos = await cargarRecordatorios();
      const alarmas = todos.filter(r => r.esAlarma && r.timestampEpoch && ahora >= r.timestampEpoch);
      for (const alarma of alarmas) {
        const clave = `alarma_${alarma.id}`;
        if (disparadosRef.current.has(clave)) continue;
        const ya = await yaRecordo(clave);
        if (ya) { disparadosRef.current.add(clave); continue; }
        disparadosRef.current.add(clave);
        await marcarRecordado(clave);
        await borrarRecordatorio(alarma.id);
        proximaAlarmaRef.current = 0;
        await hablar(alarma.texto);
        ultimaCharlaRef.current = Date.now();
        break;
      }
    }

    async function chequearRecordatorios() {
      if (noMolestarRef.current) return;
      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') return;
      const hora = new Date().getHours();
      if (hora < 9 || hora >= 21) return;
      const hoy = fechaLocal();
      const ahora = Date.now();
      const todos = await cargarRecordatorios();
      const pendientes = todos.filter(r => {
        if (r.fechaISO !== hoy) return false;
        if (r.timestampEpoch) return ahora >= r.timestampEpoch;
        return true;
      });
      for (const r of pendientes) {
        const clave = `recordatorio_${r.id}`;
        if (disparadosRef.current.has(clave)) continue;
        const ya = await yaRecordo(clave);
        if (ya) { disparadosRef.current.add(clave); continue; }
        disparadosRef.current.add(clave);
        await marcarRecordado(clave);
        borrarRecordatorio(r.id).catch(() => {}); // borra inmediatamente para evitar re-disparo si marcarRecordado falla
        const nombre = perfilRef.current?.nombreAbuela ?? '';
        if (r.esTimer) { await hablar(r.texto); } else { await hablar(`${nombre}, te recuerdo que hoy tenés que ${r.texto}.`); }
        break;
      }
    }

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

    async function resetearAnimo() {
      const ahora = new Date();
      if (ahora.getHours() !== 23 || ahora.getMinutes() > 5) return;
      const clave = `reset_animo_${ahora.toISOString().slice(0, 10)}`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      await limpiarHistorialAnimo();
      setEsCumpleaños(false);
    }

    async function chequearClima() {
      const p = perfilRef.current;
      if (!p?.nombreAbuela) return;
      if (noMolestarRef.current) return;
      if (estadoRef.current !== 'esperando') return;
      const hora = new Date().getHours();
      if (hora !== 9 && hora !== 14) return;
      const clave = `alerta_clima_${fechaLocal()}_${hora}h`;
      const ya = await yaRecordo(clave);
      if (ya) return;
      await marcarRecordado(clave);
      const clima = await obtenerClima();
      if (!clima) return;
      const adversoAhora = CODIGOS_ADVERSOS.has(clima.codigoActual);
      const manana = clima.pronostico[0];
      const adversoManana = manana && CODIGOS_ADVERSOS.has(manana.codigo);
      if (!adversoAhora && !adversoManana) return;
      const nombre = p.nombreAbuela;
      let frase: string;
      if (adversoAhora) {
        frase = `${nombre}, te quería avisar que afuera hay ${clima.descripcion}. Si pensabas salir, mejor esperá un poco o llevate el paraguas.`;
      } else {
        frase = `${nombre}, mañana se pronostica ${manana!.descripcion}. Por si tenés algo planeado, puede ser buena idea tenerlo en cuenta.`;
      }
      await hablar(frase);
    }

    borrarRecordatoriosViejos().catch(() => {});

    let ultimoRefrescoClima = 0;

    async function actualizarClima() {
      const ahora = Date.now();
      if (ahora - ultimoRefrescoClima < 30 * 60 * 1000) return;
      ultimoRefrescoClima = ahora;
      const clima = await obtenerClima();
      if (!clima) return;
      climaRef.current  = climaATexto(clima);
      ciudadRef.current = clima.ciudad ?? '';
      if (clima.latitud && clima.longitud) coordRef.current = { lat: clima.latitud, lon: clima.longitud };
      setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion });
    }

    async function tick() {
      await chequearAlarmas();
      await chequearMedicamentos();
      await chequearFechas();
      await cumpleañosMatutino();
      await saludoMatutino();
      await chequearRecordatorios();
      await enviarResumenDiario();
      await resetearAnimo();
      await chequearClima();
      await actualizarClima();
    }

    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  // ── Alerta de inactividad ───────────────────────────────────────────────────
  useEffect(() => {
    const HORAS_INACTIVIDAD = 4;

    // Cuenta solo los minutos que caen fuera del horario nocturno configurado
    function minutosActivosTranscurridos(
      desde: number,
      hasta: number,
      horaInicioNoche: number,
      horaFinNoche: number
    ): number {
      let activos = 0;
      let t = desde;
      while (t < hasta) {
        const horaActual = new Date(t).getHours();
        // El horario nocturno cruza medianoche (ej: 23 → 9)
        const esNoche = horaInicioNoche > horaFinNoche
          ? (horaActual >= horaInicioNoche || horaActual < horaFinNoche)
          : (horaActual >= horaInicioNoche && horaActual < horaFinNoche);
        if (!esNoche) {
          const sigHora = new Date(t);
          sigHora.setMinutes(0, 0, 0);
          sigHora.setHours(sigHora.getHours() + 1);
          activos += (Math.min(sigHora.getTime(), hasta) - t) / 1000 / 60;
        }
        // Avanzar al inicio de la próxima hora
        const next = new Date(t);
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        t = next.getTime();
      }
      return activos;
    }

    async function chequearInactividad() {
      if (noMolestarRef.current) return;
      const p = perfilRef.current;
      if (!p) return;

      const horaInicioNoche = p.horaInicioNoche ?? 23;
      const horaFinNoche    = p.horaFinNoche    ?? 9;

      // No chequear durante el horario nocturno configurado
      const hora = new Date().getHours();
      const esNocheAhora = horaInicioNoche > horaFinNoche
        ? (hora >= horaInicioNoche || hora < horaFinNoche)
        : (hora >= horaInicioNoche && hora < horaFinNoche);
      if (esNocheAhora) return;

      // Calcular solo los minutos activos (diurnos) sin interacción
      const minutosActivos = minutosActivosTranscurridos(
        ultimaActividadRef.current,
        Date.now(),
        horaInicioNoche,
        horaFinNoche
      );
      if (minutosActivos < HORAS_INACTIVIDAD * 60) return;
      if (Date.now() - alertaInactividadRef.current < 2 * 60 * 60 * 1000) return;
      alertaInactividadRef.current = Date.now();
      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;
      const nombre = p.nombreAbuela ?? 'Tu abuela';
      const horas  = Math.floor(minutosActivos / 60);
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
      const estado = await manejarMensajeVoz(urlAudio, nombre, msg.chatId, p.nombreAbuela);
      // 'rechazado' también se considera procesado (no reintentar)
      return estado !== 'ignorado';
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
        const estadoVoz = await manejarMensajeVoz(urlAudio, nombre, primero.chatId, p.nombreAbuela);

        // Solo volver a encolar si fue ignorado (silencio/ausencia) — no si rechazó explícitamente
        if (estadoVoz === 'ignorado') {
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
      const familiaId = await obtenerFamiliaId();
      if (!familiaId) return;
      const comandos = await obtenerComandosPendientes(familiaId);
      for (const cmd of comandos) {
        if (cmd === 'informe' || cmd.startsWith('informe:')) {
          // informe:chatId → solo al que lo pidió; informe → a todos los contactos
          const chatIds = cmd.includes(':')
            ? [cmd.split(':')[1]]
            : (p.telegramContactos ?? []).map(c => c.id);
          if (!chatIds.length) continue;
          try {
            const mensaje = await generarMensajeResumen(p);
            await enviarMensajeTelegram(chatIds, mensaje);
          } catch {}
        } else if (cmd.startsWith('camara')) {
          const horaCmd = new Date().getHours();
          if (horaCmd >= 23 || horaCmd < 9) continue;
          if (estadoRef.current !== 'esperando') continue;
          const destChatId = cmd.includes(':') ? cmd.split(':')[1] : undefined;
          try { await flujoFoto(true, destChatId); } catch {}
        }
      }
    }

    async function procesarMensajeFoto(msg: MensajeFoto, p: Perfil): Promise<boolean> {
      const contacto  = (p.telegramContactos ?? []).find(c => c.id === msg.chatId);
      const nombre    = contacto?.nombre ?? msg.fromName;

      const hora = new Date().getHours();
      const horarioNocturno = hora >= 22 || hora < 9;
      const dormida = modoNocheRef.current === 'durmiendo' || modoNocheRef.current === 'soñolienta';

      if (horarioNocturno || dormida || noMolestarRef.current) return false;

      if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') {
        await new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, 15000);
          const check = setInterval(() => {
            if (estadoRef.current === 'esperando') { clearInterval(check); clearTimeout(timeout); resolve(); }
          }, 500);
        });
      }

      const estado = await manejarMensajeFoto(msg, nombre, p.nombreAbuela);
      return estado !== 'ignorado';
    }

    async function chequearMensajesTexto() {
      const estadoActual = estadoRef.current as string;
      if (estadoActual === 'hablando' || estadoActual === 'pensando') return;

      const p = perfilRef.current;
      if (!p) return;

      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;

      const hora = new Date().getHours();
      const horarioNocturno = hora >= 22 || hora < 9;
      const dormida = modoNocheRef.current === 'durmiendo' || modoNocheRef.current === 'soñolienta';
      if (horarioNocturno || dormida || noMolestarRef.current) return;

      const nuevos = await recibirMensajesTexto(chatIds);
      if (!nuevos.length) return;

      // Procesar de a uno — igual que voz y foto
      for (const msg of nuevos) {
        if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') {
          await new Promise<void>(resolve => {
            const timeout = setTimeout(resolve, 15000);
            const check = setInterval(() => {
              if (estadoRef.current === 'esperando') { clearInterval(check); clearTimeout(timeout); resolve(); }
            }, 500);
          });
        }
        await manejarMensajeTexto(msg, p.nombreAbuela);
        break; // de a uno por vez
      }
    }

    async function chequearMensajesFoto() {
      const estadoActual = estadoRef.current as string;
      if (estadoActual === 'hablando' || estadoActual === 'pensando') return;

      const p = perfilRef.current;
      if (!p) return;

      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      if (!chatIds.length) return;

      // Fotos nuevas del servidor
      const nuevas = await recibirMensajesFoto(chatIds);
      const pendientesRaw = await AsyncStorage.getItem('fotoPendiente');
      let pendientes: MensajeFoto[] = [];
      try { pendientes = JSON.parse(pendientesRaw ?? '[]'); } catch { pendientes = []; }

      // Agregar nuevas a pendientes (sin duplicar por urlFoto)
      for (const foto of nuevas) {
        if (!pendientes.some(f => f.urlFoto === foto.urlFoto)) {
          pendientes.push(foto);
        }
      }

      if (!pendientes.length) return;

      // Solo procesar si el usuario estuvo activo en los últimos 10 min (o hay fotos nuevas)
      const usuarioActivo = (Date.now() - ultimaCharlaRef.current) < 10 * 60 * 1000;
      if (!usuarioActivo && !nuevas.length) {
        await AsyncStorage.setItem('fotoPendiente', JSON.stringify(pendientes));
        return;
      }

      // Mostrar todas las pendientes de a una, después de la respuesta actual
      const procesadas: MensajeFoto[] = [];
      for (const foto of pendientes) {
        const ok = await procesarMensajeFoto(foto, p);
        if (ok) procesadas.push(foto);
        else break; // si no responde, dejar el resto en cola
      }

      const restantes = pendientes.filter(f => !procesadas.some(p => p.urlFoto === f.urlFoto));
      if (restantes.length) {
        await AsyncStorage.setItem('fotoPendiente', JSON.stringify(restantes));
      } else {
        await AsyncStorage.removeItem('fotoPendiente');
      }
    }

    // Polling serializado via cola FIFO — evita race conditions entre handlers
    const idPolling  = setInterval(() => encolar(chequearMensajesVoz),   3 * 60 * 1000);
    const idTextos   = setInterval(() => encolar(chequearMensajesTexto), 3 * 60 * 1000);
    const idFotos    = setInterval(() => encolar(chequearMensajesFoto),  3 * 60 * 1000);
    const idComandos = setInterval(() => encolar(chequearComandos),      15 * 1000);
    const idReintento = setInterval(() => encolar(reintentar),           INTERVALO_REINTENTO);

    return () => {
      clearInterval(idPolling);
      clearInterval(idTextos);
      clearInterval(idFotos);
      clearInterval(idComandos);
      clearInterval(idReintento);
    };
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
        system: `Sos ${p?.nombreAsistente ?? 'Rosita'}, ${p?.vozGenero === 'masculina' ? 'un compañero virtual cálido' : 'una compañera virtual cálida'} para ${nombre}${p?.edad ? ` (${p.edad} años)` : ''}. ${tonoSegunEdad(p?.edad)} Usá el nombre de la persona con naturalidad. Respondé con una sola frase corta y emotiva de cumpleaños, sin mencionar la edad. Sin etiquetas.`,
        messages: [{ role: 'user', content: `Deseale un feliz cumpleaños a ${nombre} con mucho cariño.` }],
      });
      if (frase && estadoRef.current === 'esperando') await hablar(frase);
    } catch {}
  }

  return { chequearPendientesAlActivar, esCumpleaños, triggerCumpleaños };
}