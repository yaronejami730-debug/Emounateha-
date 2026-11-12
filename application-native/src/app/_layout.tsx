// [APPLI] Racine : les onglets, et par-dessus l'écran de lecture d'un article.
import { Cinzel_400Regular, Cinzel_600SemiBold, Cinzel_700Bold, Cinzel_800ExtraBold } from '@expo-google-fonts/cinzel';
import { FrankRuhlLibre_500Medium, FrankRuhlLibre_700Bold } from '@expo-google-fonts/frank-ruhl-libre';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { C } from '@/lib/theme';
import { VilleProvider } from '@/lib/ville';

SplashScreen.preventAutoHideAsync();

export default function Racine() {
  const [polices, erreur] = useFonts({ Cinzel_400Regular, Cinzel_600SemiBold, Cinzel_700Bold, Cinzel_800ExtraBold, FrankRuhlLibre_500Medium, FrankRuhlLibre_700Bold });
  const pret = polices || !!erreur;
  useEffect(() => { if (pret) SplashScreen.hideAsync(); }, [pret]);
  if (!pret) return null;
  return (
    <VilleProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTintColor: C.vert, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: C.creme } }}>
        <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
        <Stack.Screen name="article/[slug]" options={{ title: '', headerTransparent: true }} />
      </Stack>
    </VilleProvider>
  );
}

// Filet de sécurité global : en cas d'erreur, un écran calme au lieu d'une appli qui se ferme.
export function ErrorBoundary({ retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 18, color: C.vert, textAlign: 'center', marginBottom: 16 }}>Un problème est survenu.</Text>
      <Pressable onPress={retry} style={{ backgroundColor: C.orMoyen, borderRadius: 99, paddingVertical: 12, paddingHorizontal: 26 }}><Text style={{ fontWeight: '700', color: '#1b2b2d' }}>Réessayer</Text></Pressable>
    </View>
  );
}
