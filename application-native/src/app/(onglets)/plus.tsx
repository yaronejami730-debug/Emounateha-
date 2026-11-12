// [APPLI] Plus : liens vers les autres parties du [SITE] (ambassadeur, écrire au Rabbi…), contact, réseaux, mentions.
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Carte, ouvrir, Section } from '@/components/ui';
import { AMBASSADEUR, SITE } from '@/lib/api';
import { C, F } from '@/lib/theme';

type Lien = { t: string; d?: string; go: () => void };
const site = (p: string) => () => ouvrir(SITE + p);

const GROUPES: { titre: string; liens: Lien[] }[] = [
  { titre: 'Participer', liens: [
    { t: 'Devenir ambassadeur', d: 'Faites connaître l’association autour de vous', go: () => ouvrir(AMBASSADEUR) },
    { t: 'Écrire au Rabbi', d: 'Igrot Kodesh', go: site('/ecrire-au-rabbi/') },
  ] },
  { titre: 'Nous contacter', liens: [
    { t: 'WhatsApp', d: '06 69 67 07 70', go: () => Linking.openURL('https://wa.me/33669670770').catch(() => {}) },
    { t: 'Appeler', d: '06 69 67 07 70', go: () => Linking.openURL('tel:+33669670770').catch(() => {}) },
    { t: 'E-mail', d: 'emounateha770@gmail.com', go: () => Linking.openURL('mailto:emounateha770@gmail.com').catch(() => {}) },
  ] },
  { titre: 'Nous suivre', liens: [
    { t: 'Instagram', go: () => Linking.openURL('https://www.instagram.com/emounateha').catch(() => {}) },
    { t: 'Facebook', go: () => Linking.openURL('https://www.facebook.com/share/1HhyHMPNPd/').catch(() => {}) },
    { t: 'YouTube', go: () => Linking.openURL('https://youtube.com/@emounateharaba-h4b').catch(() => {}) },
    { t: 'TikTok', go: () => Linking.openURL('https://www.tiktok.com/@emounateha').catch(() => {}) },
  ] },
  { titre: 'Informations', liens: [
    { t: 'Site emounateha.fr', go: site('/') },
    { t: 'Politique de confidentialité', go: site('/confidentialite/') },
    { t: 'Mentions légales', go: site('/mentions-legales/') },
  ] },
];

export default function Plus() {
  const haut = useSafeAreaInsets().top;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.creme }} contentContainerStyle={{ paddingTop: haut + 12, paddingBottom: 40 }}>
      <View style={s.tete}>
        <Image source={require('@/assets/images/logo-rond.png')} style={{ width: 64, height: 64 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.titre}>Émounatéha</Text>
          <Text style={s.sous}>Sensibiliser · Aider · Distribuer</Text>
        </View>
      </View>
      {GROUPES.map(g => (
        <Section key={g.titre} titre={g.titre}>
          <Carte style={{ paddingVertical: 0 }}>
            {g.liens.map((l, i) => (
              <Pressable key={l.t} onPress={l.go} style={({ pressed }) => [s.ligne, i > 0 && s.trait, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.t}>{l.t}</Text>
                  {l.d ? <Text style={s.d}>{l.d}</Text> : null}
                </View>
                <Text style={s.f}>›</Text>
              </Pressable>
            ))}
          </Carte>
        </Section>
      ))}
      <Text style={s.version}>Version {Constants.expoConfig?.version}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tete: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 },
  titre: { fontFamily: F.x, fontSize: 26, color: C.vert },
  sous: { fontFamily: F.r, fontSize: 13.5, color: C.gris },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#d5dfdf' },
  t: { fontFamily: F.b, fontSize: 15.5, color: C.vert },
  d: { fontFamily: F.r, fontSize: 13, color: C.gris, marginTop: 2 },
  f: { fontFamily: F.r, fontSize: 22, color: C.or },
  version: { textAlign: 'center', color: C.gris, fontSize: 12, marginTop: 24 },
});
