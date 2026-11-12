// [APPLI] Accès aux données publiques du [SITE] (lecture seule).
// L'appli ne touche jamais à la base : elle lit les mêmes API publiques que les pages du site.
export const SITE = 'https://www.emounateha.fr';
export const DON = 'https://don.emounateha.fr';
export const AMBASSADEUR = 'https://ambassadeur.emounateha.fr';

export type Actu = { titre: string; lien: string; date: string | null; rubrique: string; resume: string; image: string; audio: boolean };
export type Article = { titre: string; date: string | null; rubrique: string; image: string; lien: string; html: string };
export type Cagnotte = { slug: string; titre: string; beneficiaire: string; description: string; objectif: number; collecte: number; dons: number; lien: string };

// Chaque appel abandonne après 12 s (sinon un serveur muet laisserait la roue tourner sans fin).
async function json<T>(url: string): Promise<T> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

// Sécurité : seules les adresses du site de l'association sont reconnues pour les dons et cagnottes.
const HOTES_ASSO = new Set(['www.emounateha.fr', 'emounateha.fr', 'don.emounateha.fr', 'ambassadeur.emounateha.fr']);
export function lienAsso(u: unknown): string | null {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && HOTES_ASSO.has(x.hostname) ? x.toString() : null; } catch { return null; }
}

export const SLUG_OK = /^[a-z0-9%_-]{1,220}$/i;
export const slugDe = (lien?: string | null) => String(lien || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '').split('/').pop() || '';

const actuValide = (a: Actu) => !!a && typeof a.titre === 'string' && typeof a.lien === 'string' && SLUG_OK.test(slugDe(a.lien));
export const actualites = () => json<{ items: Actu[] }>(SITE + '/api/news').then(d => (d?.items || []).filter(actuValide));
export const article = (slug: string) => {
  if (!SLUG_OK.test(slug)) return Promise.reject(new Error('adresse invalide'));
  let s = slug; try { s = decodeURIComponent(slug); } catch {}
  return json<Article>(SITE + '/api/news/article?slug=' + encodeURIComponent(s).toLowerCase()).then(a => { if (!a || typeof a.html !== 'string') throw new Error('article vide'); return a; });
};
export const cagnottes = () => json<{ list: Cagnotte[] }>(SITE + '/api/besoins-accueil').then(d => (d?.list || []).filter(b => b && b.titre && lienAsso(b.lien)).map(b => ({ ...b, collecte: +b.collecte || 0, objectif: +b.objectif || 0, dons: +b.dons || 0 })));

// ---------- Horaires : MÊME LOGIQUE QUE L'ACCUEIL DU [SITE] ----------
// Paracha : /api/parasha du site. Allumage et sortie : flux fr.chabad.org via /api/zmanim du site (lieu Chabad de la ville,
// chabad-lieux.json). Repli sur Hebcal si la ville n'a pas de lieu Chabad ou si Chabad ne répond pas.
export type Ville = { nom: string; id: number; lat: number; lon: number; bougies: number };
// Même liste de villes que le [SITE] (public/geoloc.js), allumage 40 min avant à Yérouchalayim, 18 min ailleurs.
export const VILLES: Ville[] = [
  { nom: "Yérouchalayim", id: 281184, lat: 31.77, lon: 35.22, bougies: 40 },
  { nom: "Tel Aviv-Netanya", id: 293397, lat: 32.08, lon: 34.78, bougies: 18 },
  { nom: "Haïfa", id: 294801, lat: 32.82, lon: 34.99, bougies: 18 },
  { nom: "Ashdod", id: 295629, lat: 31.79, lon: 34.65, bougies: 18 },
  { nom: "Netanya", id: 294071, lat: 32.33, lon: 34.86, bougies: 18 },
  { nom: "Beer-Sheva", id: 295530, lat: 31.25, lon: 34.79, bougies: 18 },
  { nom: "Eilat", id: 295277, lat: 29.56, lon: 34.95, bougies: 18 },
  { nom: "Tsfat", id: 293100, lat: 32.96, lon: 35.5, bougies: 18 },
  { nom: "Tibériade", id: 293322, lat: 32.79, lon: 35.53, bougies: 18 },
  { nom: "Paris", id: 2988507, lat: 48.85, lon: 2.35, bougies: 18 },
  { nom: "Sarcelles", id: 2976043, lat: 48.99, lon: 2.38, bougies: 18 },
  { nom: "Créteil", id: 3022530, lat: 48.79, lon: 2.46, bougies: 18 },
  { nom: "Boulogne-Billancourt", id: 3031137, lat: 48.83, lon: 2.24, bougies: 18 },
  { nom: "Versailles", id: 2969679, lat: 48.8, lon: 2.13, bougies: 18 },
  { nom: "Lyon", id: 2996944, lat: 45.76, lon: 4.84, bougies: 18 },
  { nom: "Marseille", id: 2995469, lat: 43.3, lon: 5.37, bougies: 18 },
  { nom: "Nice", id: 2990440, lat: 43.7, lon: 7.27, bougies: 18 },
  { nom: "Cannes", id: 3028808, lat: 43.55, lon: 7.01, bougies: 18 },
  { nom: "Aix-en-Provence", id: 3038354, lat: 43.53, lon: 5.45, bougies: 18 },
  { nom: "Montpellier", id: 2992166, lat: 43.61, lon: 3.88, bougies: 18 },
  { nom: "Toulouse", id: 2972315, lat: 43.6, lon: 1.44, bougies: 18 },
  { nom: "Bordeaux", id: 3031582, lat: 44.84, lon: -0.58, bougies: 18 },
  { nom: "Nantes", id: 2990969, lat: 47.22, lon: -1.55, bougies: 18 },
  { nom: "Lille", id: 2998324, lat: 50.63, lon: 3.06, bougies: 18 },
  { nom: "Strasbourg", id: 2973783, lat: 48.57, lon: 7.75, bougies: 18 },
  { nom: "Metz", id: 2994160, lat: 49.12, lon: 6.18, bougies: 18 },
  { nom: "Nancy", id: 2990999, lat: 48.69, lon: 6.18, bougies: 18 },
  { nom: "Grenoble", id: 3014728, lat: 45.17, lon: 5.72, bougies: 18 },
  { nom: "Genève", id: 2660646, lat: 46.2, lon: 6.14, bougies: 18 },
  { nom: "Zurich", id: 2657896, lat: 47.37, lon: 8.54, bougies: 18 },
  { nom: "Bruxelles", id: 2800866, lat: 50.85, lon: 4.35, bougies: 18 },
  { nom: "Anvers", id: 2803138, lat: 51.22, lon: 4.4, bougies: 18 },
  { nom: "Londres", id: 2643743, lat: 51.51, lon: -0.13, bougies: 18 },
  { nom: "Manchester", id: 2643123, lat: 53.48, lon: -2.24, bougies: 18 },
  { nom: "Milan", id: 3173435, lat: 45.46, lon: 9.19, bougies: 18 },
  { nom: "Rome", id: 3169070, lat: 41.9, lon: 12.5, bougies: 18 },
  { nom: "Madrid", id: 3117735, lat: 40.42, lon: -3.7, bougies: 18 },
  { nom: "Barcelone", id: 3128760, lat: 41.39, lon: 2.17, bougies: 18 },
  { nom: "Casablanca", id: 2553604, lat: 33.59, lon: -7.62, bougies: 18 },
  { nom: "Tunis", id: 2464470, lat: 36.82, lon: 10.17, bougies: 18 },
  { nom: "Johannesburg", id: 993800, lat: -26.2, lon: 28.05, bougies: 18 },
  { nom: "New York", id: 5128581, lat: 40.71, lon: -74.01, bougies: 18 },
  { nom: "Miami", id: 4164138, lat: 25.77, lon: -80.19, bougies: 18 },
  { nom: "Los Angeles", id: 5368361, lat: 34.05, lon: -118.24, bougies: 18 },
  { nom: "Boston", id: 4930956, lat: 42.36, lon: -71.06, bougies: 18 },
  { nom: "Montréal", id: 6077243, lat: 45.51, lon: -73.59, bougies: 18 },
  { nom: "Toronto", id: 6167865, lat: 43.7, lon: -79.42, bougies: 18 },
  { nom: "Mexico", id: 3530597, lat: 19.43, lon: -99.13, bougies: 18 },
  { nom: "Buenos Aires", id: 3435910, lat: -34.61, lon: -58.38, bougies: 18 },
  { nom: "São Paulo", id: 3448439, lat: -23.55, lon: -46.63, bougies: 18 },
  { nom: "Sydney", id: 2147714, lat: -33.87, lon: 151.21, bougies: 18 },
  { nom: "Melbourne", id: 2158177, lat: -37.81, lon: 144.96, bougies: 18 }
];
export const PARIS = VILLES.find(v => v.id === 2988507)!;

// Ville la plus proche de la personne, même calcul que le site (geoloc.js) ; au-delà de 600 km : Paris.
export function villeProche(lat: number, lon: number): Ville {
  const k = Math.cos((lat * Math.PI) / 180); let best = PARIS, bd = 1e9;
  for (const c of VILLES) { const d = (c.lat - lat) ** 2 + ((c.lon - lon) * k) ** 2; if (d < bd) { bd = d; best = c; } }
  return Math.sqrt(bd) * 111 > 600 ? PARIS : best;
}
// Position approximative donnée par l'hébergeur du site (/api/position) : aucune autorisation demandée, rien d'enregistré.
export const positionApprox = () => json<{ success?: boolean; latitude?: number; longitude?: number }>(SITE + '/api/position')
  .then(p => (p && p.success && typeof p.latitude === 'number' && typeof p.longitude === 'number' ? villeProche(p.latitude, p.longitude) : PARIS));

export type Chabbat = { paracha: string; parachaHe: string; allumage: string; allumageJour: string; sortie: string; sortieJour: string; note: string };
type HebItem = { category: string; date: string; title: string; hebrew?: string; yomtov?: boolean };
type ZItems = { hebrew?: string; items: { label: string; time: string }[] };

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const jourLong = (ymd?: string) => { if (!ymd) return ''; const [a, m, j] = ymd.slice(0, 10).split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, j)); return `${JOURS[d.getUTCDay()]} ${j} ${MOIS[m - 1]}`; };
const hm = (iso: string) => iso.slice(11, 16).replace(/^0/, '').replace(':', ' h ');          // « 16 h 55 », à l'heure de la ville
const hmChabad = (t: string) => t.replace(/^0/, '').replace(':', ' h ');
const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const veille = (ymd: string) => { const [a, m, j] = ymd.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, j - 1)); return d.toISOString().slice(0, 10); };

let lieux: Promise<Record<string, number>> | null = null;
const lieuChabad = (v: Ville) => (lieux ||= json<Record<string, number>>(SITE + '/chabad-lieux.json').catch(e => { lieux = null; throw e; })).then(L => L[String(v.id)]);
export const zmanimChabad = (lieu: number, ymd: string) => json<ZItems>(`${SITE}/api/zmanim?id=${lieu}&date=${ymd}`);

export async function chabbat(v: Ville): Promise<Chabbat> {
  const PP = json<{ day?: string; p?: string; ph?: string }>(`${SITE}/api/parasha?id=${v.id}`).catch(() => null);
  const j = await json<{ items: HebItem[] }>(`https://www.hebcal.com/shabbat?cfg=json&geonameid=${v.id}&M=on&b=${v.bougies}&lg=fr`);
  const it = j.items || [];
  const p = it.find(x => x.category === 'parashat'), ca = it.find(x => x.category === 'candles'), ha = it.find(x => x.category === 'havdalah'), hol = it.find(x => x.category === 'holiday' && x.yomtov);
  const d: Chabbat = {
    parachaHe: ((p ? p.hebrew : hol ? hol.hebrew : '') || '').replace(/^פרשת\s*/, ''),
    paracha: p ? p.title.replace(/^Parachah?\s*/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '') : hol ? hol.title : '—',
    allumage: ca ? hm(ca.date) : '—', allumageJour: ca ? jourLong(ca.date) : '',
    sortie: ha ? hm(ha.date) : '—', sortieJour: ha ? jourLong(ha.date) : '',
    note: 'Allumage ' + v.bougies + ' min avant le coucher',
  };
  const x = await PP;
  if (x && x.p) { d.paracha = x.p; d.parachaHe = x.ph || d.parachaHe; }
  try {
    const lieu = await lieuChabad(v);
    if (lieu) {
      const sam = x && x.day ? x.day : ha ? ha.date.slice(0, 10) : '', ven = x && x.day ? veille(x.day) : ca ? ca.date.slice(0, 10) : '';
      if (x && x.day) { d.allumageJour = jourLong(ven); d.sortieJour = jourLong(sam); }
      const t = (day: string, re: RegExp) => zmanimChabad(lieu, day).then(z => { const i = z.items.find(y => re.test(y.label)); return i ? hmChabad(i.time) : null; }).catch(() => null);
      const [a, b] = await Promise.all([ven ? t(ven, /Allumage|bougies/i) : null, sam ? t(sam, /Fin du Chabbat|Fin de (la )?f[êe]te/i) : null]);
      if (a) d.allumage = a; if (b) d.sortie = b;
    }
  } catch {}
  return d;
}

// Horaires du jour : flux Chabad de la ville (comme la page /horaires/ du site), repli Hebcal.
export type Zman = { nom: string; heure: string };
const HEB: [string, string][] = [
  ['alotHaShachar', 'Aube (Alot Hacha‘har)'], ['misheyakir', 'Talit et Téfillin au plus tôt'], ['sunrise', 'Lever du soleil'],
  ['sofZmanShma', 'Heure de fin du Chéma'], ['chatzot', 'Mi-journée (‘Hatsot)'], ['minchaGedola', 'Min‘ha au plus tôt'],
  ['plagHaMincha', 'Plag Hamin‘ha'], ['sunset', 'Coucher du soleil (Chkiah)'], ['dusk', 'Tombée de la nuit (Tset Hakokhavim)'],
];
export async function zmanim(v: Ville): Promise<Zman[]> {
  const ymd = ymdLocal();
  const lieu = await lieuChabad(v).catch(() => undefined);
  if (lieu) {
    try { const z = await zmanimChabad(lieu, ymd); const l = z.items.filter(i => /^\d{1,2}:\d{2}$/.test(i.time)).map(i => ({ nom: i.label, heure: hmChabad(i.time) })); if (l.length) return l; } catch {}
  }
  const d = await json<{ times: Record<string, string> }>(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${v.id}&date=${ymd}`);
  return HEB.filter(([k]) => d.times && d.times[k]).map(([k, nom]) => ({ nom, heure: hm(d.times[k]) }));
}

// Date hébraïque, comme l'en-tête du site : calendrier-hebraique.json du site ; le jour hébraïque change à la tombée de la nuit.
let cal: Promise<Record<string, [string, string, number, string, number]>> | null = null;
export async function dateHebraique(v: Ville): Promise<{ he: string; civil: string }> {
  const auj = ymdLocal();
  let jour = auj;
  try {
    const d = await json<{ times: Record<string, string> }>(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${v.id}&date=${auj}`);
    if (d.times?.dusk && Date.now() >= new Date(d.times.dusk).getTime()) { const [a, m, j] = auj.split('-').map(Number); jour = new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10); }
  } catch {}
  const c = await (cal ||= json<Record<string, [string, string, number, string, number]>>(SITE + '/calendrier-hebraique.json').catch(e => { cal = null; throw e; }));
  const he = (c[jour]?.[1] || '').replace(/"/g, '״').replace(/'/g, '׳');
  const n = new Date();
  return { he, civil: `${JOURS[n.getDay()]} ${n.getDate()} ${MOIS[n.getMonth()]} ${n.getFullYear()}` };
}

export const dateCourte = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
