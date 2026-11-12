// [APPLI] Éléments repris du [SITE] : bouton doré, titre de section (trait doré), carte blanche, ouverture d'une page du site.
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Image as RNImage, Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { lienAsso } from '@/lib/api';
import { C, F } from '@/lib/theme';

// Ouverture de liens, sécurisée : https uniquement (mailto/tel vers l'appli Mail/Téléphone), jamais d'erreur non gérée.
export function ouvrir(url: unknown) {
  let u: URL; try { u = new URL(String(url || '')); } catch { return; }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') { Linking.openURL(u.toString()).catch(() => {}); return; }
  if (u.protocol !== 'https:') return;
  WebBrowser.openBrowserAsync(u.toString(), { controlsColor: C.vert, toolbarColor: C.creme, presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() => {});
}

// Paiement d'un don : seulement vers les adresses de l'association (sinon refusé).
// Règle Apple 3.2.2 : sans agrément « nonprofit » d'Apple, le paiement se fait hors de l'appli → Safari sur iPhone.
export function ouvrirPaiement(url: unknown) {
  const u = lienAsso(url); if (!u) return;
  if (Platform.OS === 'ios') Linking.openURL(u).catch(() => {}); else ouvrir(u);
}

// Bouton doré du site (.btn.gold / .urgc). police : 'cinzel' (boutons du site) ou 'inter' (boutons de cagnotte du site).
export function BoutonOr({ titre, onPress, grand, police = 'cinzel', style, texte }: { titre: string; onPress: () => void; grand?: boolean; police?: 'cinzel' | 'inter'; style?: StyleProp<ViewStyle>; texte?: StyleProp<TextStyle> }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.or, grand && s.orGrand, pressed && { transform: [{ scale: 0.97 }] }, style]}>
      <Text style={[police === 'cinzel' ? s.orCinzel : s.orInter, grand && { fontSize: 17 }, texte]} numberOfLines={2}>{titre}</Text>
    </Pressable>
  );
}

// Titre de section du site : h2 vert centré, trait doré, sous-titre gris.
export function Titre({ titre, sous, clair, petit }: { titre: string; sous?: string; clair?: boolean; petit?: boolean }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 16 }}>
      <Text style={[s.h2, petit && { fontSize: 21 }, clair && { color: '#e4cd8a' }]}>{titre}</Text>
      {sous ? <Text style={s.h2s}>{sous}</Text> : null}
      <View style={s.gline} />
    </View>
  );
}

export function Section({ titre, sous, children, style }: { titre?: string; sous?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.section, style]}>
      {titre ? <Titre titre={titre} sous={sous} /> : null}
      {children}
    </View>
  );
}

// Carte blanche du site (.card) : fond blanc, bord #e3ecec, coins 16, ombre légère.
export function Carte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.carte, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  h3: { fontFamily: F.x, fontSize: 15.5, lineHeight: 19, color: C.vert },
  p: { fontFamily: F.r, fontSize: 12.5, lineHeight: 17.5, color: C.gris },
  label: { fontFamily: F.b, fontSize: 11, letterSpacing: 0.8, color: C.or, textTransform: 'uppercase' },
});

const s = StyleSheet.create({
  or: { minHeight: 50, paddingVertical: 12, paddingHorizontal: 26, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orMoyen, experimental_backgroundImage: 'linear-gradient(180deg, #f0d98a 0%, #e2c46c 45%, #c4a24a 100%)', borderWidth: 1, borderColor: 'rgba(255,255,255,.6)', overflow: 'hidden', shadowColor: '#0e343a', shadowOpacity: 0.45, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  orGrand: { minHeight: 56 },
  orCinzel: { fontFamily: F.b, fontSize: 16, letterSpacing: 0.2, color: '#1b2b2d', textAlign: 'center' },
  orInter: { fontWeight: '700', fontSize: 16, color: '#1b2b2d', textAlign: 'center' },
  h2: { fontFamily: F.x, fontSize: 25, lineHeight: 32, color: C.vert, textAlign: 'center' },
  h2s: { fontFamily: F.r, fontSize: 14, lineHeight: 21, color: C.gris, textAlign: 'center', marginTop: 4, paddingHorizontal: 10 },
  gline: { width: 64, height: 3, borderRadius: 3, marginTop: 10, backgroundColor: C.or, experimental_backgroundImage: 'linear-gradient(90deg, #c4a24a, #e4cd8a, #c4a24a)' },
  section: { paddingHorizontal: 16, marginTop: 34 },
  carte: { backgroundColor: 'rgba(255,255,255,.94)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.trait, shadowColor: '#143c42', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

// Fond blanc du site avec son motif en filigrane (public/bg.png répété).
export function FondMotif({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <RNImage source={require('@/assets/images/motif.png')} resizeMode="repeat" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}
