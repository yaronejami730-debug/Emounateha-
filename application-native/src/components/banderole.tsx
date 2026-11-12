// [APPLI] Banderole de diffusion, copie de celle de l'accueil du [SITE] (public/bandeau-actus.js) :
// une seule file, un élément toutes les 4 minutes ; la banderole Hanouka n'est qu'un passage par tour (jusqu'au 7 déc. 2026).
// Même calcul que le site (créneau = heure / 4 min) : le site et l'appli montrent la même chose au même moment.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ouvrirPaiement } from '@/components/ui';
import { DON, type Actu } from '@/lib/api';
import { C } from '@/lib/theme';

const PAS = 4 * 60 * 1000;
const FIN_HANOUKA = new Date('2026-12-07T23:59:59+01:00').getTime();
const fond = require('@/assets/images/fond-vert.jpg');

export function Banderole({ liste }: { liste: Actu[] }) {
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!liste.length) return null;
  const hanouka = maintenant <= FIN_HANOUKA;
  const slot = Math.floor(maintenant / PAS), n = liste.length + (hanouka ? 1 : 0), i = slot % n;

  if (hanouka && i === n - 1) {
    return (
      <Pressable onPress={() => ouvrirPaiement(DON + '/?aff=hanouka')} style={({ pressed }) => [s.b, pressed && s.appui]} accessibilityLabel="Hanouka : offrez la lumière à une famille">
        <Image source={require('@/assets/images/hanouka-banderole.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Pressable>
    );
  }
  const a = liste[i];
  return (
    <Pressable onPress={() => router.navigate('/actualites')} style={({ pressed }) => [s.b, pressed && s.appui]} accessibilityLabel={'Actualité : ' + a.titre}>
      <Image source={fond} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(120deg, rgba(14,62,68,.25), rgba(10,46,52,.55))' }]} />
      <View style={s.photo}>
        <Image source={fond} style={StyleSheet.absoluteFill} contentFit="cover" />
        {a.image ? <Image source={{ uri: a.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} /> : null}
        <View style={s.fondu} />
      </View>
      <View style={s.texte}>
        <Text style={s.k} numberOfLines={1}>ACTUALITÉS</Text>
        <Text style={s.h} numberOfLines={3}>{a.titre}</Text>
        <Text style={s.l}>Toutes les actualités →</Text>
      </View>
    </Pressable>
  );
}

// Valeurs du site pour les écrans de téléphone (@media max-width:420px de bandeau-actus.js).
const s = StyleSheet.create({
  b: { marginHorizontal: 2, alignSelf: 'stretch', aspectRatio: 1046 / 380, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', backgroundColor: C.vert, borderWidth: 1.5, borderColor: 'rgba(240,217,138,.7)', shadowColor: '#08141c', shadowOpacity: 0.4, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
  appui: { transform: [{ scale: 0.985 }] },
  photo: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%' },
  fondu: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, experimental_backgroundImage: 'linear-gradient(90deg, rgba(22,82,89,.95) 0%, rgba(22,82,89,.45) 18%, rgba(22,82,89,0) 40%)' },
  texte: { width: '62%', paddingVertical: 10, paddingLeft: 14, paddingRight: 10, justifyContent: 'center', gap: 5 },
  k: { color: C.orClair, fontSize: 13, fontWeight: '800', letterSpacing: 1.6 },
  h: { color: '#fff', fontFamily: 'Georgia', fontSize: 17, lineHeight: 21, textShadowColor: 'rgba(8,30,34,.35)', textShadowRadius: 6 },
  l: { color: C.orClair, fontSize: 12, fontWeight: '700' },
});
