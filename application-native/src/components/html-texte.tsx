// [APPLI] Affiche en natif le texte d'un article (HTML déjà nettoyé côté [SITE] par news.js : peu de balises possibles).
// Pas de WebView : paragraphes, intertitres, citations, listes, images et liens deviennent de vrais composants.
import { Image } from 'expo-image';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ouvrir } from '@/components/ui';
import { C, serif } from '@/lib/theme';

type Noeud = { tag: string; attrs: Record<string, string>; enfants: (Noeud | string)[] };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—' };
const cp = (n: number) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');   // entité invalide : ignorée (sinon plantage)
const decode = (t: string) => t.replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => cp(parseInt(h, 16))).replace(/&#(\d{1,7});/g, (_, d) => cp(+d)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const VIDE = new Set(['br', 'hr', 'img', 'source']);
const JETE = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'noscript']);   // contenu jamais affiché

function arbre(html: string): Noeud {
  html = html.slice(0, 300000);   // garde-fou : article démesuré tronqué
  const racine: Noeud = { tag: 'racine', attrs: {}, enfants: [] }, pile = [racine];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const haut = pile[pile.length - 1];
    if (m[4] != null) { if (!JETE.has(haut.tag)) haut.enfants.push(decode(m[4])); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { const i = pile.map(n => n.tag).lastIndexOf(tag); if (i > 0) pile.length = i; continue; }
    const attrs: Record<string, string> = {}; m[3].replace(/([a-z-]+)="([^"]*)"/gi, (_, k, v) => { attrs[k.toLowerCase()] = decode(v); return ''; });
    const n: Noeud = { tag, attrs, enfants: [] };
    if (!JETE.has(pile[pile.length - 1].tag)) haut.enfants.push(n);
    if (!VIDE.has(tag) && pile.length < 60) pile.push(n);   // profondeur limitée
  }
  return racine;
}

const BLOCS = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'blockquote', 'ul', 'ol', 'li', 'figure', 'img', 'hr', 'audio', 'figcaption']);
const contientBloc = (n: Noeud): boolean => n.enfants.some(e => typeof e !== 'string' && (BLOCS.has(e.tag) || contientBloc(e)));

function enLigne(e: Noeud | string, k: number): ReactNode {
  if (typeof e === 'string') return e;
  const c = e.enfants.map(enLigne);
  switch (e.tag) {
    case 'strong': case 'b': return <Text key={k} style={{ fontWeight: '700' }}>{c}</Text>;
    case 'em': case 'i': return <Text key={k} style={{ fontStyle: 'italic' }}>{c}</Text>;
    case 'u': return <Text key={k} style={{ textDecorationLine: 'underline' }}>{c}</Text>;
    case 'a': return <Text key={k} style={s.lien} onPress={() => ouvrir(e.attrs.href)}>{c}</Text>;
    case 'br': return '\n';
    case 'sup': case 'sub': case 'small': return <Text key={k} style={{ fontSize: 13 }}>{c}</Text>;
    default: return <Fragment key={k}>{c}</Fragment>;
  }
}

function bloc(e: Noeud | string, k: number, liste?: { ordre: boolean; i: number }): ReactNode {
  if (typeof e === 'string') return e.trim() ? <Text key={k} style={s.p}>{e}</Text> : null;
  const inl = () => e.enfants.map(enLigne);
  const sous = () => e.enfants.map((x, i) => bloc(x, i));
  if (!BLOCS.has(e.tag) && contientBloc(e)) return <Fragment key={k}>{sous()}</Fragment>;
  switch (e.tag) {
    case 'h2': case 'h3': return <Text key={k} style={s.h2}>{inl()}</Text>;
    case 'h4': case 'h5': return <Text key={k} style={s.h4}>{inl()}</Text>;
    case 'blockquote': return <View key={k} style={s.citation}>{contientBloc(e) ? sous() : <Text style={[s.p, s.pCit]}>{inl()}</Text>}</View>;
    case 'ul': case 'ol': { let i = 0; return <View key={k} style={{ marginBottom: 12 }}>{e.enfants.map((x, j) => (typeof x !== 'string' && x.tag === 'li' ? bloc(x, j, { ordre: e.tag === 'ol', i: ++i }) : null))}</View>; }
    case 'li': return (<View key={k} style={s.li}><Text style={s.puce}>{liste?.ordre ? liste.i + '.' : '•'}</Text><View style={{ flex: 1 }}>{contientBloc(e) ? sous() : <Text style={[s.p, { marginBottom: 4 }]}>{inl()}</Text>}</View></View>);
    case 'figure': return <View key={k} style={{ marginBottom: 14 }}>{sous()}</View>;
    case 'figcaption': return <Text key={k} style={s.legende}>{inl()}</Text>;
    case 'img': return e.attrs.src ? <Image key={k} source={{ uri: e.attrs.src }} style={s.img} contentFit="cover" transition={300} accessibilityLabel={e.attrs.alt} /> : null;
    case 'hr': return <View key={k} style={s.hr} />;
    case 'audio': return null;   // MVP : l'audio s'écoute sur la page du site (bouton en bas de l'article)
    default: return <Text key={k} style={s.p}>{inl()}</Text>;
  }
}

export function HtmlTexte({ html }: { html: string }) {
  return <View>{arbre(html).enfants.map((e, i) => bloc(e, i))}</View>;
}

const s = StyleSheet.create({
  p: { fontFamily: serif, fontSize: 17.5, lineHeight: 28, color: C.encre, marginBottom: 14 },
  pCit: { fontStyle: 'italic', color: C.vertFonce, marginBottom: 0 },
  h2: { fontFamily: serif, fontSize: 22, lineHeight: 28, color: C.vertFonce, marginTop: 10, marginBottom: 10 },
  h4: { fontSize: 17, fontWeight: '700', color: C.vertFonce, marginTop: 6, marginBottom: 8 },
  citation: { borderLeftWidth: 3, borderLeftColor: C.or, paddingLeft: 14, paddingVertical: 4, marginBottom: 16, backgroundColor: 'rgba(196,162,74,.07)', borderRadius: 4 },
  li: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  puce: { fontFamily: serif, fontSize: 17.5, lineHeight: 28, color: C.or, minWidth: 16 },
  img: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14, marginBottom: 8, backgroundColor: C.trait },
  legende: { fontSize: 13, color: C.gris, textAlign: 'center', marginBottom: 6 },
  hr: { height: 1, backgroundColor: C.trait, marginVertical: 18 },
  lien: { color: C.vert, textDecorationLine: 'underline' },
});
