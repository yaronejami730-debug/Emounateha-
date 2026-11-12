// [APPLI] Lecture d'un article, en natif (texte nettoyé par le [SITE], /api/news/article).
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { HtmlTexte } from '@/components/html-texte';
import { BoutonOr, ouvrir, ouvrirPaiement } from '@/components/ui';
import { article, dateCourte, DON, SITE } from '@/lib/api';
import { C, serif } from '@/lib/theme';
import { useCharge } from '@/lib/use-charge';

export default function Lecture() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: a, erreur } = useCharge(() => article(String(slug)), [slug]);

  if (erreur) return <Text style={s.err}>Article indisponible pour le moment.</Text>;
  if (!a) return <ActivityIndicator color={C.vert} style={{ marginTop: 140 }} />;
  const adresse = SITE + '/news/?a=' + encodeURIComponent(String(slug));
  const audio = /<audio/.test(a.html || '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 50 }} contentInsetAdjustmentBehavior="never">
      {a.image ? <Image source={{ uri: a.image }} style={s.img} contentFit="cover" transition={300} /> : <View style={{ height: 110 }} />}
      <View style={s.corps}>
        <Text style={s.k}>{[a.rubrique, dateCourte(a.date)].filter(Boolean).join(' · ').toUpperCase()}</Text>
        <Text style={s.titre}>{a.titre}</Text>
        {audio ? <BoutonOr titre="🎧  Écouter l’enregistrement" onPress={() => ouvrir(adresse)} style={{ marginBottom: 20 }} /> : null}
        <HtmlTexte html={a.html} />
        <Text style={s.credit} onPress={() => ouvrir(a.lien)}>Article repris de hassidout.org, avec leur accord. Voir l’original ›</Text>
        <View style={s.don}>
          <Text style={s.donT}>Vous aimez ces nouvelles ?</Text>
          <Text style={s.donS}>Émounatéha aide les familles dans le besoin. Votre don ouvre droit à un reçu fiscal.</Text>
          <BoutonOr titre="Faire un don" onPress={() => ouvrirPaiement(DON)} style={{ marginTop: 12 }} />
        </View>
        <Text style={s.partage} onPress={() => Share.share({ message: a.titre + '\n' + adresse })}>Partager l’article</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  img: { width: '100%', aspectRatio: 4 / 3, backgroundColor: C.trait },
  corps: { paddingHorizontal: 20, paddingTop: 18 },
  k: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: C.or },
  titre: { fontFamily: serif, fontSize: 27, lineHeight: 33, color: C.vertFonce, marginTop: 8, marginBottom: 18 },
  credit: { fontSize: 13, color: C.gris, marginTop: 8, fontStyle: 'italic' },
  don: { marginTop: 26, borderRadius: 20, padding: 18, backgroundColor: C.vertFonce, experimental_backgroundImage: 'linear-gradient(135deg, #1f6a72 0%, #0e3e44 100%)' },
  donT: { color: '#fff', fontFamily: serif, fontSize: 20 },
  donS: { color: 'rgba(255,255,255,.85)', fontSize: 14, lineHeight: 20, marginTop: 6 },
  partage: { color: C.vert, fontWeight: '700', textAlign: 'center', marginTop: 22, fontSize: 15 },
  err: { marginTop: 140, textAlign: 'center', color: C.gris },
});

// Filet de sécurité : une erreur dans un article n'éteint jamais l'appli.
export function ErrorBoundary({ retry }: { error: Error; retry: () => void }) {
  return <Text style={[s.err, { color: C.vert }]} onPress={retry}>Cet article ne peut pas s’afficher. Touchez pour réessayer.</Text>;
}
