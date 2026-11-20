// Deux règles d'horaire pour prévenir l'administrateur d'un virement (demandes de Yarone, 19 et 20 nov 2026).
//
// 1) horsChabbat : le relevé exact part dès que Stripe lance le virement (la nuit même de l'arrivée, vers 2 h), SAUF de l'allumage
//    jusqu'à 2 h après la sortie de Chabbat ou d'une fête. Attendre 19 h faisait arriver le message après l'argent (20 nov 2026).
//
// 2) autorise : l'heure de l'annonce de LA VEILLE (« demain, un virement arrive ») :
//  - jour ordinaire : à partir de 19 h (heure de Paris)
//  - jour où entre Chabbat (ou une fête) : à partir de 3 h AVANT l'allumage des bougies
//  - de l'allumage jusqu'à 2 h APRÈS la sortie (havdala) : rien n'est envoyé
//  - le soir de la sortie : à partir de 2 h après la sortie
// Les horaires viennent de Hebcal (Paris). Si Hebcal ne répond pas : vendredi et samedi on n'envoie rien (jamais d'envoi pendant Chabbat par erreur), les autres jours 19 h.
const GEONAMEID = 2988507;   // Paris
const HEURE_ORDINAIRE = 19, AVANT_ALLUMAGE_H = 3, APRES_SORTIE_H = 2;
const H = 3600000, TZ = 'Europe/Paris';
const jourParis = ms => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
const heureParis = ms => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }).formatToParts(new Date(ms)).find(x => x.type === 'hour').value);
const jourSemaineParis = ms => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ });

// evenements : [{ type: 'allumage' | 'sortie', t: ms }] ; null si Hebcal est injoignable
function autorise(maintenant, evenements) {
  if (!evenements) { const j = jourSemaineParis(maintenant); return j !== 'Fri' && j !== 'Sat' && heureParis(maintenant) >= HEURE_ORDINAIRE; }
  const ev = evenements.slice().sort((a, b) => a.t - b.t), jour = jourParis(maintenant);
  // Chabbat / fête en cours (de l'allumage jusqu'à 2 h après la sortie) : on n'envoie rien
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].type !== 'allumage') continue;
    const sortie = ev.slice(i + 1).find(e => e.type === 'sortie');
    const fin = sortie ? sortie.t + APRES_SORTIE_H * H : ev[i].t + 30 * H;
    if (maintenant >= ev[i].t && maintenant < fin) return false;
  }
  const allumageDuJour = ev.find(e => e.type === 'allumage' && jourParis(e.t) === jour);
  if (allumageDuJour) return maintenant >= allumageDuJour.t - AVANT_ALLUMAGE_H * H;   // veille de Chabbat : 3 h avant (et avant l'allumage, car après c'est bloqué plus haut)
  const sortieDuJour = ev.find(e => e.type === 'sortie' && jourParis(e.t) === jour);
  if (sortieDuJour) return maintenant >= sortieDuJour.t + APRES_SORTIE_H * H;
  return heureParis(maintenant) >= HEURE_ORDINAIRE;
}

// Relevé exact : tout de suite, sauf pendant Chabbat ou une fête (de l'allumage jusqu'à 2 h après la sortie).
// Hebcal injoignable : par prudence, rien du vendredi 13 h au samedi minuit (heure de Paris), le reste du temps on envoie.
function horsChabbat(maintenant, evenements) {
  if (!evenements) { const j = jourSemaineParis(maintenant); return !(j === 'Sat' || (j === 'Fri' && heureParis(maintenant) >= 13)); }
  const ev = evenements.slice().sort((a, b) => a.t - b.t);
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].type !== 'allumage') continue;
    const sortie = ev.slice(i + 1).find(e => e.type === 'sortie');
    const fin = sortie ? sortie.t + APRES_SORTIE_H * H : ev[i].t + 30 * H;
    if (maintenant >= ev[i].t && maintenant < fin) return false;
  }
  return true;
}

let cache = null;   // { jour, evenements }
async function evenements(maintenant, fetchFn = fetch) {
  const jour = jourParis(maintenant);
  if (cache && cache.jour === jour && cache.evenements) return cache.evenements;
  try {
    const d = ms => jourParis(ms);
    const url = 'https://www.hebcal.com/hebcal?v=1&cfg=json&c=on&geonameid=' + GEONAMEID + '&b=18&m=50&maj=off&min=off&mod=off&nx=off&mf=off&ss=off&s=off&i=off&start=' + d(maintenant - 3 * 86400000) + '&end=' + d(maintenant + 10 * 86400000);
    const r = await fetchFn(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('Hebcal ' + r.status);
    const j = await r.json();
    const ev = (j.items || []).filter(x => x.category === 'candles' || x.category === 'havdalah').map(x => ({ type: x.category === 'candles' ? 'allumage' : 'sortie', t: Date.parse(x.date) })).filter(x => Number.isFinite(x.t));
    if (!ev.length) throw new Error('Hebcal : aucun horaire');
    cache = { jour, evenements: ev }; return ev;
  } catch (e) { console.error('chabbat : horaires indisponibles —', e.message); return null; }
}
async function peutEnvoyer(maintenant = Date.now(), fetchFn) { return autorise(maintenant, await evenements(maintenant, fetchFn)); }

async function pasChabbat(maintenant = Date.now(), fetchFn) { return horsChabbat(maintenant, await evenements(maintenant, fetchFn)); }

module.exports = { autorise, horsChabbat, pasChabbat, heureParis, jourParis, evenements, peutEnvoyer, HEURE_ORDINAIRE, AVANT_ALLUMAGE_H, APRES_SORTIE_H };
