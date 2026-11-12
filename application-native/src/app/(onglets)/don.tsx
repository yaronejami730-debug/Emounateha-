// [APPLI] Faire un don. Le paiement se fait sur don.emounateha.fr (le [SITE], Stripe, reçu fiscal CERFA), ouvert dans le navigateur
// sécurisé intégré : c'est ce que demandent Apple et Google pour les dons à une association (pas d'achat intégré).
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoutonOr, Carte, ouvrirPaiement, Section } from '@/components/ui';
import { cagnottes, DON } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { useCharge } from '@/lib/use-charge';

// Moyens de paiement acceptés sur la page de don du [SITE] : mêmes logos, en petit.
const PAIEMENTS = [
  { n: 'PayPal', i: require('@/assets/images/paypal.png') }, { n: 'Klarna', i: require('@/assets/images/klarna.png') },
  { n: 'Visa', i: require('@/assets/images/visa.png') }, { n: 'Mastercard', i: require('@/assets/images/mastercard.png') },
  { n: 'Apple Pay', i: require('@/assets/images/applepay.png') }, { n: 'Google Pay', i: require('@/assets/images/googlepay.png') },
];
const MONTANTS = [18, 36, 54, 100, 180, 360];
const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

export default function Don() {
  const haut = useSafeAreaInsets().top;
  const cag = useCharge(cagnottes);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.creme }} contentContainerStyle={{ paddingTop: haut + 12, paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 18 }}>
        <Text style={s.titre}>Faire un don</Text>
        <Text style={s.sous}>Aidez-nous à les aider. Chaque don donne droit à un reçu fiscal.</Text>
      </View>
      <Section titre="Choisissez un montant">
        <View style={s.grille}>
          {MONTANTS.map(m => (
            <View key={m} style={s.case}>
              <BoutonOr titre={m + ' €'} onPress={() => ouvrirPaiement(DON + '/?montant=' + m + '&utm_source=appli')} />
            </View>
          ))}
        </View>
        <BoutonOr titre="Autre montant / don mensuel" onPress={() => ouvrirPaiement(DON + '/?utm_source=appli')} style={{ marginTop: 6 }} />
        <View style={s.pays}>
          {PAIEMENTS.map(p => (
            <View key={p.n} style={s.pl}>
              <Image source={p.i} style={s.plImg} contentFit="contain" />
              <Text style={s.plT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{p.n}</Text>
            </View>
          ))}
        </View>
      </Section>
      {cag.data && cag.data.length ? (
        <Section titre="Cagnottes en cours">
          {cag.data.map(b => (
            <Carte key={b.slug} style={{ marginBottom: 12 }}>
              <Text style={s.cagT}>{b.titre}</Text>
              {b.beneficiaire ? <Text style={s.cagB}>Pour {b.beneficiaire}</Text> : null}
              {b.objectif ? (
                <>
                  <View style={s.barre}><View style={[s.rempli, { width: `${Math.min(100, (b.collecte / b.objectif) * 100)}%` }]} /></View>
                  <Text style={s.cagS}>{eur(b.collecte)} sur {eur(b.objectif)} · {b.dons} don{b.dons > 1 ? 's' : ''}</Text>
                </>
              ) : null}
              <BoutonOr titre="Participer" onPress={() => ouvrirPaiement(b.lien)} style={{ marginTop: 12 }} />
            </Carte>
          ))}
        </Section>
      ) : null}
      <Text style={s.note}>Paiement sécurisé par Stripe sur don.emounateha.fr.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pays: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  pl: { alignItems: 'center', gap: 5, width: '15.5%' },
  plImg: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#142d32', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  plT: { fontFamily: F.r, fontSize: 9, color: C.gris, textAlign: 'center' },
  titre: { fontFamily: F.x, fontSize: 28, color: C.vert, textAlign: 'center' },
  sous: { fontFamily: F.r, fontSize: 14.5, lineHeight: 20, color: C.gris, marginTop: 4 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  case: { flexBasis: '30%', flexGrow: 1, marginBottom: 2 },
  cagT: { fontFamily: F.x, fontSize: 18, color: C.vert },
  cagB: { fontFamily: F.r, fontSize: 13.5, color: C.gris, marginTop: 2 },
  barre: { height: 8, borderRadius: 99, backgroundColor: C.trait, marginTop: 12, overflow: 'hidden' },
  rempli: { height: 8, borderRadius: 99, backgroundColor: C.or },
  cagS: { fontFamily: F.r, fontSize: 13, color: C.gris, marginTop: 6 },
  note: { fontFamily: F.r, fontSize: 12, color: C.gris, textAlign: 'center', marginTop: 24, paddingHorizontal: 30 },
});
