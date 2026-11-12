// [APPLI] Horaires : Chabbat de la semaine et horaires du jour, mêmes sources que le [SITE] (fr.chabad.org, Hebcal).
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarteChabbat } from '@/components/carte-chabbat';
import { ChoixVille } from '@/components/choix-ville';
import { Carte, FondMotif, ouvrir, Section, Titre } from '@/components/ui';
import { chabbat, SITE, zmanim } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { useCharge } from '@/lib/use-charge';
import { useVille } from '@/lib/ville';

export default function Horaires() {
  const haut = useSafeAreaInsets().top;
  const { ville } = useVille();
  const [choix, setChoix] = useState(false);
  const ch = useCharge(() => chabbat(ville), [ville.id]);
  const zm = useCharge(() => zmanim(ville), [ville.id]);

  return (
    <FondMotif>
      <ScrollView contentContainerStyle={{ paddingTop: haut + 16, paddingBottom: 40 }}>
        <Titre titre="Horaires" sous="Chabbat et horaires du jour, selon votre ville." />
        <View style={{ paddingHorizontal: 16 }}><CarteChabbat ville={ville} c={ch.data} onVille={() => setChoix(true)} /></View>
        <Section titre="Aujourd’hui" sous={ville.nom}>
          <Carte style={{ paddingVertical: 4 }}>
            {zm.chargement && !zm.data ? <ActivityIndicator color={C.vert} style={{ margin: 20 }} /> : null}
            {(zm.data || []).map((z, i) => (
              <View key={z.nom} style={[s.ligne, i > 0 && s.trait]}>
                <Text style={s.nom}>{z.nom}</Text>
                <Text style={s.h}>{z.heure}</Text>
              </View>
            ))}
            {zm.erreur ? <Text style={s.nom}>Horaires indisponibles. Réessayez plus tard.</Text> : null}
          </Carte>
          <Text style={s.note} onPress={() => ouvrir(SITE + '/horaires/')}>Source : fr.chabad.org · Voir la page Horaires du site ›</Text>
        </Section>
      </ScrollView>
      <ChoixVille ouvert={choix} fermer={() => setChoix(false)} />
    </FondMotif>
  );
}

const s = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#d5dfdf' },
  nom: { flex: 1, fontFamily: F.r, fontSize: 13.5, lineHeight: 18, color: C.encre },
  h: { fontFamily: F.x, fontSize: 16, color: C.vert },
  note: { fontFamily: F.r, fontSize: 11.5, color: C.gris, marginTop: 10, textAlign: 'center' },
});
