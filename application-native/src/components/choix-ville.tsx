// [APPLI] Choix de la ville des horaires (feuille native qui monte du bas), même liste que l'accueil du [SITE].
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VILLES, type Ville } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { useVille } from '@/lib/ville';

export function ChoixVille({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const { ville, setVille } = useVille();
  const choisir = (v: Ville) => { setVille(v); fermer(); };
  return (
    <Modal visible={ouvert} animationType="slide" presentationStyle="pageSheet" onRequestClose={fermer}>
      <View style={s.tete}>
        <Text style={s.titre}>Votre ville</Text>
        <Pressable onPress={fermer} hitSlop={12}><Text style={s.ok}>OK</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {VILLES.map(v => (
          <Pressable key={v.id} onPress={() => choisir(v)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: '#f3f7f7' }]}>
            <Text style={[s.nom, v.id === ville.id && { color: C.vert, fontFamily: F.x }]}>{v.nom}</Text>
            {v.id === ville.id ? <Text style={s.coche}>✓</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  tete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.trait },
  titre: { fontFamily: F.x, fontSize: 22, color: C.vert },
  ok: { fontFamily: F.b, fontSize: 16, color: C.or },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dde6e6' },
  nom: { flex: 1, fontFamily: F.b, fontSize: 17, color: C.encre },
  coche: { color: C.or, fontSize: 18, fontWeight: '700' },
});
