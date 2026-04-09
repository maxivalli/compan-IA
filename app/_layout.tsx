import { Component, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { Platform, View, Text } from 'react-native';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { reportarCrash } from '../lib/ai';

void SplashScreen.preventAutoHideAsync();

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
// Captura errores en el árbol de componentes y los manda al backend para debug.

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    reportarCrash(
      error.message,
      (error.stack ?? '') + '\n--- componentStack ---\n' + (info?.componentStack ?? ''),
      Platform.OS,
      'ErrorBoundary',
    ).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0D0D14' }}>
          <Text style={{ color: '#ff6b6b', textAlign: 'center', fontSize: 16 }}>
            Algo salió mal. Reiniciá la app.{'\n\n'}
            <Text style={{ fontSize: 12, color: '#aaa' }}>{this.state.error.message}</Text>
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Actualización OTA ────────────────────────────────────────────────────────

async function chequearActualizacion() {
  try {
    if (!Updates.isEnabled) return;
    if (__DEV__) return;
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {}
}

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const [splashHecho, setSplashHecho] = useState(false);

  useEffect(() => { chequearActualizacion(); }, []);

  useEffect(() => {
    if (__DEV__) return;
    const prevHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      reportarCrash(
        error?.message ?? String(error),
        error?.stack ?? '',
        Platform.OS,
        isFatal ? 'FATAL' : 'non-fatal',
      ).catch(() => {});
      prevHandler(error, isFatal);
    });
    return () => { ErrorUtils.setGlobalHandler(prevHandler); };
  }, []);

  if (!splashHecho) {
    return (
      <ErrorBoundary>
        <AnimatedSplash onDone={() => setSplashHecho(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Tabs backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="configuracion" />
        <Tabs.Screen name="smartlink" />
        <Tabs.Screen name="animo" />
        <Tabs.Screen name="privacidad" />
        <Tabs.Screen name="onboarding" />
        <Tabs.Screen name="guia" />
        <Tabs.Screen name="nota/[id]" />
        <Tabs.Screen name="notas" />
      </Tabs>
    </ErrorBoundary>
  );
}
