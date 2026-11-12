// [APPLI] Actualités Habad (hassidout.org, avec leur accord) : même flux que la page /news/ du [SITE].
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actualites, dateCourte, slugDe, type Actu } from '@/lib/api';
import { C, F, ombre, serif } from '@/lib/theme';
import { useCharge } from '@/lib/use-charge';

export default function Actualites() {
  const haut = useSafeAreaInsets().top;
  const { data, erreur, chargement, recharger } = useCharge(actualites);
  const ouvrirArticle = (a: Actu) => router.push({ pathname: '/article/[slug]', params: { slug: slugDe(a.lien) } });

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.creme }}
      contentContainerStyle={{ paddingTop: haut + 12, paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}
      data={data || []}
      keyExtractor={a => a.lien}
      refreshing={chargement && !!data}
      onRefresh={recharger}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <Text style={s.titre}>Actualités</Text>
          <Text style={s.sous}>Le monde Habad Loubavitch, chaque jour. Avec hassidout.org.</Text>
          {chargement && !data ? <ActivityIndicator color={C.vert} style={{ marginTop: 30 }} /> : null}
          {erreur && !data ? <Text style={s.err}>Impossible de charger les actualités. Tirez vers le bas pour réessayer.</Text> : null}
        </View>
      }
      renderItem={({ item: a, index }) => (
        <Pressable onPress={() => ouvrirArticle(a)} style={({ pressed }) => [s.carte, pressed && { transform: [{ scale: 0.985 }] }]}>
          {a.image ? <Image source={{ uri: a.image }} style={index === 0 ? s.imgUne : s.img} contentFit="cover" transition={300} /> : null}
          <View style={{ padding: 14, gap: 6 }}>
            <Text style={s.k}>{[a.rubrique, dateCourte(a.date)].filter(Boolean).join(' · ').toUpperCase()}{a.audio ? '  ·  🎧 AUDIO' : ''}</Text>
            <Text style={[s.h, index === 0 && { fontSize: 21, lineHeight: 26 }]} numberOfLines={3}>{a.titre}</Text>
            {a.resume ? <Text style={s.r} numberOfLines={index === 0 ? 4 : 2}>{a.resume}</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  titre: { fontFamily: F.x, fontSize: 28, color: C.vert, textAlign: 'center' },
  sous: { fontFamily: F.r, fontSize: 14, color: C.gris, marginTop: 2, textAlign: 'center' },
  err: { color: '#a33', marginTop: 20, textAlign: 'center' },
  carte: { backgroundColor: C.carte, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trait, ...ombre, shadowOpacity: 0.08 },
  imgUne: { width: '100%', aspectRatio: 16 / 9, backgroundColor: C.trait },
  img: { width: '100%', aspectRatio: 2.4, backgroundColor: C.trait },
  k: { fontFamily: F.b, fontSize: 10.5, letterSpacing: 0.8, color: C.or },
  h: { fontFamily: serif, fontSize: 17.5, lineHeight: 22, color: C.encre },
  r: { fontSize: 14, lineHeight: 20, color: C.gris },
});
