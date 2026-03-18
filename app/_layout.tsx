import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import * as Updates from 'expo-updates';

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

export default function Layout() {
  useEffect(() => { chequearActualizacion(); }, []);

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="configuracion" />
      <Tabs.Screen name="animo" />
      <Tabs.Screen name="privacidad" />
      <Tabs.Screen name="onboarding" />
    </Tabs>
  );
}
