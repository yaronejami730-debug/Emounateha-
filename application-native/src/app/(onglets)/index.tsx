// [APPLI] Accueil : la même page que l'accueil du [SITE] www.emounateha.fr, dans le même ordre et avec les mêmes textes.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banderole } from '@/components/banderole';
import { LigneChabbat } from '@/components/ligne-chabbat';
import { ChoixVille } from '@/components/choix-ville';
import { BoutonOr, Carte, FondMotif, ouvrir, ouvrirPaiement, Section, styles as u, Titre } from '@/components/ui';
import { actualites, cagnottes, chabbat, dateHebraique, DON, SITE } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { useCharge } from '@/lib/use-charge';
import { useVille } from '@/lib/ville';

const T = (n: string) => ({
  colis: require('@/assets/images/tuiles/colis.png'), torah: require('@/assets/images/tuiles/torah.png'), horaires: require('@/assets/images/tuiles/horaires.png'),
  ecrire: require('@/assets/images/tuiles/ecrire.png'), reinsertion: require('@/assets/images/tuiles/act-reinsertion.png'), vetements: require('@/assets/images/tuiles/act-vetements.png'),
  toit: require('@/assets/images/tuiles/act-toit.png'), soutien: require('@/assets/images/tuiles/act-soutien.png'), don: require('@/assets/images/tuiles/step-don.png'),
  ecrire2: require('@/assets/images/tuiles/step-ecrire.png'), partager: require('@/assets/images/tuiles/step-partager.png'),
} as Record<string, number>)[n];

const WHATSAPP = 'https://wa.me/33669670770';
const RACCOURCIS = [
  { t: 'Colis de Chabbat', d: 'et de fêtes, aux familles', i: 'colis', go: () => ouvrir(SITE + '/colis/') },
  { t: 'Diffusion de la Torah', d: 'Vidéo et cours chaque jour', i: 'torah', go: () => ouvrir(SITE + '/torah/') },
  { t: 'Horaires', d: 'Chabbat, allumage · havdala', i: 'horaires', go: () => router.navigate('/horaires') },
  { t: 'Nous écrire', d: 'Sur WhatsApp', i: 'ecrire', go: () => Linking.openURL(WHATSAPP).catch(() => {}) },
];
const ACTIONS = [
  { t: 'Réinsertion sociale', d: 'Un suivi personnalisé pour retrouver un équilibre et une place dans la société.', i: 'reinsertion', u: '/reinsertion-sociale/' },
  { t: 'Vêtements & soins', d: 'De nouveaux vêtements, une coiffure : se sentir bien pour repartir du bon pied.', i: 'vetements', u: '/vetements-et-soins/' },
  { t: 'Un toit sur la tête', d: 'Aider à trouver un logement et à sortir de la rue durablement.', i: 'toit', u: '/un-toit-sur-la-tete/' },
  { t: 'Soutien moral & financier', d: 'Une écoute, un accompagnement et une aide matérielle quand c’est le plus difficile.', i: 'soutien', u: '/soutien-moral-et-financier/' },
];
const AIDER = [
  { t: 'Faire un don', d: 'Un don en ligne, sécurisé, sur notre page de don. Chaque montant compte.', i: 'don', go: () => ouvrirPaiement(DON) },
  { t: 'Nous écrire', d: 'Une question, une idée, une famille à aider ? Écrivez-nous sur WhatsApp.', i: 'ecrire2', go: () => Linking.openURL(WHATSAPP).catch(() => {}) },
  { t: 'Partager', d: 'Faites connaître Émounatéha autour de vous, sur nos réseaux et dans vos cercles.', i: 'partager', go: () => Share.share({ message: 'Émounatéha aide les familles dans le besoin : ' + SITE }) },
];

// Bandeau Hanouka du haut du site (hanouka-annonce.js) : compte des jours, heure de Paris, jusqu'au 7 déc. 2026.
function BandeauHanouka() {
  const fin = new Date('2026-12-07T23:59:59+01:00').getTime(), premier = new Date('2026-12-04T17:00:00+01:00').getTime();
  if (Date.now() > fin) return null;
  const auj = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  let d = Math.round((Date.parse('2026-12-04T12:00:00Z') - Date.parse(auj + 'T12:00:00Z')) / 86400000);
  if (d <= 0 && Date.now() > premier) d = -1;
  const quand = d > 1 ? <>dans <Text style={s.hnB}>{d} jours</Text></> : d === 1 ? <Text style={s.hnB}>demain soir</Text> : d === 0 ? <Text style={s.hnB}>ce soir</Text> : <Text style={s.hnB}>c’est Hanouka</Text>;
  return (
    <Pressable onPress={() => ouvrirPaiement(DON + '/?aff=hanouka')} style={s.hn}>
      <Image source={require('@/assets/images/hanoukia.png')} style={{ width: 22, height: 22 }} />
      <Text style={s.hnT}><Text style={s.hnB}>HANOUKA</Text>  {quand}</Text>
      <View style={s.hnBtn}><Text style={s.hnBtnT}>Offrir un colis</Text></View>
    </Pressable>
  );
}

export default function Accueil() {
  const haut = useSafeAreaInsets().top;
  const { ville } = useVille();
  const [choix, setChoix] = useState(false);
  const actus = useCharge(actualites);
  const cag = useCharge(cagnottes);
  const ch = useCharge(() => chabbat(ville), [ville.id]);
  const dh = useCharge(() => dateHebraique(ville), [ville.id]);
  const [tire, setTire] = useState(false);
  const actualiser = async () => { setTire(true); await Promise.all([actus.recharger(), cag.recharger(), ch.recharger(), dh.recharger()]); setTire(false); };

  return (
    <FondMotif>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={tire} onRefresh={actualiser} tintColor={C.orClair} progressViewOffset={haut} />}>
        {/* En-tête du site : date hébraïque et civile, ב״ה, logo complet, devise, citation */}
        <View style={[s.hero, { paddingTop: haut + 8 }]}>
          <Image source={require('@/assets/images/fond-vert.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
          <BandeauHanouka />
          <View style={s.top}>
            <View style={{ width: 40 }} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={s.dateHe}>{dh.data?.he || ' '}</Text>
              <Text style={s.dateCiv}>{dh.data?.civil || ' '}</Text>
            </View>
            <Text style={s.bsd}>ב״ה</Text>
          </View>
          <Pressable onPress={() => ouvrirPaiement(DON + '/?aff=besoin')} accessibilityLabel="Faire un don — là où le besoin est le plus grand">
            <Image source={require('@/assets/images/logo-complet.png')} style={s.logo} contentFit="contain" />
          </Pressable>
          <Text style={s.slogan}>Sensibiliser · Aider · Lutter · Distribuer · Favoriser</Text>
          <Text style={s.quote}>Accueillons Machia’h avec des actes de bonté et de bienveillance !</Text>
          <View style={{ height: 14 }} />
          <View style={{ alignSelf: 'stretch', paddingHorizontal: 16 }}><Banderole liste={actus.data || []} /></View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <LigneChabbat ville={ville} c={ch.data} onPress={() => setChoix(true)} />
        </View>

        {cag.data && cag.data.length ? (
          <View style={s.cags}>{cag.data.map(b => <BoutonOr key={b.slug} titre={b.titre} police="inter" onPress={() => ouvrirPaiement(b.lien)} style={cag.data!.length > 1 ? s.cagDemi : { paddingHorizontal: 26 }} />)}</View>
        ) : null}

        <View style={s.grille}>
          {RACCOURCIS.map(r => (
            <Pressable key={r.t} onPress={r.go} style={({ pressed }) => [s.demi, pressed && { opacity: 0.85 }]}>
              <Carte style={s.raccourci}>
                <Image source={T(r.i)} style={{ width: 52, height: 52 }} />
                <Text style={[u.h3, { fontSize: 17, lineHeight: 20 }]}>{r.t}</Text>
                <Text style={u.p}>{r.d}</Text>
              </Carte>
            </Pressable>
          ))}
        </View>


        <Section>
          <Titre titre="Parole du Rabbi" petit />
          <Carte style={s.rabbi}>
            <View style={{ flex: 1.2 }}>
              <Text style={s.citRabbi}>« Rien n’est jamais perdu. On peut toujours réparer. Celui qui est impur ou éloigné, même s’il est responsable d’un tel état de fait, même s’il l’a voulu, peut, malgré tout, réparer. »</Text>
              <View style={s.signe}><Text style={s.signeT}>Rabbi de Loubavitch</Text><Image source={require('@/assets/images/tuiles/drapeau-machiah.png')} style={{ width: 42, height: 28 }} /></View>
            </View>
            <Image source={require('@/assets/images/rebbe.jpg')} style={s.rebbe} contentFit="cover" />
          </Carte>
          <BoutonOr titre="✉  Écrire une lettre au Rabbi" onPress={() => ouvrir(SITE + '/ecrire-au-rabbi/')} style={{ marginTop: 16, marginHorizontal: 24 }} />
        </Section>

        <Section>
          <Titre titre="Qui sommes-nous ?" />
          <Text style={s.qui}>
            <Text style={s.quiB}>Émounatéha</Text> est une association à but non lucratif. Nous venons en aide aux <Text style={s.quiB}>familles nécessiteuses</Text> et aux <Text style={s.quiB}>personnes sans-abri</Text>, avec un objectif : leur redonner dignité, stabilité et une place dans la société.
          </Text>
        </Section>

        <Section titre="Nos actions" sous="Un accompagnement concret, du premier repas jusqu’au retour à l’autonomie.">
          <View style={[s.grille, { paddingHorizontal: 0, marginTop: 0 }]}>
            {ACTIONS.map(a => (
              <Pressable key={a.t} onPress={() => ouvrir(SITE + a.u)} style={({ pressed }) => [s.demi, pressed && { opacity: 0.85 }]}>
                <Carte style={{ flex: 1, gap: 6 }}>
                  <Image source={T(a.i)} style={{ width: 44, height: 44, alignSelf: 'center' }} />
                  <Text style={u.h3}>{a.t}</Text>
                  <Text style={u.p}>{a.d}</Text>
                </Carte>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section titre="Comment nous aider" sous="Trois façons simples d’allumer une lumière.">
          {AIDER.map(a => (
            <Pressable key={a.t} onPress={a.go} style={({ pressed }) => [{ marginBottom: 12 }, pressed && { opacity: 0.85 }]}>
              <Carte style={s.aide}>
                <Image source={T(a.i)} style={{ width: 62, height: 62 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[u.h3, { fontSize: 16.5 }]}>{a.t}</Text>
                  <Text style={[u.p, { fontSize: 13.5, lineHeight: 19 }]}>{a.d}</Text>
                </View>
              </Carte>
            </Pressable>
          ))}
        </Section>

        <View style={s.donBloc}>
          <Image source={require('@/assets/images/fond-vert.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Titre titre="Aidez-nous à les aider" clair />
          <Text style={s.donP}>Chaque don, même modeste, change une vie. Votre générosité permet de financer repas, vêtements, hébergement et accompagnement.</Text>
          <BoutonOr titre="Faire un don" onPress={() => ouvrirPaiement(DON)} style={{ alignSelf: 'center', marginTop: 18, paddingHorizontal: 30 }} />
          <Text style={s.cerfa}>🧾 <Text style={{ color: C.orClair, fontFamily: F.b }}>Reçu fiscal CERFA instantané</Text> : envoyé en PDF par e-mail, juste après votre paiement.</Text>
        </View>
      </ScrollView>
      <ChoixVille ouvert={choix} fermer={() => setChoix(false)} />
    </FondMotif>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 26, overflow: 'hidden' },
  hn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, alignSelf: 'stretch', marginHorizontal: 12, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99, backgroundColor: 'rgba(10,46,52,.45)', borderWidth: 1, borderColor: 'rgba(240,217,138,.35)' },
  hnT: { fontFamily: F.b, fontSize: 13, color: '#fff' },
  hnB: { fontFamily: F.x, color: '#f0d98a' },
  hnBtn: { borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: C.orMoyen, experimental_backgroundImage: 'linear-gradient(180deg, #f0d98a 0%, #e2c46c 45%, #c4a24a 100%)' },
  hnBtnT: { fontFamily: F.x, fontSize: 11.5, color: '#1b2b2d' },
  top: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 16 },
  dateHe: { fontFamily: F.he, fontSize: 19, color: '#f6e094' },
  dateCiv: { fontFamily: F.b, fontSize: 11, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase' },
  bsd: { width: 40, textAlign: 'right', fontFamily: F.he, fontSize: 20, color: '#e4cd8a' },
  logo: { width: 136, height: 214, marginTop: 12 },
  slogan: { fontFamily: F.r, fontSize: 12.5, color: '#fff', marginTop: 12, textAlign: 'center', paddingHorizontal: 16 },
  quote: { fontFamily: F.b, fontSize: 15, lineHeight: 22.5, letterSpacing: 0.6, color: '#f6e094', textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  cags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 16, marginTop: 22 },
  cagDemi: { flexBasis: '47%', flexGrow: 1, paddingHorizontal: 12 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginTop: 22 },
  demi: { flexBasis: '47%', flexGrow: 1 },
  raccourci: { flex: 1, gap: 4, paddingVertical: 16 },
  mail: { marginTop: 18, borderRadius: 99, borderWidth: 1, borderColor: '#ecd9a0', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  mailT: { fontFamily: F.b, fontSize: 12, color: '#8a6c1c', textAlign: 'center' },
  rabbi: { flexDirection: 'row', gap: 12, alignItems: 'center', borderColor: '#ecd9a0', paddingRight: 0, overflow: 'hidden' },
  citRabbi: { fontFamily: F.r, fontStyle: 'italic', fontSize: 14, lineHeight: 22, color: C.vert, textAlign: 'center' },
  signe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.trait, marginTop: 12, paddingTop: 8 },
  signeT: { fontFamily: F.b, fontSize: 10, color: '#8a6c1c', textTransform: 'uppercase' },
  rebbe: { flex: 1, aspectRatio: 0.85, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  qui: { fontFamily: F.r, fontSize: 16, lineHeight: 26.4, color: C.encre, textAlign: 'center' },
  quiB: { fontFamily: F.x, color: C.vert },
  aide: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18 },
  donBloc: { marginHorizontal: 16, marginTop: 34, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 20, paddingVertical: 28, backgroundColor: C.vert, shadowColor: '#143c42', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 14 } },
  donP: { fontFamily: F.r, fontSize: 14.5, lineHeight: 24, color: '#fff', textAlign: 'center' },
  cerfa: { fontFamily: F.r, fontSize: 13, lineHeight: 21, color: '#fff', textAlign: 'center', marginTop: 16 },
});
