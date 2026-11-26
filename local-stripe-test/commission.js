// Commission du prestataire technique : relevé hebdomadaire par e-mail, et encaissement par carte après chaque virement arrivé en banque (voir plus bas).
// Lecture seule sur le compte Stripe de l'association. Les factures sont créées sur le compte Stripe du prestataire, seulement si sa clé est renseignée.
//
// Règle : commission = TAUX % du NET réellement encaissé sur la période,
//         net = dons encaissés − frais Stripe − remboursements − litiges perdus (+ litiges regagnés).
// Les virements du solde vers la banque (payout) et les mouvements internes ne comptent pas.
// Les dons hors Stripe (chèque, virement, espèces) ne sont pas dans Stripe : ils ne comptent pas.

const TAUX = Math.max(0, Math.min(100, Number(process.env.COMMISSION_TAUX || 7)));
// Besoins (mini-cagnottes personnelles) : le prestataire ne prend que TAUX_BESOIN % (5) ; l'association garde PART_ASSO_BESOIN % (5) ; le reste (90 %) revient à la personne.
const TAUX_BESOIN = Math.max(0, Math.min(100, Number(process.env.COMMISSION_TAUX_BESOIN || 5)));
const PART_ASSO_BESOIN = 5;
// Règle des cagnottes (Yarone, 27 nov 2026) : la personne reçoit 90 % du don entier ; ce qui reste après les frais Stripe est partagé moitié-moitié
// entre le prestataire et l'association. Ex. : 100 € donnés, 1,50 € de frais Stripe → personne 90 €, prestataire 4,25 €, association 4,25 €.
// brut et net en centimes (un remboursement : montants négatifs). Le centime impair va à l'association.
const PART_PERSONNE = 100 - TAUX_BESOIN - PART_ASSO_BESOIN;
function partsBesoin(brut, net) { const personne = Math.round(brut * PART_PERSONNE / 100), reste = net - personne, prestataire = Math.floor(reste / 2); return { personne, prestataire, association: reste - prestataire }; }
// La règle des besoins (5 / 5 / 90) s'applique à TOUS les dons des cagnottes, depuis l'ouverture de leur lien (décision de Yarone, 27 nov 2026).
const REGLE_BESOIN_DEPUIS = 0;
// Trop-perçu : jusqu'au 26 nov 2026 21 h 53 (UTC), les besoins étaient facturés à 7 %. Pour les dons de besoins d'avant cette heure, couverts par une facture
// créée avant AVOIR_AVANT (mise en ligne de la règle « tous les dons »), le prestataire rend 7 − 5 = 2 % : déduit des factures suivantes, jusqu'à épuisement.
const ANCIEN_TAUX_JUSQU = Math.floor(Date.parse('2026-11-26T21:53:00Z') / 1000);
const AVOIR_AVANT = Math.floor(Date.parse('2026-11-26T23:25:00Z') / 1000);
// date du don à l'origine d'un mouvement (un remboursement suit la règle du don remboursé)
const dateDon = m => { const s = m && m.source && typeof m.source === 'object' ? m.source : null, c = s && s.charge && typeof s.charge === 'object' ? s.charge : null, pi = s && s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null; return Number((c && c.created) || (pi && pi.created) || (s && s.object === 'charge' && s.created) || (m && m.created) || 0); };
const regleBesoin = m => dateDon(m) >= REGLE_BESOIN_DEPUIS;
// le mouvement Stripe est-il un don (ou un remboursement) d'un besoin ? par le reçu, à défaut par le libellé « … Besoin : <titre> (slug) »
function estBesoin(m, recus = {}) {
  const R = require('./releve.js'), src = m && m.source && typeof m.source === 'object' ? m.source : null, id = v => (v && typeof v === 'object' ? v.id : v) || '';
  const k = [id(src && src.payment_intent), id(src && src.invoice), id(src && src.charge), src && src.id].filter(Boolean).find(x => recus && recus[x]);
  return !!(R.cagnotteDe(k ? recus[k] : null, m && m.description) || R.cagnotteDe(null, src && src.description));
}
const libTaux = (taux, netBesoin) => { const t = String(taux).replace('.', ',') + ' %'; return netBesoin ? t + ' (cagnottes : moitié de ce qui reste après les 90 % de la personne et les frais Stripe)' : t; };
const CLIENT = process.env.STRIPE_COMMISSION_CLIENT || 'cus_VbtVLcPE714MbD';   // l'association, cliente sur le compte Stripe du prestataire (identifiant non secret) — servira à l'étape « facture »

// types de mouvements Stripe qui entrent dans la base de calcul
const ENTREES = new Set(['charge', 'payment']);
const SORTIES = new Set(['refund', 'payment_refund', 'payment_failure_refund', 'refund_failure', 'payment_reversal']);
const LITIGES = new Set(['adjustment']);   // litige ouvert (débit) ou regagné (crédit)
const HORS_BASE = new Set(['payout', 'payout_cancel', 'payout_failure', 'transfer', 'transfer_cancel', 'transfer_failure', 'transfer_refund', 'topup', 'topup_reversal', 'reserve_transaction', 'reserved_funds', 'stripe_fee', 'stripe_fx_fee', 'tax_fee', 'network_cost', 'contribution', 'application_fee', 'application_fee_refund', 'advance', 'advance_funding', 'anticipation_repayment', 'connect_collection_transfer', 'issuing_authorization_hold', 'issuing_authorization_release', 'issuing_dispute', 'issuing_transaction', 'payment_network_reserve_hold', 'payment_network_reserve_release', 'climate_order_purchase', 'climate_order_refund', 'payment_unreconciled']);

const parisJour = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
// minuit, heure de Paris, pour une date AAAA-MM-JJ → instant UTC (gère heure d'été / d'hiver)
function minuitParis(jour) {
  const approx = Date.parse(jour + 'T00:00:00Z');
  for (const dec of [-2, -1]) { const t = approx + dec * 3600000; if (new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T').startsWith(jour + 'T00:00:00')) return t; }
  return approx - 3600000;
}
const lendemain = jour => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// période = la SEMAINE (du lundi au dimanche, bornes incluses) qui contient un jour donné : la commission est réglée chaque semaine
function semaine(jour) {
  const d = new Date(jour + 'T12:00:00Z'), n = (d.getUTCDay() + 6) % 7;   // 0 = lundi
  const lun = new Date(d); lun.setUTCDate(d.getUTCDate() - n); const dim = new Date(lun); dim.setUTCDate(lun.getUTCDate() + 6);
  return { du: lun.toISOString().slice(0, 10), au: dim.toISOString().slice(0, 10) };
}
function semainePrecedente(p) { const d = new Date(p.du + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return semaine(d.toISOString().slice(0, 10)); }

// Calcul pur, à partir des mouvements de solde Stripe (montants en centimes). Aucune estimation : fee et net sont ceux de Stripe.
function calculer(mouvements, taux = TAUX, recus = {}) {
  const lignes = [], ignores = {}, inconnus = {};
  let brut = 0, frais = 0, rembourse = 0, litiges = 0, net = 0, nbDons = 0, netBesoin = 0, comBesoin = 0;
  for (const m of mouvements) {
    if (m.currency && String(m.currency).toLowerCase() !== 'eur') { inconnus['devise ' + m.currency] = (inconnus['devise ' + m.currency] || 0) + 1; continue; }
    const type = String(m.type || '');
    let genre = ENTREES.has(type) ? 'don' : SORTIES.has(type) ? 'remboursement' : LITIGES.has(type) ? 'litige' : null;
    if (!genre) { if (HORS_BASE.has(type)) ignores[type] = (ignores[type] || 0) + 1; else inconnus[type] = (inconnus[type] || 0) + 1; continue; }
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0), n = Math.round(Number(m.net) || 0);
    if (genre === 'don') { brut += a; nbDons++; } else if (genre === 'remboursement') rembourse += a; else litiges += a;
    frais += f; net += n; const b = estBesoin(m, recus) && regleBesoin(m); if (b) { netBesoin += n; comBesoin += partsBesoin(a, n).prestataire; }
    lignes.push({ besoin: b, id: m.id, at: new Date((m.created || 0) * 1000).toISOString(), jour: parisJour((m.created || 0) * 1000), genre, description: String(m.description || '').slice(0, 140), brut: a, frais: f, net: n });
  }
  lignes.sort((x, y) => x.at.localeCompare(y.at));
  const base = net, commission = base > 0 ? Math.round((net - netBesoin) * taux / 100) + comBesoin : 0;
  // contrôle : la somme des lignes doit redonner exactement le net (au centime)
  const controle = brut + rembourse + litiges - frais === net;
  return { taux, tauxBesoin: TAUX_BESOIN, netBesoin, comBesoin, netGeneral: net - netBesoin, nbDons, nbLignes: lignes.length, brut, frais, rembourse, litiges, net, base, commission, resteAssociation: net - commission, controle, ignores, inconnus, lignes };
}

// trop-perçu sur les besoins déjà facturés à 7 % : dû au total, déjà déduit, reste à déduire (centimes)
async function tropPercu(stripe, factures, recus = {}) {
  const vivantes = factures.filter(f => f.status !== 'void' && f.status !== 'draft');
  const anciennes = vivantes.filter(f => Number(f.created || 0) < AVOIR_AVANT), ids = new Set();
  for (const f of anciennes) for (const [k, v] of Object.entries(f.metadata || {})) if (/^v\d+$/.test(k)) String(v).split(',').forEach(x => x && ids.add(x));
  let du = 0;
  for (const id of ids) {
    let nb = 0, nouvelle = 0;
    for await (const m of stripe.balanceTransactions.list({ payout: id, limit: 100, expand: ['data.source'] })) {
      const t = String(m.type || '');
      if ((ENTREES.has(t) || SORTIES.has(t) || LITIGES.has(t)) && (!m.currency || String(m.currency).toLowerCase() === 'eur') && estBesoin(m, recus) && dateDon(m) < ANCIEN_TAUX_JUSQU) { const n = Math.round(Number(m.net) || 0); nb += n; nouvelle += partsBesoin(Math.round(Number(m.amount) || 0), n).prestataire; }
    }
    if (nb > 0) du += Math.max(0, Math.round(nb * TAUX / 100) - nouvelle);   // facturé à l'époque (7 % du net) − ce que donne la nouvelle règle
  }
  const deja = vivantes.filter(f => Number(f.created || 0) >= AVOIR_AVANT).reduce((a, f) => a + (Number(f.metadata && f.metadata.avoir) || 0), 0);
  return { du, deja, reste: Math.max(0, du - deja) };
}

// commission = net des dons généraux × TAUX % + pour les cagnottes, la moitié de ce qui reste après les 90 % de la personne et les frais Stripe

async function mouvementsStripe(stripe, du, au) {   // bornes incluses, jours de Paris
  const gte = Math.floor(minuitParis(du) / 1000), lt = Math.floor(minuitParis(lendemain(au)) / 1000), out = [];
  for await (const m of stripe.balanceTransactions.list({ created: { gte, lt }, limit: 100 })) { out.push(m); if (out.length > 20000) throw new Error('trop de mouvements sur la période'); }
  return out;
}

// Relevé de la semaine écoulée, en texte, en HTML et en CSV (pièce jointe). Aucune donnée de donateur : dates, libellés Stripe, montants.
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const jourLong = j => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOTE = process.env.STRIPE_COMMISSION_KEY ? 'Relevé pour information. Le paiement par carte se fait à part, après chaque virement arrivé à la banque de l\'association.' : 'Mode à blanc : aucune facture créée, aucun paiement.';
function releveMail(p, r, live, rattrapage) {
  const titre = rattrapage ? `Rattrapage : période du ${jourLong(p.du)} au ${jourLong(p.au)}` : `Semaine du ${jourLong(p.du)} au ${jourLong(p.au)}`, tx = String(r.taux).replace('.', ',');
  const L = [['Dons encaissés (' + r.nbDons + ')', eur(r.brut)], ['− Frais Stripe', '− ' + eur(r.frais)]];
  if (r.rembourse) L.push(['− Remboursements', '− ' + eur(-r.rembourse)]);
  if (r.litiges) L.push([r.litiges < 0 ? '− Litiges' : '+ Litiges regagnés', (r.litiges < 0 ? '− ' : '+ ') + eur(Math.abs(r.litiges))]);
  L.push(['= Net encaissé par l\'association', eur(r.net)], [r.netBesoin ? 'Commission : ' + eur(r.netGeneral) + ' × ' + tx + ' % + cagnottes ' + eur(r.comBesoin) : '× ' + tx + ' % = Commission', eur(r.commission)]);
  const alertes = [];
  if (!r.controle) alertes.push('CONTRÔLE EN ÉCHEC : la somme des lignes ne redonne pas le net. Ne rien facturer sur cette base.');
  if (Object.keys(r.inconnus).length) alertes.push('Mouvements non reconnus, donc non comptés : ' + Object.entries(r.inconnus).map(([k, n]) => k + ' (' + n + ')').join(', '));
  if (r.net < 0) alertes.push('Semaine négative (plus de remboursements que de dons) : commission de 0 €.');
  if (!live) alertes.push('Compte Stripe de TEST : ce ne sont pas de vrais dons.');
  const subject = `${live ? '' : '[TEST] '}Commission — ${titre.toLowerCase()} : ${eur(r.commission)}`;
  const text = `${titre}\n\n` + L.map(x => x[0] + ' : ' + x[1]).join('\n') + `\n\n${NOTE}\n` + (alertes.length ? '\n' + alertes.map(x => '⚠ ' + x).join('\n') + '\n' : '') + `\nContrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).`;
  const e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px"><h2 style="color:#1f6a72;margin:0 0 4px">Relevé de commission</h2><p style="margin:0 0 14px;color:#6b7280">${e(titre)}</p><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">` + L.map((x, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[0])}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[1])}</td></tr>`).join('') + `</table><p style="margin:14px 0 0;padding:10px 12px;background:#fff9ea;border:1px solid #f5d48a;border-radius:8px;font-size:13px;color:#7a5a10">${NOTE}</p>` + alertes.map(x => `<p style="margin:8px 0 0;font-size:13px;color:#b45309">⚠ ${e(x)}</p>`).join('') + `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Contrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Frais et net sont ceux appliqués par Stripe. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).</p></div>`;
  const q = s => '"' + String(s).replace(/"/g, '""') + '"', n = c => (c / 100).toFixed(2).replace('.', ',');
  const csv = '\ufeff' + ['Date;Heure;Mouvement;Libellé;Montant;Frais;Net;Identifiant Stripe'].concat(r.lignes.map(l => [l.jour, new Date(l.at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }), l.genre, q(l.description), n(l.brut), n(l.frais), n(l.net), l.id].join(';'))).concat(['', ';;;' + q('Net') + ';;;' + n(r.net), ';;;' + q('Commission ' + tx + ' %') + ';;;' + n(r.commission)]).join('\r\n');
  return { subject, text, html, csv, fichier: `commission_${p.du}_${p.au}.csv` };
}

// ───────── Encaissement par carte, virement par virement ─────────
// La commission est réglée par carte bancaire (celle que l'association a enregistrée sur le compte Stripe du prestataire), JAMAIS avant que l'argent
// soit arrivé à la banque de l'association : on part des virements de Stripe vers sa banque, et on n'encaisse qu'à partir de 12 h 30 (Paris) LE JOUR D'ARRIVÉE (fenêtre 12 h 30 – 14 h).
// Stripe ne donne que le jour d'arrivée, pas l'heure : les banques créditent en général le matin ; à 12 h 30 l'argent est là, et le plus tôt possible après.
// Base d'un virement = les dons qu'il regroupe − frais Stripe − remboursements − litiges (les mouvements que Stripe rattache à ce virement).
// Rien n'est mémorisé ici : ce qui a déjà été facturé se lit sur les factures du compte du prestataire (aucun risque de compter deux fois si un fichier se perd).
// Deux verrous : la clé STRIPE_COMMISSION_KEY ET COMMISSION_ENCAISSER=oui. S'il en manque un : simulation seulement, rien n'est créé ni encaissé.
const HEURE = Math.max(0, Math.min(23, Number(process.env.COMMISSION_HEURE || 12.5)));   // heure de Paris, le jour d'arrivée du virement
const MINIMUM = 50;          // en dessous de 0,50 € Stripe refuse un paiement : on attend les virements suivants
const LOT = 60;              // virements traités par passage (le reste au passage suivant)
const DEPUIS = /^\d{4}-\d{2}-\d{2}$/.test(process.env.COMMISSION_DEPUIS || '') ? Math.floor(Date.parse(process.env.COMMISSION_DEPUIS + 'T00:00:00Z') / 1000) : 0;   // par défaut : depuis le tout premier virement
const jourFr = t => new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const estLive = k => /^(sk|rk)_live_/.test(String(k || ''));

// un virement est « échu » quand Stripe le dit payé et qu'il est au moins HEURE h (Paris) le jour de son arrivée en banque (arrival_date = minuit UTC du jour d'arrivée)
function echu(p, maintenant, heure = HEURE) {
  return !!p && p.status === 'paid' && String(p.currency || 'eur').toLowerCase() === 'eur' && Number(p.arrival_date) > 0 && minuitParis(new Date(p.arrival_date * 1000).toISOString().slice(0, 10)) + heure * 3600000 <= maintenant && p.arrival_date >= DEPUIS;
}
// commission d'un virement : peut être négative (virement de régularisation : remboursements) — elle vient alors en déduction des autres
function ligneVirement(p, mouvements, taux = TAUX, recus = {}) {
  const r = calculer(mouvements, taux, recus);
  let detail = []; try { detail = require('./virements').lignes(mouvements, recus); } catch (e) {}   // un paiement par ligne : date, donateur, objet, don, frais, net
  return { detail, id: p.id, arrivee: p.arrival_date, montantVire: p.amount, nbDons: r.nbDons, brut: r.brut, frais: r.frais, rembourse: r.rembourse, litiges: r.litiges, net: r.net, netBesoin: r.netBesoin, comBesoin: r.comBesoin, commission: Math.round((r.net - r.netBesoin) * taux / 100) + r.comBesoin, controle: r.controle, inconnus: Object.keys(r.inconnus) };
}
// virements déjà pris par une facture (brouillon, ouverte, payée ou abandonnée). Une facture ANNULÉE (void) libère ses virements.
function dejaPris(factures) {
  const pris = new Set();
  for (const f of factures) { if (f.status === 'void') continue; for (const [k, v] of Object.entries(f.metadata || {})) if (/^v\d+$/.test(k)) String(v).split(',').forEach(x => x && pris.add(x)); }
  return pris;
}
function metaVirements(ids) { const m = {}; let i = 0, cur = ''; for (const id of ids) { if ((cur + ',' + id).length > 480) { m['v' + i++] = cur; cur = id; } else cur = cur ? cur + ',' + id : id; } if (cur) m['v' + i] = cur; return m; }

async function encaisser({ stripe, stripe2, simuler, recus = {}, maintenant = Date.now(), actif = process.env.COMMISSION_ENCAISSER === 'oui' }) {
  if (!actif) simuler = true;
  const out = { ok: true, mode: stripe2 && !simuler ? 'reel' : 'simulation', taux: TAUX, client: CLIENT };
  let pmSeule = null;
  if (stripe2 && estLive(process.env.STRIPE_SECRET_KEY) !== estLive(process.env.STRIPE_COMMISSION_KEY)) return { ok: false, error: 'Les deux clés Stripe ne sont pas du même mode (test / réel) : rien n\'est fait.' };
  let factures = [];
  if (stripe2) {
    // la carte : celle par défaut du client « association » sur le compte du prestataire
    const c = await stripe2.customers.retrieve(CLIENT, { expand: ['invoice_settings.default_payment_method', 'default_source'] });
    if (!c || c.deleted) return { ok: false, error: 'Client ' + CLIENT + ' introuvable sur le compte Stripe du prestataire.' };
    const pm = c.invoice_settings && c.invoice_settings.default_payment_method, src = c.default_source; let carte = pm && pm.card ? pm.card : src && src.object === 'card' ? src : null, nbCartes = carte ? 1 : 0;
    if (!carte) {   // pas de carte « par défaut » : si le client n'a qu'UNE carte enregistrée, c'est elle ; s'il en a plusieurs, on ne choisit pas à sa place
      const L = (await stripe2.paymentMethods.list({ customer: CLIENT, type: 'card', limit: 5 })).data || []; nbCartes = L.length;
      if (L.length === 1) { carte = L[0].card; pmSeule = L[0].id; }
    }
    out.carte = carte ? { ok: true, marque: carte.brand, fin: carte.last4, expire: String(carte.exp_month).padStart(2, '0') + '/' + carte.exp_year, parDefaut: !pmSeule } : { ok: false, cartesEnregistrees: nbCartes };
    if (!carte && !simuler) return { ...out, ok: false, error: nbCartes ? 'Plusieurs cartes enregistrées et aucune par défaut : rien n\'est fait.' : 'Aucune carte enregistrée pour ce client : rien n\'est fait.' };
    for await (const f of stripe2.invoices.list({ customer: CLIENT, limit: 100 })) { if (f.metadata && f.metadata.commission === '1') factures.push(f); if (factures.length > 5000) break; }
    if (!simuler) {
      // brouillon resté d'un passage interrompu : supprimé, ses virements seront repris proprement
      for (const f of factures.filter(x => x.status === 'draft' && maintenant - x.created * 1000 > 600000)) { await stripe2.invoices.del(f.id); f.status = 'void'; }
      // facture finalisée mais pas encore payée (carte refusée la dernière fois) : nouvel essai ; tant qu'elle n'est pas réglée, on n'en crée pas d'autre
      const ouvertes = factures.filter(x => x.status === 'open'); out.reessais = [];
      for (const f of ouvertes) {
        try { const r = await stripe2.invoices.pay(f.id); f.status = r.status; out.reessais.push({ facture: f.id, numero: r.number, montant: r.amount_paid, paye: r.status === 'paid' }); }
        catch (e) { out.reessais.push({ facture: f.id, numero: f.number, montant: f.amount_due, paye: false, raison: e.message, lien: f.hosted_invoice_url }); }
      }
      if (out.reessais.some(x => !x.paye)) return { ...out, attente: 'facture impayée : nouvel essai au prochain passage, aucune nouvelle facture d\'ici là' };
    }
  }
  const pris = dejaPris(factures), dus = [];
  for await (const p of stripe.payouts.list({ status: 'paid', limit: 100 })) { if (echu(p, maintenant) && !pris.has(p.id)) dus.push(p); if (dus.length > 3000) break; }
  dus.sort((a, b) => a.arrival_date - b.arrival_date);
  const lot = dus.slice(0, LOT), lignes = [], ecartes = [];
  for (const p of lot) {
    if (p.automatic === false) { ecartes.push({ id: p.id, raison: 'virement déclenché à la main : Stripe ne dit pas quels dons il contient, à régler à part' }); continue; }   // Stripe ne rattache les mouvements qu'aux virements automatiques
    const mv = []; for await (const m of stripe.balanceTransactions.list({ payout: p.id, limit: 100, expand: ['data.source'] })) { mv.push(m); if (mv.length > 20000) throw new Error('trop de mouvements dans le virement ' + p.id); }
    const l = ligneVirement(p, mv, TAUX, recus);
    if (!l.controle) ecartes.push({ id: p.id, raison: 'contrôle au centime en échec' }); else lignes.push(l);   // base douteuse : jamais facturée, signalée
  }
  const total = lignes.reduce((a, l) => a + l.commission, 0), net = lignes.reduce((a, l) => a + l.net, 0);
  Object.assign(out, { virements: lignes, ecartes, net, total, reste: dus.length - lot.length });
  if (!lignes.length) return { ...out, rien: 'aucun virement arrivé en banque à facturer' };
  if (total < MINIMUM) return { ...out, rien: 'total inférieur à 0,50 € : reporté avec les prochains virements' };
  // trop-perçu des besoins facturés à 7 % : déduit de cette facture (jamais en dessous de 0, ni entre 0,01 € et 0,49 € que Stripe ne sait pas encaisser)
  let deduit = 0;
  if (stripe2) {
    const a = await tropPercu(stripe, factures, recus);
    deduit = Math.min(a.reste, total); if (total - deduit > 0 && total - deduit < MINIMUM) deduit = Math.max(0, total - MINIMUM);
    out.avoir = { ...a, deduit, resteApres: a.reste - deduit }; out.aPayer = total - deduit;
  }
  if (!stripe2 || simuler) return out;
  // facture sur le compte du prestataire, payée tout de suite par la carte enregistrée
  const ids = lignes.map(l => l.id), cle = 'commission-' + require('crypto').createHash('sha256').update(CLIENT + '|' + ids.join(',') + '|' + Math.floor(maintenant / 3600000)).digest('hex').slice(0, 32), tx = String(TAUX).replace('.', ',');   // clé : deux passages simultanés tombent sur la même facture ; un nouvel essai une heure plus tard repart de zéro
  const periode = lignes.length === 1 ? 'virement arrivé le ' + jourFr(lignes[0].arrivee) : lignes.length + ' virements arrivés du ' + jourFr(lignes[0].arrivee) + ' au ' + jourFr(lignes[lignes.length - 1].arrivee);
  let inv = await stripe2.invoices.create({ customer: CLIENT, collection_method: 'charge_automatically', auto_advance: false, pending_invoice_items_behavior: 'exclude', currency: 'eur', ...(pmSeule ? { default_payment_method: pmSeule } : {}), description: `Commission de ${libTaux(TAUX, lignes.some(l => l.netBesoin))} sur les dons nets reçus — ${periode}`, metadata: { commission: '1', lot: cle, ...(deduit ? { avoir: String(deduit) } : {}), ...metaVirements(ids) } }, { idempotencyKey: cle });
  try {
    const calc = (n, nb, cb) => nb ? `dons ${eur(n - nb)} × ${tx} % + cagnottes ${eur(cb)} (moitié de ce qui reste après 90 % à la personne et frais Stripe)` : `net des dons ${eur(n)} × ${tx} %`, nbTot = lignes.reduce((a, l) => a + (l.netBesoin || 0), 0), cbTot = lignes.reduce((a, l) => a + (l.comBesoin || 0), 0);
    const postes = lignes.length <= 12 ? lignes.map(l => ({ amount: l.commission, description: `Virement arrivé le ${jourFr(l.arrivee)} — ${calc(l.net, l.netBesoin, l.comBesoin)}`, k: l.id })) : [{ amount: total, description: `${periode} — ${calc(net, nbTot, cbTot)}`, k: 'tout' }];
    if (deduit) postes.push({ amount: -deduit, description: `Remboursement du trop-perçu : dons des cagnottes facturés à ${tx} % jusqu'au 26/11/2026 (nouvelle règle : moitié de ce qui reste après 90 % à la personne et frais Stripe)`, k: 'avoir' });
    for (const x of postes) await stripe2.invoiceItems.create({ customer: CLIENT, invoice: inv.id, amount: x.amount, currency: 'eur', description: x.description }, { idempotencyKey: cle + '-' + x.k });
    inv = await stripe2.invoices.retrieve(inv.id);
    if (inv.status === 'draft') {
      if (inv.total !== total - deduit) throw new Error('le total de la facture (' + inv.total + ') ne correspond pas au calcul (' + (total - deduit) + ')');   // taxe ou ligne inattendue : on n'encaisse pas
      inv = await stripe2.invoices.finalizeInvoice(inv.id, { auto_advance: false });
    }
  } catch (e) { try { if (inv.status === 'draft') await stripe2.invoices.del(inv.id); } catch (e2) {} throw e; }
  out.facture = { id: inv.id, numero: inv.number, montant: inv.total, lien: inv.hosted_invoice_url };
  try { if (inv.status !== 'paid') inv = await stripe2.invoices.pay(inv.id); out.facture.paye = inv.status === 'paid'; }
  catch (e) { out.facture.paye = false; out.facture.raison = e.message; }   // carte refusée : la facture reste ouverte, nouvel essai au prochain passage
  return out;
}

// ───────── Mail et PDF de l'encaissement : mêmes couleurs que les reçus, logo complet Émounatéha ─────────
const TEAL = '#1f6a72', OR = '#b8923a', GRIS = '#6b7280';
const escH = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G = require('./gabarit.js');
function logoData() { try { return 'data:image/png;base64,' + require('fs').readFileSync(require('path').join(__dirname, 'public', 'logo-asso.png')).toString('base64'); } catch (e) { return ''; } }
function tableauVirements(r, tx) {
  const th = 'padding:8px 6px;border-bottom:2px solid ' + TEAL + ';text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:' + GRIS;
  const td = 'padding:9px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px';
  const T = k => (r.virements || []).reduce((a, l) => a + (Number(l[k]) || 0), 0);
  const lignes = (r.virements || []).map(l => `<tr><td style="${td};text-align:left">${escH(jourFr(l.arrivee))}</td><td style="${td}">${l.nbDons}</td><td style="${td}">${escH(eur(l.brut))}</td><td style="${td}">− ${escH(eur(l.frais + l.rembourse + l.litiges))}</td><td style="${td}">${escH(eur(l.net))}</td><td style="${td};font-weight:bold;color:${TEAL}">${escH(eur(l.commission))}</td></tr>`).join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 0"><tr><th style="${th};text-align:left">Arrivée en banque</th><th style="${th}">Dons</th><th style="${th}">Encaissé</th><th style="${th}">Frais Stripe</th><th style="${th}">Net</th><th style="${th}">Commission ${escH(libTaux(tx, (r.virements || []).some(v => v.netBesoin)))}</th></tr>${lignes}${(r.virements || []).length > 1 ? `<tr>` + ['Total', T('nbDons'), eur(T('brut')), '− ' + eur(T('frais') + T('rembourse') + T('litiges')), eur(T('net')), eur(T('commission'))].map((v, i) => `<td style="padding:10px 6px;border-top:2px solid ${TEAL};font-weight:bold;font-size:13.5px;text-align:${i ? 'right' : 'left'}${i === 5 ? ';color:' + TEAL : ''}">${escH(v)}</td>`).join('') + '</tr>' : ''}</table>`;
}
function tableauPaiements(r, pourPdf) {
  const th = 'padding:7px 5px;border-bottom:2px solid ' + TEAL + ';font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:' + GRIS + ';text-align:', td = 'padding:7px 5px;border-bottom:1px solid #e5e7eb;font-size:12.5px;vertical-align:top;';
  const jour = t => new Date(t * 1000).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }) + ' ' + new Date(t * 1000).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  let out = '';
  for (const v of r.virements || []) {
    const L = v.detail || []; if (!L.length) continue;
    const vus = pourPdf ? L : L.slice(0, 20);
    out += `<p style="margin:14px 0 4px;font-size:14px;font-weight:bold;color:#111827">Virement arrivé le ${escH(jourFr(v.arrivee))} <span style="font-weight:normal;color:${GRIS}">· ${escH(eur(v.montantVire))} virés à l'association</span></p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><th style="${th}left">Date</th><th style="${th}left">Donateur · objet</th><th style="${th}right">Paiement</th><th style="${th}right">Frais</th><th style="${th}right">Net</th></tr>` +
      vus.map(l => `<tr><td style="${td}white-space:nowrap">${escH(jour(l.t))}</td><td style="${td}overflow-wrap:anywhere">${l.genre === 'Don' ? '' : '<b style="color:#b45309">' + escH(l.genre) + ' · </b>'}${escH(l.donateur || '')}${l.donateur && l.libelle ? ' · ' : ''}<span style="color:${GRIS}">${escH(l.libelle || (l.donateur ? '' : 'Paiement ' + l.ref))}</span>${l.recu ? `<br><span style="color:${GRIS};font-size:11px">reçu ${escH(l.recu)}</span>` : ''}</td><td style="${td}text-align:right">${escH(eur(l.brut))}</td><td style="${td}text-align:right">${l.frais ? '− ' + escH(eur(l.frais)) : ''}</td><td style="${td}text-align:right;font-weight:bold">${escH(eur(l.net))}</td></tr>`).join('') + (L.length > 1 ? `<tr><td colspan="2" style="padding:8px 5px;border-top:2px solid ${TEAL};font-weight:bold;font-size:12.5px">Total (${L.length} lignes)</td>` + [L.reduce((a, l) => a + l.brut, 0), -L.reduce((a, l) => a + l.frais, 0), L.reduce((a, l) => a + l.net, 0)].map(v => `<td style="padding:8px 5px;border-top:2px solid ${TEAL};text-align:right;font-weight:bold;font-size:12.5px;white-space:nowrap">${v < 0 ? '− ' : ''}${escH(eur(Math.abs(v)))}</td>`).join('') + '</tr>' : '') + '</table>' +
      (!pourPdf && L.length > vus.length ? `<p style="margin:8px 0 0;font-size:12px;color:${GRIS}">… et ${L.length - vus.length} autre(s) ligne(s) : liste complète dans le PDF joint.</p>` : '');
  }
  return out;
}

function corpsCommission(r, f, tx, refuse, pourPdf) {
  const V = r.virements || [], montant = f ? f.montant : 0, total = V.reduce((a, l) => a + l.commission, 0), net = V.reduce((a, l) => a + l.net, 0), brut = V.reduce((a, l) => a + l.brut, 0);
  const etabli = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'long', year: 'numeric' });
  return G.bandeau({ titre: 'Relevé de commission', sous: (f && f.numero ? 'Facture ' + f.numero + ' · ' : '') + 'établi le ' + etabli, pourPdf }) +
    G.montant({ etiquette: refuse ? 'Commission : paiement refusé' : 'Commission encaissée', valeur: eur(montant || total), etat: refuse ? 'Carte refusée : la facture reste ouverte, nouvel essai au prochain passage' : 'Payée par carte' + (f && f.numero ? ' · facture ' + f.numero : ''), alerte: !!refuse }) +
    G.reperes([{ l: 'Dons encaissés', v: eur(brut), sous: V.reduce((a, l) => a + l.nbDons, 0) + ' don(s)' }, { l: 'Net de l\'association', v: eur(net), sous: 'après frais Stripe' }, { l: 'Commission ' + libTaux(tx, V.some(v => v.netBesoin)), v: eur(total), sous: V.some(v => v.netBesoin) ? 'dont cagnottes ' + eur(V.reduce((a, v) => a + (v.comBesoin || 0), 0)) : eur(net) + ' × ' + tx + ' %' }]) +
    `<p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#1f2937">${refuse ? 'La carte enregistrée a été refusée : la facture reste ouverte, un nouvel essai a lieu au prochain passage.' : `Commission de ${escH(libTaux(tx, V.some(v => v.netBesoin)))} sur les dons nets de l'association (${escH(eur(net))} au total), prélevée par carte le jour de l'arrivée en banque de ${V.length > 1 ? 'ces virements' : 'ce virement'} Stripe.`}</p>` +
    (r.avoir && r.avoir.deduit ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:#1f2937">Commission calculée : ${escH(eur(total))}. <b>Trop-perçu rendu à l'association : − ${escH(eur(r.avoir.deduit))}</b> (dons des cagnottes facturés à ${escH(tx)} % jusqu'au 26/11/2026, nouvelle règle plus basse)${r.avoir.resteApres > 0 ? ', reste à déduire sur les prochaines factures : ' + escH(eur(r.avoir.resteApres)) : ', tout est rendu'}.</p>` : '') +
    G.partie(1, 'À quoi correspond cette commission') + tableauVirements(r, tx) +
    G.note(['Net = dons encaissés − frais Stripe − remboursements − litiges.', 'Commission = net × ' + tx + ' %' + (V.some(v => v.netBesoin) ? ' ; pour les cagnottes : la personne reçoit 90 % du don, ce qui reste après les frais Stripe est partagé moitié-moitié entre le prestataire et l\'association' : '') + '.', 'Aucun don n\'est compté avant l\'arrivée du virement Stripe en banque.', 'Aucun virement n\'est compté deux fois.'], 'Comment c\'est calculé') +
    (V.some(v => (v.detail || []).length) ? G.partie(2, 'Le détail, paiement par paiement') + tableauPaiements(r, pourPdf) : '');
}
function pdfCommission(r, f, tx, refuse) { return G.enPdf(corpsCommission(r, f, tx, refuse, true)); }

async function piecesJointes(m, pdfTampon) {   // PDF (logo Émounatéha) + CSV ; le PDF qui n'a pas pu être fabriqué n'empêche jamais le mail
  const pj = [];
  if (m.pdfHtml && pdfTampon) { try { pj.push({ name: String(m.fichier || 'commission').replace(/\.csv$/i, '') + '.pdf', content: (await pdfTampon(m.pdfHtml)).toString('base64') }); } catch (e) { console.error('commission : PDF non fabriqué', e.message); } }
  if (m.csv) pj.push({ name: m.fichier, content: Buffer.from(m.csv, 'utf8').toString('base64') });
  return pj.length ? pj : undefined;
}
function mailEncaissement(r, live) {
  const tx = String(r.taux).replace('.', ','), f = r.facture || null, rates = (r.reessais || []).filter(x => !x.paye), reussis = (r.reessais || []).filter(x => x.paye);
  const refuse = (f && !f.paye) || rates.length, montant = f ? f.montant : (rates[0] || reussis[0] || {}).montant || 0;
  const subject = `${live ? '' : '[TEST] '}Commission ${refuse ? '— PAIEMENT REFUSÉ' : 'encaissée'} : ${eur(montant)}`;
  const L = [];
  for (const x of reussis) L.push(`Commission : ${eur(x.montant)} — payée au nouvel essai.`);
  for (const x of rates) L.push(`Commission : ${eur(x.montant)} — carte refusée (${x.raison || 'raison inconnue'}). Nouvel essai demain.${x.lien ? ' Lien de paiement : ' + x.lien : ''}`);
  if (f) L.push(`Commission : ${eur(f.montant)} — ${f.paye ? 'payée par carte' : 'carte refusée (' + (f.raison || 'raison inconnue') + '). Nouvel essai demain.' + (f.lien ? ' Lien de paiement : ' + f.lien : '')}`);
  if (f) for (const l of r.virements || []) L.push(`  • virement arrivé le ${jourFr(l.arrivee)} (${eur(l.montantVire)} viré) : ${l.nbDons} don(s), ${l.netBesoin ? 'dons ' + eur(l.net - l.netBesoin) + ' × ' + tx + ' % + cagnottes ' + eur(l.comBesoin || 0) : 'net ' + eur(l.net) + ' × ' + tx + ' %'} = ${eur(l.commission)}`);
  if (r.avoir && r.avoir.deduit) L.push(`Trop-perçu rendu à l'association (cagnottes facturées à ${tx} % jusqu'au 26/11/2026, nouvelle règle plus basse) : − ${eur(r.avoir.deduit)} déduits de cette facture${r.avoir.resteApres > 0 ? ' ; reste à déduire : ' + eur(r.avoir.resteApres) : ' ; tout est rendu'}.`);
  for (const e of r.ecartes || []) L.push(`⚠ Virement ${e.id} non facturé : ${e.raison}.`);
  if (r.reste) L.push(`Il reste ${r.reste} virement(s) plus récents à traiter au prochain passage.`);
  const text = L.join('\n'), e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  const n = c => (c / 100).toFixed(2).replace('.', ',');
  const csv = f ? '﻿' + ['Arrivée en banque;Montant viré;Dons;Dons encaissés;Frais Stripe;Remboursements;Litiges;Net;Commission;Virement Stripe'].concat((r.virements || []).map(l => [jourFr(l.arrivee), n(l.montantVire), l.nbDons, n(l.brut), n(l.frais), n(l.rembourse), n(l.litiges), n(l.net), n(l.commission), l.id].join(';'))).concat(['', ';;;;;;;' + n(r.net) + ';' + n(r.total)]).join('\r\n') : null;
  return { subject, text, html: f ? G.enMail(corpsCommission(r, f, tx, refuse, false), 'En pièces jointes : le relevé en PDF (à classer) et le détail en CSV. Tous les montants sont lus dans Stripe.') : `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:600px"><h2 style="color:${refuse ? '#b45309' : '#1f6a72'};margin:0 0 10px">${e(subject)}</h2>` + L.map(x => `<p style="margin:6px 0;font-size:14px">${e(x)}</p>`).join('') + '</div>', pdfHtml: f ? pdfCommission(r, f, tx, refuse) : null, csv, fichier: f ? `commission_${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })}.csv` : null };
}


// ───────── Côté prestataire : virements vers sa banque, avec une réserve pour l'URSSAF ─────────
// Sur le compte Stripe du prestataire, pour chaque facture de commission payée par l'association, dès que Stripe rend les fonds disponibles :
//   • RÉSERVE % du montant encaissé (le brut, avant frais Stripe) reste sur le solde Stripe : c'est la part mise de côté pour l'URSSAF ;
//   • tout le reste du solde disponible du compte (commissions nettes ET tout autre argent reçu sur ce compte) est viré à la banque du prestataire, à chaque passage.
// Le DERNIER JOUR du mois (30, 31, 28 ou 29), la réserve accumulée est virée à part, avec le libellé « URSSAF mm/aaaa ».
// Passage manqué ce jour-là : rattrapé les trois premiers jours du mois suivant, pour les seules commissions du mois écoulé, sous le libellé du mois écoulé.
// Il faut que les virements du compte soient réglés sur « manuel » (sinon Stripe vire tout, tout seul, et aucune réserve n'est possible).
// Rien n'est mémorisé ici : chaque virement garde la liste des factures qu'il couvre. Verrou : COMMISSION_VIREMENTS=oui, sinon simulation.
const RESERVE = Math.max(0, Math.min(90, Number(process.env.COMMISSION_RESERVE || 30)));
const MIN_VIREMENT = 100;   // pas de virement de moins de 1 €
const moisParis = t => parisJour(t).slice(0, 7);
function jourUrssaf(maintenant) {   // mois à solder : le mois en cours si c'est son dernier jour (Paris) ; le mois écoulé les 1er, 2 et 3 (rattrapage) ; sinon null
  const j = parisJour(maintenant), a = Number(j.slice(0, 4)), m = Number(j.slice(5, 7)), jour = Number(j.slice(8)), dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (jour === dernier) return { mois: j.slice(0, 7), avant: Infinity };
  if (jour <= 3) return { mois: new Date(Date.UTC(a, m - 2, 15)).toISOString().slice(0, 7), avant: Math.floor(minuitParis(j.slice(0, 8) + '01') / 1000) };   // seulement les commissions payées avant le 1er
  return null;
}
const metaListe = (ids, prefixe) => Object.fromEntries(Object.entries(metaVirements(ids)).map(([k, v]) => [prefixe + k.slice(1), v]));
function couvert(virements, genre) {   // factures déjà couvertes par un virement de ce genre (un virement refusé ou annulé ne compte pas)
  const set = new Set();
  for (const p of virements) { if (!p.metadata || p.metadata.commission !== genre || p.status === 'failed' || p.status === 'canceled') continue; for (const [k, v] of Object.entries(p.metadata)) if (/^f\d+$/.test(k)) String(v).split(',').forEach(x => x && set.add(x)); }
  return set;
}
async function virer({ stripe2, simuler, maintenant = Date.now(), actif = process.env.COMMISSION_VIREMENTS === 'oui' }) {
  if (!stripe2) return { ok: true, mode: 'simulation', rien: 'clé du prestataire absente' };
  if (!actif) simuler = true;
  const k = String(process.env.STRIPE_COMMISSION_KEY || '');   // seul le TYPE de la clé est indiqué (jamais la clé) : complète = tous les droits ; restreinte = selon ses réglages
  const out = { ok: true, mode: simuler ? 'simulation' : 'reel', reserve: RESERVE, cle: /^sk_/.test(k) ? 'complète' : /^rk_/.test(k) ? 'restreinte' : 'inconnue', droits: {} };
  for (const [nom, essai] of [['solde', () => stripe2.balance.retrieve()], ['virements (lecture)', () => stripe2.payouts.list({ limit: 1 })], ['factures', () => stripe2.invoices.list({ limit: 1 })]]) { try { await essai(); out.droits[nom] = 'oui'; } catch (e) { out.droits[nom] = 'non : ' + String(e.message).slice(0, 90); } }
  if (Object.values(out.droits).some(x => x !== 'oui')) return { ...out, ok: false, error: 'La clé n\'a pas tous les droits de lecture nécessaires : rien n\'est fait.' };
  // calendrier des virements du compte : par la fiche du compte, sinon par les « réglages du solde » (droit Balance Settings / Payout Settings d'une clé restreinte)
  out.calendrier = 'inconnu'; const pourquoi = [];
  try { const a = await stripe2.accounts.retrieve(); const i = a && a.settings && a.settings.payouts && a.settings.payouts.schedule && a.settings.payouts.schedule.interval; if (i) out.calendrier = i; } catch (e) { pourquoi.push('compte : ' + String(e.message).slice(0, 110)); }
  if (out.calendrier === 'inconnu' && typeof stripe2.rawRequest === 'function') {
    try { const b = await stripe2.rawRequest('GET', '/v1/balance_settings', {}, { apiVersion: '2025-08-27.basil' }); const sc = b && ((b.payments && b.payments.payouts && b.payments.payouts.schedule) || (b.payouts && b.payouts.schedule)); if (sc && sc.interval) out.calendrier = sc.interval; else pourquoi.push('réglages du solde : réponse sans calendrier (' + Object.keys(b || {}).slice(0, 8).join(',') + ')'); }
    catch (e) { pourquoi.push('réglages du solde : ' + String(e.message).slice(0, 110)); }
  }
  if (out.calendrier === 'inconnu') out.calendrierPourquoi = pourquoi;
  if (out.calendrier !== 'manual' && out.calendrier !== 'inconnu') return { ...out, ok: !!simuler, error: 'Les virements de ce compte Stripe sont automatiques (' + out.calendrier + ') : il faut les régler sur « manuel », sinon aucune réserve n\'est possible. Rien n\'est fait.' };
  // factures de commission payées, avec ce que Stripe a réellement crédité (frais déduits) et la date de disponibilité des fonds
  const F = [];
  for await (const f of stripe2.invoices.list({ customer: CLIENT, status: 'paid', limit: 100, expand: ['data.charge.balance_transaction'] })) {
    if (!f.metadata || f.metadata.commission !== '1') continue;
    const ch = f.charge && typeof f.charge === 'object' ? f.charge : null, bt = ch && ch.balance_transaction && typeof ch.balance_transaction === 'object' ? ch.balance_transaction : null;
    if (!ch || !bt || String(bt.currency).toLowerCase() !== 'eur') continue;   // payée hors carte, ou devise étrangère : pas gérée ici
    const brut = bt.amount, net = bt.net, part = Math.round(brut * RESERVE / 100);
    F.push({ id: f.id, numero: f.number, brut, frais: bt.fee, net, reserve: part, reste: net - part, dispo: bt.status === 'available', paye: (f.status_transitions && f.status_transitions.paid_at) || f.created || 0, rembourse: ch.amount_refunded > 0 || ch.disputed === true });
    if (F.length > 5000) break;
  }
  const V = []; for await (const p of stripe2.payouts.list({ limit: 100 })) { if (p.metadata && p.metadata.commission) V.push(p); if (V.length > 5000) break; }
  const dejaUrssaf = couvert(V, 'urssaf');
  out.ecartes = F.filter(f => f.rembourse && !dejaUrssaf.has(f.id)).map(f => ({ facture: f.numero || f.id, raison: 'commission remboursée ou contestée : à traiter à la main' }));
  const bon = F.filter(f => f.dispo && !f.rembourse);
  out.enAttente = F.filter(f => !f.dispo && !f.rembourse).length;   // fonds pas encore rendus disponibles par Stripe
  let dispo = 0; { const b = await stripe2.balance.retrieve(); dispo = ((b.available || []).find(x => x.currency === 'eur') || { amount: 0 }).amount; } out.soldeDisponible = dispo;
  const creer = async (genre, lot, montant, libelle, description, extra = {}) => {
    const ids = lot.map(f => f.id), cle = 'virement-' + genre + '-' + require('crypto').createHash('sha256').update(ids.join(',') + '|' + Math.floor(maintenant / 3600000)).digest('hex').slice(0, 32);
    const p = await stripe2.payouts.create({ amount: montant, currency: 'eur', description, statement_descriptor: libelle, metadata: { commission: genre, ...extra, ...metaListe(ids, 'f') } }, { idempotencyKey: cle });
    dispo -= montant; return { id: p.id, montant, libelle, arrivee: p.arrival_date, etat: p.status, factures: lot.length };
  };
  // 1. tout le solde disponible du compte part à la banque du prestataire, SAUF la réserve URSSAF des commissions déjà disponibles
  //    (le compte est en virements manuels : c'est ce passage qui remplace le virement automatique de Stripe, y compris pour l'argent qui ne vient pas des commissions)
  { const garder = bon.filter(f => !dejaUrssaf.has(f.id)).reduce((a, f) => a + f.reserve, 0), montant = dispo - garder;
    out.partNette = { soldeDisponible: dispo, reserveGardee: garder, montant: Math.max(0, montant) };
    if (montant >= MIN_VIREMENT && !simuler) {
      const cle = 'virement-tout-' + require('crypto').createHash('sha256').update(montant + '|' + garder + '|' + Math.floor(maintenant / 3600000)).digest('hex').slice(0, 32);
      const p = await stripe2.payouts.create({ amount: montant, currency: 'eur', description: `Virement du solde (${eur(garder)} gardés en réserve pour l'URSSAF)`, metadata: { commission: 'tout', reserve: String(garder) } }, { idempotencyKey: cle });
      dispo -= montant; out.partNette.virement = { id: p.id, montant, arrivee: p.arrival_date, etat: p.status };
    } }
  // 2. la réserve URSSAF : une fois par mois, le dernier jour du mois
  { const ju = jourUrssaf(maintenant), mois = ju ? ju.mois : moisParis(maintenant), fait = V.some(p => p.metadata.commission === 'urssaf' && p.metadata.mois === mois && p.status !== 'failed' && p.status !== 'canceled');
    const lot = bon.filter(f => !dejaUrssaf.has(f.id) && (!ju || f.paye < ju.avant)).slice(0, 300), montant = lot.reduce((a, f) => a + f.reserve, 0);
    out.urssaf = { enReserve: F.filter(f => !f.rembourse && !dejaUrssaf.has(f.id)).reduce((a, f) => a + f.reserve, 0), factures: lot.length, encaisse: lot.reduce((a, f) => a + f.brut, 0), montant, mois, jour: !!ju, dejaFait: fait };
    if (ju && !fait && lot.length && montant >= MIN_VIREMENT) {
      if (montant > dispo) out.urssaf.attente = 'solde disponible insuffisant (' + dispo + ' c) : au prochain passage';
      else if (!simuler) out.urssaf.virement = await creer('urssaf', lot, montant, 'URSSAF ' + mois.slice(5) + '/' + mois.slice(0, 4), `Réserve URSSAF ${mois.slice(5)}/${mois.slice(0, 4)} — ${RESERVE} % de ${eur(out.urssaf.encaisse)} de commissions encaissées`, { mois });
    } }
  return out;
}
function mailVirements(v, live) {
  const L = [], pn = v.partNette || {}, u = v.urssaf || {};
  if (pn.virement) L.push(`Virement du solde : ${eur(pn.virement.montant)} vers votre banque (arrivée prévue le ${jourFr(pn.virement.arrivee)}), ${eur(pn.reserveGardee)} gardés en réserve.`);
  if (u.virement) L.push(`Virement URSSAF de ${eur(u.virement.montant)} vers votre banque (libellé « ${u.virement.libelle} », arrivée prévue le ${jourFr(u.virement.arrivee)}).`, `  C'est la réserve de ${v.reserve} % sur ${eur(u.encaisse)} de commissions encaissées (${u.factures} facture(s)). Chiffre d'affaires correspondant à déclarer : ${eur(u.encaisse)}.`);
  for (const e of v.ecartes || []) L.push(`⚠ Facture ${e.facture} : ${e.raison}.`);
  const titre = u.virement ? `URSSAF : ${eur(u.virement.montant)} virés sur votre compte` : `Commission : ${eur((pn.virement || {}).montant || 0)} virés sur votre compte`, subject = (live ? '' : '[TEST] ') + titre;
  const e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  return { subject, text: L.join('\n'), html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:600px"><h2 style="color:#1f6a72;margin:0 0 10px">${e(titre)}</h2>` + L.map(x => `<p style="margin:6px 0;font-size:14px">${e(x)}</p>`).join('') + '</div>' };
}

function monter(app, { stripe, adminOk, mailer, load, save, pdfTampon, stripe2 = process.env.STRIPE_COMMISSION_KEY ? require('stripe')(process.env.STRIPE_COMMISSION_KEY) : null }) {
  // Appelé chaque jour par le serveur du site : encaisse par carte la commission des virements arrivés en banque (jamais avant). Sans clé du prestataire, ou avec { simuler: true } : simulation.
  app.post('/api/admin/commission/encaisser', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const r = await encaisser({ stripe, stripe2, simuler: !!(req.body && req.body.simuler), recus: (load().receipts) || {} });
      if (r.mode === 'reel' && (r.facture || (r.reessais || []).length || (r.ecartes || []).length)) {
        const to = String(process.env.COMMISSION_EMAIL || '').trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { try { const m = mailEncaissement(r, estLive(process.env.STRIPE_SECRET_KEY)); const env = await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text, attachments: await piecesJointes(m, pdfTampon) }); r.mail = !!(env && env.sent); } catch (e) { r.mail = false; console.error('commission/encaisser e-mail', e.message); } }
      }
      // puis, sur le compte du prestataire : part nette virée à sa banque, réserve URSSAF gardée (et virée le 30)
      try {
        const v = await virer({ stripe2, simuler: !!(req.body && req.body.simuler) }); r.mesVirements = v;
        const to = String(process.env.COMMISSION_EMAIL || '').trim();
        if (v.mode === 'reel' && (v.urssaf || {}).virement && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { const m = mailVirements(v, estLive(process.env.STRIPE_COMMISSION_KEY)); try { await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text }); } catch (e) { console.error('commission/virements e-mail', e.message); } }
      } catch (e) { r.mesVirements = { ok: false, error: e.message }; console.error('commission/virements', e.message); }
      res.setHeader('Cache-Control', 'no-store'); res.status(r.ok === false ? 409 : 200).json(r);
    } catch (e) { console.error('commission/encaisser', e.message); res.status(502).json({ error: e.message }); }
  });

  // Appelé chaque lundi par le serveur du site : envoie au prestataire le relevé de la semaine écoulée (lundi → dimanche). Une seule fois par semaine.
  app.post('/api/admin/commission/envoyer', async (req, res) => {
    if (!adminOk(req, res)) return;
    try {
      const to = String(process.env.COMMISSION_EMAIL || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return res.json({ ok: true, envoye: false, raison: 'COMMISSION_EMAIL non renseigné' });
      if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
      // période au choix (rattrapage des dons reçus avant la mise en place du relevé hebdomadaire) : { du, au } ; sinon la semaine écoulée
      const b = req.body || {}, bon = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')), rattrapage = bon(b.du) && bon(b.au) && b.du <= b.au;
      if (rattrapage && (Date.parse(b.au) - Date.parse(b.du)) / 86400000 > 370) return res.status(400).json({ error: 'Période trop longue (un an au plus)' });
      const p = rattrapage ? { du: b.du, au: b.au } : semainePrecedente(semaine(parisJour(Date.now()))), d = load();
      if (!rattrapage && d.commission && d.commission.dernierReleve === p.du && !b.forcer) return res.json({ ok: true, envoye: false, raison: 'déjà envoyé pour la semaine du ' + p.du });
      const live = /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), r = calculer(await mouvementsStripe(stripe, p.du, p.au)), m = releveMail(p, r, live, rattrapage);
      const env = await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text, attachments: [{ name: m.fichier, content: Buffer.from(m.csv, 'utf8').toString('base64') }] });   // format attendu par l'envoi Brevo : nom + contenu en base64
      if (!(env && (env.sent === true || (env.simulated && mailer.isFake && mailer.isFake(to))))) return res.json({ ok: true, envoye: false, raison: 'e-mail non envoyé' + (env && env.reason ? ' (' + env.reason + ')' : '') });   // rien n'est noté : nouvel essai plus tard
      const d2 = load(); d2.commission = rattrapage ? { ...(d2.commission || {}), rattrapage: { du: p.du, au: p.au, envoyeLe: new Date().toISOString(), net: r.net, commission: r.commission } } : { ...(d2.commission || {}), dernierReleve: p.du, envoyeLe: new Date().toISOString() }; save(d2);
      res.json({ ok: true, envoye: true, rattrapage, periode: p, nbDons: r.nbDons, commission: r.commission, net: r.net, controle: r.controle, mail: true });
    } catch (e) { console.error('commission/envoyer', e.message); res.status(502).json({ error: e.message }); }
  });

  // CRM → relevé d'une période (par défaut : la semaine en cours) et rappel des périodes précédentes
  app.get('/api/admin/commission', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
      const auj = parisJour(Date.now());
      let p = ok(req.query.du) && ok(req.query.au) && req.query.du <= req.query.au ? { du: req.query.du, au: req.query.au } : semaine(auj);
      if ((Date.parse(p.au) - Date.parse(p.du)) / 86400000 > 370) return res.status(400).json({ error: 'Période trop longue (un an au plus)' });
      const releve = calculer(await mouvementsStripe(stripe, p.du, p.au));
      // six semaines précédentes, en résumé (sans le détail des lignes)
      const precedentes = []; let q = semaine(p.du);
      if (req.query.historique !== '0') for (let i = 0; i < 6; i++) { q = semainePrecedente(q); const r = calculer(await mouvementsStripe(stripe, q.du, q.au)); precedentes.push({ du: q.du, au: q.au, nbDons: r.nbDons, brut: r.brut, frais: r.frais, rembourse: r.rembourse, litiges: r.litiges, net: r.net, commission: r.commission, controle: r.controle }); }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ mode: 'a-blanc', rythme: 'hebdomadaire', periode: p, enCours: p.au >= auj, client: CLIENT, live: /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), ...releve, precedentes });
    } catch (e) { console.error('commission', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { tropPercu, AVOIR_AVANT, ANCIEN_TAUX_JUSQU, REGLE_BESOIN_DEPUIS, regleBesoin, TAUX_BESOIN, PART_ASSO_BESOIN, estBesoin, partsBesoin, PART_PERSONNE, libTaux, virer, jourUrssaf, couvert, mailVirements, encaisser, echu, ligneVirement, dejaPris, metaVirements, mailEncaissement, releveMail, calculer, semaine, semainePrecedente, minuitParis, mouvementsStripe, monter, TAUX, CLIENT };
