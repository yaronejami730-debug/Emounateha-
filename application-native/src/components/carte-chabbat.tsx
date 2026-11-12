// [APPLI] Bloc Chabbat de l'accueil du [SITE] : paracha à gauche, entrée et sortie à droite, ville, lien vers tous les horaires.
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { styles as u } from '@/components/ui';
import type { Chabbat, Ville } from '@/lib/api';
import { C, F } from '@/lib/theme';

export function CarteChabbat({ ville, c, onVille, onTout }: { ville: Ville; c: Chabbat | null; onVille?: () => void; onTout?: () => void }) {
  return (
    <View style={s.c}>
      <View style={s.haut}>
        <View style={s.par}>
          <Image source={require('@/assets/images/tuiles/torah.png')} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1 }}>
            <Text style={u.label}>Paracha de la semaine</Text>
            <Text style={s.parNom}>{c?.paracha || '…'}</Text>
            {c?.parachaHe ? <Text style={s.parHe}>{c.parachaHe}</Text> : null}
          </View>
        </View>
        <View style={s.heures}>
          <View style={s.h}>
            <Text style={u.label}>Entrée du Chabbat</Text>
            <Text style={s.t}>{c?.allumage || '…'}</Text>
            <Text style={s.j}>{c?.allumageJour}</Text>
          </View>
          <View style={[s.h, s.trait]}>
            <Text style={u.label}>Sortie du Chabbat</Text>
            <Text style={s.t}>{c?.sortie || '…'}</Text>
            <Text style={s.j}>{c?.sortieJour}</Text>
          </View>
        </View>
      </View>
      <View style={s.bas}>
        <Text style={u.label}>Votre ville</Text>
        <Pressable onPress={onVille} style={s.ville}><Text style={s.villeT}>{ville.nom}</Text><Text style={s.villeF}>▾</Text></Pressable>
        <Text style={s.note}>Touchez pour changer de ville · {c?.note || ''}</Text>
        <Text style={s.src}>Horaires : fr.chabad.org · Parachat : hebcal.com</Text>
        {onTout ? <Pressable onPress={onTout} style={s.tout}><Text style={s.toutT}>Voir tous les horaires de votre ville ➔</Text></Pressable> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  c: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: C.trait, overflow: 'hidden', shadowColor: '#143c42', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  haut: { flexDirection: 'row' },
  par: { flex: 1, padding: 14, gap: 8, backgroundColor: '#eef5f5', flexDirection: 'row', alignItems: 'center' },
  parNom: { fontFamily: F.b, fontSize: 20, lineHeight: 23, color: C.vert, marginTop: 2 },
  parHe: { fontFamily: F.he, fontSize: 18, color: C.vertFonce },
  heures: { flex: 1 },
  h: { padding: 12 },
  trait: { borderTopWidth: 1, borderTopColor: C.trait },
  t: { fontFamily: F.x, fontSize: 20, color: C.vert, marginTop: 2 },
  j: { fontFamily: F.r, fontSize: 12, color: C.gris },
  bas: { padding: 14, borderTopWidth: 1, borderTopColor: C.trait },
  ville: { marginTop: 6, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d9c27a', borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fffaf0' },
  villeT: { flex: 1, fontFamily: F.b, fontSize: 18, color: C.vert },
  villeF: { color: C.or, fontSize: 12 },
  note: { fontFamily: F.r, fontSize: 12.5, color: C.gris, marginTop: 6 },
  src: { fontFamily: F.r, fontSize: 9, color: '#9aa9ab', marginTop: 4 },
  tout: { marginTop: 14, borderRadius: 99, borderWidth: 1, borderColor: '#ecd9a0', backgroundColor: '#fff7e0', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  toutT: { fontFamily: F.b, fontSize: 14, color: '#8a6c1c', textAlign: 'center' },
});
