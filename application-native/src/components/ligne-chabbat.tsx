// [APPLI] Chabbat en une seule ligne fine (hauteur d'un bouton) : paracha · entrée · sortie · ville.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Chabbat, Ville } from '@/lib/api';
import { C, F } from '@/lib/theme';

export function LigneChabbat({ ville, c, onPress }: { ville: Ville; c: Chabbat | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.l, pressed && { opacity: 0.85 }]} accessibilityLabel={`Chabbat ${c?.paracha || ''}, entrée ${c?.allumage || ''}, sortie ${c?.sortie || ''}, ${ville.nom}`}>
      <Text style={s.par} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{c?.paracha || '…'}</Text>
      <View style={s.sep} />
      <Text style={s.lab}>Entrée <Text style={s.h}>{c?.allumage || '–'}</Text></Text>
      <View style={s.sep} />
      <Text style={s.lab}>Sortie <Text style={s.h}>{c?.sortie || '–'}</Text></Text>
      <View style={s.sep} />
      <Text style={s.ville} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{ville.nom}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  l: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ecd9a0', shadowColor: '#143c42', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  par: { fontFamily: F.x, fontSize: 12, color: C.vert, flexShrink: 1 },
  sep: { width: 1, height: 14, backgroundColor: '#ecd9a0' },
  lab: { fontFamily: F.r, fontSize: 9.5, color: C.gris, flexShrink: 0 },
  h: { fontFamily: F.x, fontSize: 12, color: C.vert },
  ville: { fontFamily: F.b, fontSize: 10.5, color: '#8a6c1c', flexShrink: 1 },
});
