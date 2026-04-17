# Troubleshooting - CompañIA App

Guía de solución de problemas comunes en la aplicación móvil.

## 🎤 Problemas de Speech Recognition

### El micrófono no funciona / No escucha

**Síntomas:**
- Rosita no responde cuando hablas
- El badge dice "Escuchando" pero no detecta voz
- Error: "Speech recognition not available"

**Soluciones:**

1. **Verificar permisos de micrófono**
   ```bash
   # iOS: Settings → CompañIA → Microphone → ON
   # Android: Settings → Apps → CompañIA → Permissions → Microphone → Allow
   ```

2. **Reiniciar Speech Recognition**
   - Tocar el botón de pausa/play en la app
   - O reiniciar la app completamente

3. **Verificar que no esté en modo No Molestar**
   - Si ves el zipper sobre la boca → desactivar No Molestar

4. **Logs de debug**
   ```typescript
   // La app envía logs al backend
   // Ver en Railway logs: [APP] sr_error
   ```

5. **Fallback a Deepgram**
   - Si expo-speech-recognition falla, la app puede usar Deepgram WebSocket
   - Verificar que `DEEPGRAM_PROJECT_ID` esté configurado en backend

### Speech Recognition se cuelga

**Síntomas:**
- Badge dice "Escuchando" pero no responde
- Logs muestran: "SR watchdog timeout"

**Soluciones:**

1. **Los watchdogs deberían reiniciarlo automáticamente**
   - Esperar 10-15 segundos
   - Si no se reinicia, tocar pausa/play

2. **Verificar en logs**
   ```bash
   # Buscar en Railway logs:
   [APP] sr_watchdog_restart
   [APP] sr_timeout
   ```

3. **Reiniciar app**
   - Cerrar completamente y volver a abrir

### Detecta eco o se responde a sí misma

**Síntomas:**
- Rosita responde a su propia voz
- Loop infinito de conversación

**Soluciones:**

1. **Filtros de eco ya implementados**
   - La app ignora texto reconocido durante TTS
   - Ver `useAudioPipeline.ts` → filtros de relevancia

2. **Bajar volumen del dispositivo**
   - El micrófono puede captar el speaker

3. **Usar auriculares**
   - Evita que el micrófono capte el audio de salida

## 🔊 Problemas de Audio / TTS

### No reproduce audio / Rosita no habla

**Síntomas:**
- Rosita "piensa" pero no habla
- Badge dice "Hablando" pero no se escucha nada
- Error: "Audio playback failed"

**Soluciones:**

1. **Verificar volumen del dispositivo**
   - Subir volumen con botones físicos
   - Verificar que no esté en silencio

2. **Verificar conexión a backend**
   ```bash
   # En la app, verificar:
   EXPO_PUBLIC_BACKEND_URL=https://tu-backend.railway.app
   ```

3. **Verificar que Fish Audio esté configurado**
   ```bash
   # En Railway → Variables:
   FISH_AUDIO_API_KEY=...
   ```

4. **Limpiar cache de audio**
   ```typescript
   // En configuración de la app:
   // Ajustes → Limpiar cache de audio
   ```

5. **Verificar logs de TTS**
   ```bash
   # Railway logs:
   [TTS] fish | chars:45 | total:850ms
   [TTS-RT] error: 429  # Rate limit de Fish
   ```

### Audio entrecortado o con lag

**Síntomas:**
- Audio se corta
- Latencia muy alta (>3 segundos)

**Soluciones:**

1. **Verificar conexión a internet**
   - Cambiar de WiFi a datos móviles o viceversa
   - Verificar velocidad de conexión

2. **El streaming debería reducir latencia**
   - Fish Audio WebSocket: ~300-500ms
   - Si usa REST fallback: ~800-1500ms

3. **Verificar logs de streaming**
   ```bash
   # Railway logs:
   [TTS-RT] first_chunk: 350ms  # Bueno
   [TTS-RT] first_chunk: 2500ms # Malo - problema de red
   ```

4. **Reiniciar app**
   - Puede haber problemas con el player de audio

### Voz incorrecta o robótica

**Síntomas:**
- La voz no suena natural
- Voz diferente a la seleccionada

**Soluciones:**

1. **Verificar voz seleccionada**
   - Configuración → Voz de Rosita
   - Probar diferentes voces

2. **Verificar que Fish Audio esté funcionando**
   ```bash
   # Railway logs:
   [TTS] fish | chars:45 | total:850ms | kb:12.3
   
   # Si dice "fallback" → Fish falló, usando Google TTS
   ```

3. **Verificar emociones**
   - Las emociones pueden afectar el tono
   - Ver en logs: `emotion: feliz`

## 📱 Problemas de Telegram

### No recibe mensajes de familiares

**Síntomas:**
- Familiares envían mensajes pero Rosita no los lee
- No aparecen notificaciones

**Soluciones:**

1. **Verificar vinculación**
   - Configuración → Alertas Telegram
   - Verificar que los contactos estén listados

2. **Verificar webhook de Telegram**
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
   
   # Debería mostrar:
   # url: "https://tu-backend.railway.app/telegram/webhook"
   # pending_update_count: 0
   ```

3. **Verificar polling**
   - La app hace polling cada 30s
   - Ver logs: `[APP] telegram_poll`

4. **Verificar en backend**
   ```bash
   # Railway logs:
   [Telegram] webhook | chatId:123 | from:Juan | texto:"hola"
   [Telegram] mensaje guardado
   ```

5. **Re-vincular contacto**
   - Familiar debe enviar código de 6 letras nuevamente
   - Configuración → Buscar familiares

### No puede enviar alertas SOS

**Síntomas:**
- Botón SOS no responde
- Error: "No se pudo enviar alerta"

**Soluciones:**

1. **Verificar que hay contactos vinculados**
   - Configuración → Alertas Telegram
   - Debe haber al menos 1 contacto

2. **Verificar conexión a backend**
   ```bash
   # Verificar que EXPO_PUBLIC_BACKEND_URL esté correcto
   ```

3. **Verificar en logs**
   ```bash
   # Railway logs:
   [Telegram] alerta SOS enviada | familia:abc123 | contactos:2
   ```

### Fotos no se muestran

**Síntomas:**
- Familiar envía foto pero no aparece en pantalla
- Error al cargar imagen

**Soluciones:**

1. **Verificar Cloudinary**
   ```bash
   # Railway → Variables:
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

2. **Verificar Claude Vision**
   ```bash
   # Railway logs:
   [Vision] ok | chars:45
   
   # Si falla:
   [Vision] Error Anthropic: 400
   ```

3. **Verificar polling**
   - La app busca fotos cada 30s
   - Puede tardar hasta 30s en aparecer

## 🏠 Problemas de SmartThings

### No puede vincular dispositivos

**Síntomas:**
- Error al vincular SmartThings
- OAuth no funciona
- "No se pudo conectar con SmartThings"

**Soluciones:**

1. **Verificar OAuth configurado**
   ```bash
   # Railway → Variables:
   SMARTTHINGS_CLIENT_ID=...
   SMARTTHINGS_CLIENT_SECRET=...
   SMARTTHINGS_REDIRECT_URI=https://tu-backend.railway.app/smartthings/oauth/callback
   ```

2. **Verificar redirect URI**
   - Debe coincidir exactamente con la configurada en Samsung Developer

3. **Usar PAT como fallback**
   - Configuración → SmartThings → Usar PAT
   - Generar PAT en: https://account.smartthings.com/tokens

4. **Verificar logs de OAuth**
   ```bash
   # Railway logs:
   [SmartThings] OAuth vinculado — familia abc123
   [SmartThings] Error en OAuth callback: invalid_grant
   ```

### Dispositivos no responden

**Síntomas:**
- "Encendé la luz" no funciona
- Dispositivos aparecen offline
- Timeout al controlar

**Soluciones:**

1. **Verificar que dispositivos estén online**
   - Configuración → SmartThings → Ver dispositivos
   - Verificar estado en app de SmartThings

2. **Verificar tokens no expirados**
   ```bash
   # Railway logs:
   [SmartThings] Token expirado, refreshing...
   [SmartThings] Refresh exitoso
   ```

3. **Re-vincular SmartThings**
   - Configuración → SmartThings → Desvincular
   - Volver a vincular

4. **Verificar timeout**
   ```bash
   # Railway logs:
   [SmartThings] Error controlando dispositivo: timeout
   ```

## 🌤 Problemas de Clima

### No muestra clima / Pronóstico incorrecto

**Síntomas:**
- No aparece temperatura
- Pronóstico desactualizado
- Error: "No se pudo obtener clima"

**Soluciones:**

1. **Verificar API key de OpenWeather**
   ```bash
   # En .env:
   EXPO_PUBLIC_OPENWEATHER_API_KEY=...
   ```

2. **Verificar permisos de ubicación**
   ```bash
   # iOS: Settings → CompañIA → Location → While Using
   # Android: Settings → Apps → CompañIA → Permissions → Location → Allow
   ```

3. **Verificar ubicación detectada**
   - La app usa ubicación actual
   - Ver en logs: `[APP] clima_fetch | lat:-34.6 | lon:-58.4`

4. **Verificar rate limit de OpenWeather**
   - Plan gratuito: 60 llamadas/minuto
   - La app cachea clima por 30 minutos

## 🧠 Problemas de IA / Claude

### Respuestas muy lentas

**Síntomas:**
- Tarda más de 5 segundos en responder
- Badge "Pensando" por mucho tiempo

**Soluciones:**

1. **Verificar conexión a backend**
   - Puede ser problema de red

2. **Verificar prompt caching**
   ```bash
   # Railway logs:
   [CLAUDE] usage | cache_read:800  # Bueno - usando cache
   [CLAUDE] usage | cache_read:0    # Malo - sin cache
   ```

3. **Verificar que no esté haciendo búsquedas**
   ```bash
   # Railway logs:
   [Serper] q="clima en buenos aires" | el:2500ms
   [Wikipedia] q="albert einstein" | el:1800ms
   ```

4. **Respuestas rápidas deberían ser instantáneas**
   - Saludos, gracias, despedidas no llaman a Claude
   - Ver logs: `[APP] respuesta_rapida | tipo:saludo`

### Respuestas incorrectas o fuera de contexto

**Síntomas:**
- Rosita no recuerda conversaciones anteriores
- Respuestas sin sentido

**Soluciones:**

1. **Verificar memoria episódica**
   ```bash
   # Railway logs:
   [APP] memorias_sync | synced:15
   ```

2. **Verificar system_payload**
   - La app envía perfil, clima, dispositivos
   - Ver logs: `[CLAUDE] prompt | system_blocks:5`

3. **Limpiar memoria si está corrupta**
   - Configuración → Avanzado → Limpiar memoria

### Claude no disponible / Error 502

**Síntomas:**
- Error: "Error al contactar el proveedor de IA"
- Badge se queda en "Pensando"

**Soluciones:**

1. **Verificar API key de Anthropic**
   ```bash
   # Railway → Variables:
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **Verificar rate limit de Anthropic**
   - Plan gratuito tiene límites bajos
   - Upgrade a plan pagado

3. **Verificar logs de error**
   ```bash
   # Railway logs:
   [CLAUDE] Error de API: 429  # Rate limit
   [CLAUDE] Error de API: 500  # Anthropic down
   ```

## 📲 Problemas Generales de la App

### App se cierra sola / Crashes

**Síntomas:**
- App se cierra inesperadamente
- Pantalla negra

**Soluciones:**

1. **Verificar logs de crash**
   ```bash
   # Railway logs:
   [CRASH] 2024-01-15T10:30:00 | ios | install:abc123
   ```

2. **Actualizar app**
   - Verificar si hay actualizaciones OTA
   - Reinstalar desde Expo/App Store

3. **Limpiar cache**
   - iOS: Settings → General → iPhone Storage → CompañIA → Delete App
   - Android: Settings → Apps → CompañIA → Storage → Clear Cache

4. **Reportar crash**
   - Los crashes se envían automáticamente al backend
   - Contactar soporte con installId

### App muy lenta / Lag

**Síntomas:**
- Interfaz se congela
- Animaciones entrecortadas

**Soluciones:**

1. **Reiniciar app**
   - Cerrar completamente y volver a abrir

2. **Verificar memoria del dispositivo**
   - Cerrar otras apps
   - Liberar espacio de almacenamiento

3. **Limpiar cache de audio**
   - Configuración → Limpiar cache

4. **Verificar animaciones**
   - Modo noche tiene menos animaciones
   - Modo horizontal puede ser más pesado en tablets viejas

### No se sincroniza con backend

**Síntomas:**
- Cambios no se guardan
- Error: "No se pudo conectar con el servidor"

**Soluciones:**

1. **Verificar conexión a internet**
   - WiFi o datos móviles activos
   - Probar abrir navegador

2. **Verificar URL del backend**
   ```bash
   # En .env:
   EXPO_PUBLIC_BACKEND_URL=https://tu-backend.railway.app
   ```

3. **Verificar que backend esté online**
   ```bash
   curl https://tu-backend.railway.app/health
   # Debería responder: {"ok":true}
   ```

4. **Verificar device token**
   - La app genera token en primer uso
   - Si falla, reinstalar app

### Onboarding no completa

**Síntomas:**
- Se queda en pantalla de onboarding
- Error al guardar perfil

**Soluciones:**

1. **Verificar que backend esté online**
   ```bash
   curl https://tu-backend.railway.app/health
   ```

2. **Verificar bootstrap**
   ```bash
   # Railway logs:
   [Bootstrap] emitido | installId:abc123
   ```

3. **Verificar registro de familia**
   ```bash
   # Railway logs:
   [DB] /familia/registrar | familia:xyz789 | codigo:AB3X7K
   ```

4. **Reiniciar onboarding**
   - Desinstalar y reinstalar app

## 🔧 Herramientas de Debug

### Logs de la App

La app envía logs al backend automáticamente:

```typescript
// Ver en Railway logs:
[APP] evento | dato1:valor1 | dato2:valor2
```

### Pantalla de Pruebas

```bash
# En la app:
# Configuración → Avanzado → Pantalla de pruebas

# Permite probar:
- Speech Recognition
- TTS
- Telegram
- SmartThings
- Claude
```

### Verificar Estado del Sistema

```bash
# En la app, ver:
- Badge de estado (Escuchando/Pensando/Hablando)
- Conexión a backend (verde = OK)
- Heartbeat activo (si monitoreo está ON)
```

## 📞 Obtener Ayuda

### Información para Reportar Bugs

Incluir siempre:

1. **Install ID**
   - Configuración → Acerca de → Install ID

2. **Plataforma y versión**
   - iOS 16.0 / Android 13

3. **Logs relevantes**
   - Copiar de Railway logs

4. **Pasos para reproducir**
   - Qué hiciste antes del error

5. **Comportamiento esperado vs actual**

### Contacto

- **Logs del backend:** Railway Dashboard → Logs
- **Crash reports:** Se envían automáticamente al chat de debug de Telegram
- **Soporte:** Contactar al equipo de desarrollo

## 🔮 Problemas Conocidos

### iOS

- Speech Recognition puede fallar en iOS < 15
- Permisos de micrófono deben darse en Settings, no en la app

### Android

- Algunos dispositivos Samsung tienen problemas con expo-speech-recognition
- Usar Deepgram como fallback

### Tablets

- Layout horizontal puede tener problemas en tablets muy viejas
- Modo vertical funciona mejor en tablets < 2018

## 📚 Referencias

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Troubleshooting](https://reactnative.dev/docs/troubleshooting)
- [Railway Logs](https://docs.railway.app/develop/logs)
