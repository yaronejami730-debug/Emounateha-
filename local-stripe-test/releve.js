// Relevé d'un virement Stripe → banque de l'association, tel que voulu par Yarone (23 nov 2026) :
//   • PDF « résumé » : dons généraux PAR TYPE DE DON (Hanouka, Colis de Chabbat…), puis « Besoins (cagnottes personnelles) »,
//     chaque ligne avec Brut / Frais Stripe / Frais 7 % / Net ;
//   • PDF « détail » (paysage) : chaque paiement du virement, avec donateur, e-mail et ID de paiement Stripe, sous-total par type et par cagnotte
//     (le sous-total d'une cagnotte = la somme que la trésorière doit lui reverser) ;
//   • tableur Excel : onglet Résumé + onglet Détail des paiements ;
//   • les mêmes lignes pour le Google Sheet de l'association.
// RÈGLE : aucun mouvement du virement n'est laissé de côté. Remboursements, litiges et mouvements inconnus ont leur ligne,
// et tout écart entre la somme des lignes et le montant viré est affiché en clair (jamais masqué).
// LECTURE SEULE : rien n'est écrit chez Stripe ici.

const G = require('./gabarit.js'), { TEAL, GRIS, TRAIT, FOND } = G, esc = G.esc;
const ENTREES = new Set(['charge', 'payment']), SORTIES = new Set(['refund', 'payment_refund', 'payment_failure_refund', 'refund_failure', 'payment_reversal']), LITIGES = new Set(['adjustment']);
const P = { timeZone: 'Europe/Paris' };
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const moins = c => (c > 0 ? '− ' : c < 0 ? '+ ' : '') + eur(Math.abs(c));
const signe = c => (c < 0 ? '− ' : '') + eur(Math.abs(c));
const jourCourt = t => new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...P });
const heure = t => new Date(t * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...P });
const jourLong = t => new Date(t * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...P });
const idDe = v => (v && typeof v === 'object' ? v.id : v) || '';
const S = (A, k) => A.reduce((a, l) => a + (l[k] || 0), 0);
const nbP = n => n + ' paiement' + (n > 1 ? 's' : '');

// Mini-cagnotte nominative (« Besoin : <titre> ») : par le reçu, à défaut par le libellé Stripe du paiement
function cagnotteDe(r, description) {
  if (r && r.besoin && /^Besoin : /.test(String(r.affectation || ''))) return String(r.affectation).slice(9).replace(/\s+/g, ' ').trim().slice(0, 80);
  const m = String(description || '').match(/(?:^|— )Besoin : (.+?)(?: \([a-z0-9-]{1,40}\))?\s*$/);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}
// Type de don, d'après l'affectation du reçu (ou la fin du libellé Stripe « Don … — <affectation> ») :
//   « Hanouka : Diffusion de la lumière, … » → Hanouka ; « Campagne de Hanouka : … » → Hanouka ; « Club 'Haï : … » → Club 'Haï ; « Colis de Chabbat » → tel quel
function typeDon(affectation) {
  let t = String(affectation || '').replace(/\s+/g, ' ').trim(); if (!t) return '';
  if (t.includes(' : ')) t = t.split(' : ')[0];
  const c = t.match(/^Campagne (?:de |du |des |d'|d’)?(.+)$/i); if (c) t = c[1];
  return t.trim().slice(0, 80);
}
const affDuLibelle = d => { const s = String(d || ''), i = s.lastIndexOf('— '); return i >= 0 ? s.slice(i + 2) : ''; };
const LIB_AUTRE = { stripe_fee: 'Frais Stripe divers', tax_fee: 'Taxe sur les frais Stripe', network_cost: 'Frais de réseau', application_fee: 'Frais d\'application', contribution: 'Contribution Stripe Climate', reserve_transaction: 'Réserve Stripe', reserved_funds: 'Fonds réservés par Stripe', topup: 'Rechargement du solde', transfer: 'Transfert', advance: 'Avance', advance_funding: 'Avance' };

// Moyen de paiement, lu chez Stripe (le paiement lui-même), sinon dans le reçu
function moyenDe(src, r) {
  const d = src && src.payment_method_details, t = d && d.type;
  if (t === 'card') { const c = d.card || {}, w = c.wallet && c.wallet.type; return w === 'apple_pay' ? 'Apple Pay' : w === 'google_pay' ? 'Google Pay' : 'Carte' + (c.brand ? ' ' + String(c.brand).replace(/^./, x => x.toUpperCase()) : '') + (c.last4 ? ' ···· ' + c.last4 : ''); }
  const N = { paypal: 'PayPal', klarna: 'Klarna', sepa_debit: 'Prélèvement SEPA', link: 'Link', bancontact: 'Bancontact', ideal: 'iDEAL' };
  if (t) return N[t] || t;
  const m = String((r && r.mode) || '');
  return /paypal/i.test(m) ? 'PayPal' : /klarna/i.test(m) ? 'Klarna' : /sepa|prélèvement/i.test(m) ? 'Prélèvement SEPA' : /carte/i.test(m) ? 'Carte' : m.replace(/\s+/g, ' ').slice(0, 40);
}
function frequenceDe(r, src, genre) {
  if (genre !== 'Don') return '';
  if (r && r.mensuel) return 'Mensuel' + (r.echeance ? ' (échéance n°' + r.echeance + (r.nb ? ' sur ' + r.nb : '') + ')' : '');
  return src && src.invoice ? 'Mensuel' : 'Ponctuel';
}

// Le modèle commun aux trois fichiers et au Google Sheet. commission = frais 7 % réels de ce virement (centimes), répartis sur les lignes.
function modele(p, mouvements, recus = {}, { taux = 7, commission = null } = {}) {
  const lignes = [];
  for (const m of mouvements || []) {
    if (!m || m.type === 'payout') continue;
    const src = m.source && typeof m.source === 'object' ? m.source : null, t = String(m.type || '');
    const pi = idDe(src && src.payment_intent), cles = [pi, idDe(src && src.invoice), idDe(src && src.charge), src && src.id].filter(Boolean);
    const cle = cles.find(k => recus && recus[k]), r = cle ? recus[cle] : null;
    const genre = ENTREES.has(t) ? 'Don' : SORTIES.has(t) ? 'Remboursement' : LITIGES.has(t) ? 'Litige' : 'Autre';
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0), net = m.net != null ? Math.round(Number(m.net)) : a - f;
    const bd = (src && src.billing_details) || {}, form = (r && r.form) || {};
    let categorie, type;
    const cag = genre === 'Autre' ? '' : cagnotteDe(r, m.description) || cagnotteDe(null, src && src.description);
    if (cag) { categorie = 'besoin'; type = cag; }
    else if (genre === 'Autre') { categorie = 'autre'; type = LIB_AUTRE[t] || 'Autre mouvement Stripe (' + t + ')'; }
    else { categorie = 'general'; type = typeDon(r && r.affectation) || typeDon(affDuLibelle(m.description)) || typeDon(affDuLibelle(src && src.description)) || 'Don non identifié (voir l\'ID Stripe)'; }
    const nomComplet = String((r && r.nom) || bd.name || '').replace(/\s+/g, ' ').trim();
    const prenom = String(form.prenom || '').trim(), nom = String(form.nom || '').trim() || (prenom ? '' : nomComplet);
    lignes.push({ categorie, type, genre, typeStripe: t, t: m.created || 0, date: jourCourt(m.created || 0), heure: heure(m.created || 0),
      prenom: prenom.slice(0, 60), nom: nom.slice(0, 80), email: String((r && r.donorEmail) || bd.email || (src && src.receipt_email) || '').slice(0, 120),
      paiement: pi || (src && src.id) || m.id || '', mouvement: m.id || '', recu: r ? String(r.numero || '') : '',
      moyen: genre === 'Autre' ? '' : moyenDe(src, r), frequence: frequenceDe(r, src, genre), donateurType: r ? (r.type === 'entreprise' ? 'Entreprise' : 'Particulier') : '',
      brut: a, frais: f, netStripe: net, com: 0, net });
  }
  lignes.sort((x, y) => x.t - y.t || String(x.mouvement).localeCompare(String(y.mouvement)));
  // frais 7 % : même base que la commission (dons, remboursements, litiges ; pas les autres mouvements), répartis au prorata, au centime près
  const base = lignes.filter(l => l.categorie !== 'autre'), baseNet = S(base, 'netStripe');
  const total = commission != null ? Math.round(commission) : baseNet > 0 ? Math.round(baseNet * taux / 100) : 0;
  if (total && baseNet) {
    const parts = base.map(l => { const v = total * l.netStripe / baseNet; return { l, e: Math.trunc(v), r: v - Math.trunc(v) }; });
    let reste = total - parts.reduce((a, x) => a + x.e, 0);
    parts.sort((x, y) => (reste > 0 ? y.r - x.r : x.r - y.r));
    for (let i = 0; reste !== 0 && parts.length; i = (i + 1) % parts.length) { parts[i].e += Math.sign(reste); reste -= Math.sign(reste); }
    parts.forEach(x => { x.l.com = x.e; });
  }
  lignes.forEach(l => { l.net = l.netStripe - l.com; });
  const grouper = cat => { const M = new Map(); for (const l of lignes.filter(x => x.categorie === cat)) { if (!M.has(l.type)) M.set(l.type, []); M.get(l.type).push(l); } return [...M].map(([type, L]) => ({ type, L, paiements: L.filter(l => l.genre === 'Don').length })).sort((a, b) => S(b.L, 'brut') - S(a.L, 'brut') || a.type.localeCompare(b.type)); };
  const sommeStripe = S(lignes, 'netStripe'), ecart = Math.round(Number(p.amount) || 0) - sommeStripe;
  return {
    virement: { id: p.id, montant: Math.round(Number(p.amount) || 0), arrivee: p.arrival_date, cree: p.created, date: jourCourt(p.arrival_date || p.created || 0), dateLongue: jourLong(p.arrival_date || p.created || 0), statut: p.status },
    taux, lignes, general: grouper('general'), besoins: grouper('besoin'), autres: grouper('autre'),
    totaux: { paiements: lignes.filter(l => l.genre === 'Don').length, dons: S(lignes.filter(l => l.genre === 'Don'), 'brut'), retours: S(lignes.filter(l => l.genre === 'Remboursement' || l.genre === 'Litige'), 'brut'), autres: S(lignes.filter(l => l.categorie === 'autre'), 'brut'),
      brut: S(lignes, 'brut'), frais: S(lignes, 'frais'), com: S(lignes, 'com'), net: S(lignes, 'net'), sommeStripe, ecart },
    complet: ecart === 0
  };
}

// ───────── PDF et e-mail ─────────
const th = `padding:7px 5px;border-bottom:2px solid ${TEAL};font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:${GRIS};text-align:right`;
const td = `padding:8px 5px;border-bottom:1px solid ${TRAIT};font-size:13px;text-align:right;white-space:nowrap`;
const titre = (n, t, s) => G.partie(n, t).replace(/<\/td><\/tr><\/table>$/, s ? ` <span style="font-weight:normal;color:${GRIS}">${esc(s)}</span></td></tr></table>` : '</td></tr></table>');
function tableauResume(groupes, libTotal) {
  const ent = `<colgroup><col style="width:40%"><col style="width:14%"><col style="width:16%"><col style="width:13%"><col style="width:17%"></colgroup><thead><tr><th style="${th};text-align:left">&nbsp;</th><th style="${th}">Brut</th><th style="${th}">Frais Stripe</th><th style="${th}">Frais 7 %</th><th style="${th}">Net</th></tr></thead>`;
  const lig = g => { const autres = g.L.length - g.paiements; return `<tr><td style="${td};text-align:left;white-space:normal">${esc(g.type)} <span style="font-size:11.5px;color:${GRIS}">· ${g.paiements ? nbP(g.paiements) : ''}${autres ? (g.paiements ? ' + ' : '') + autres + ' mouvement' + (autres > 1 ? 's' : '') + ' (remboursement, litige…)' : ''}</span></td><td style="${td}">${signe(S(g.L, 'brut'))}</td><td style="${td};color:#b45309">${moins(S(g.L, 'frais'))}</td><td style="${td};color:#b45309">${moins(S(g.L, 'com'))}</td><td style="${td};font-weight:bold;color:${TEAL}">${signe(S(g.L, 'net'))}</td></tr>`; };
  const L = groupes.flatMap(g => g.L), n = groupes.reduce((a, g) => a + g.paiements, 0);
  const tot = `<tr>${[libTotal + ' (' + nbP(n) + ')', signe(S(L, 'brut')), moins(S(L, 'frais')), moins(S(L, 'com')), signe(S(L, 'net'))].map((v, i) => `<td style="padding:10px 5px;border-top:2px solid ${TEAL};font-weight:bold;font-size:13.5px;text-align:${i ? 'right' : 'left'};white-space:${i ? 'nowrap' : 'normal'}${i === 4 ? ';color:' + TEAL : ''}">${esc(v)}</td>`).join('')}</tr>`;
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed">${ent}<tbody>${groupes.map(lig).join('')}${tot}</tbody></table>`;
}
function recap(M) {
  const T = M.totaux, R = [['Dons reçus (brut, ' + nbP(T.paiements) + ')', eur(T.dons)]];
  if (T.retours) R.push(['Remboursements et litiges', signe(T.retours)]);
  R.push(['− Frais Stripe', moins(T.frais)]);
  if (T.autres) R.push(['Autres mouvements Stripe', signe(T.autres)]);
  if (T.ecart) R.push(['Écart : solde reporté ou mouvement non rattaché (voir ci-dessous)', signe(T.ecart)]);
  R.push(['= Virement reçu à la banque', eur(M.virement.montant), 1], ['− Frais ' + M.taux + ' % (prélevés à part, par carte)', moins(T.com)]);
  const ligne = x => `<tr><td style="padding:9px 16px 0;font-size:14px${x[2] ? ';font-weight:bold' : ''}">${esc(x[0])}</td><td style="padding:9px 16px 0;text-align:right;font-size:14px;white-space:nowrap${x[2] ? ';font-weight:bold' : ''}">${esc(x[1])}</td></tr>`;
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:24px 0 0;background:${FOND};border-radius:10px;page-break-inside:avoid">${R.map(ligne).join('')}` +
    `<tr><td style="padding:12px 16px;font-weight:bold;font-size:16px;border-top:2px solid ${TEAL}">= Net pour l'association</td><td style="padding:12px 16px;text-align:right;font-weight:bold;font-size:20px;color:${TEAL};border-top:2px solid ${TEAL};white-space:nowrap">${eur(M.virement.montant - T.com)}</td></tr>` +
    `<tr><td colspan="2" style="padding:0 16px 12px;font-size:12.5px;color:${GRIS}">dont dons généraux ${signe(S(M.general.flatMap(g => g.L), 'net'))} · dont besoins ${signe(S(M.besoins.flatMap(g => g.L), 'net'))}${M.autres.length ? ' · autres mouvements ' + signe(S(M.autres.flatMap(g => g.L), 'net')) : ''}${T.ecart ? ' · écart ' + signe(T.ecart) : ''}</td></tr></table>`;
}
const alerteEcart = M => M.totaux.ecart ? `<p style="margin:16px 0 0;padding:10px 12px;background:#fdecec;border:1px solid #f5b5b5;border-radius:8px;font-size:13px;line-height:1.5;color:#991b1b"><b>Attention :</b> la somme des paiements listés (${signe(M.totaux.sommeStripe)}) ne fait pas exactement le montant viré (${eur(M.virement.montant)}) : écart de ${signe(M.totaux.ecart)}. C'est en général un solde reporté d'un virement précédent ; à vérifier dans Stripe avec la référence ${esc(M.virement.id)}.</p>` : '';

function resumeCorps(M, { pourPdf = false, avert = '' } = {}) {
  const T = M.totaux, gen = M.general.flatMap(g => g.L), bes = M.besoins.flatMap(g => g.L);
  let n = 0;
  return G.bandeau({ titre: 'Relevé de virement', sous: 'Virement du ' + M.virement.dateLongue, pourPdf }) + G.avertissement(avert) +
    G.montant({ etiquette: 'Net pour l\'association', valeur: eur(M.virement.montant - T.com), etat: 'Virement de ' + eur(M.virement.montant) + ' · arrivée le ' + M.virement.dateLongue }) +
    G.reperes([{ l: 'Brut', v: eur(T.dons), sous: nbP(T.paiements) }, { l: 'Dons généraux', v: signe(S(gen, 'net')), sous: 'net' }, { l: 'Besoins', v: signe(S(bes, 'net')), sous: M.besoins.length ? M.besoins.length + ' cagnotte' + (M.besoins.length > 1 ? 's' : '') + ', net' : 'aucune cagnotte' }]) +
    (M.general.length ? titre(++n, 'Dons généraux', '(par type de don)') + tableauResume(M.general, 'Total dons généraux') : '') +
    (M.besoins.length ? titre(++n, 'Besoins', '(cagnottes personnelles)') + tableauResume(M.besoins, 'Total besoins') : '') +
    (M.autres.length ? titre(++n, 'Autres mouvements Stripe', '(ni dons ni cagnottes)') + tableauResume(M.autres, 'Total autres mouvements') : '') +
    recap(M) + alerteEcart(M) +
    `<p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:${GRIS}">Frais Stripe : retenus par Stripe sur chaque paiement. Frais ${M.taux} % : frais du prestataire, calculés sur le montant après frais Stripe, prélevés à part par carte. Seules les lignes qui ont reçu des paiements apparaissent. Le détail de chaque paiement (donateur, e-mail, ID de paiement Stripe) est dans le relevé détaillé et le tableur joints. Référence du virement : ${esc(M.virement.id)}.</p>`;
}

function detailCorps(M, { avert = '' } = {}) {
  const thd = th.replace('font-size:10.5px', 'font-size:9.5px'), tdd = td.replace('font-size:13px', 'font-size:11.5px').replace('padding:8px 5px', 'padding:6px 5px');
  const bloc = (g, cat) => `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 14px"><colgroup><col style="width:11%"><col style="width:17%"><col style="width:22%"><col style="width:22%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"></colgroup>` +
    `<thead><tr><td colspan="8" style="padding:8px 6px;background:${FOND};font-size:13.5px;font-weight:bold;color:${TEAL}">${cat === 'besoin' ? 'Besoin · cagnotte « ' + esc(g.type) + ' »' : esc(g.type)} <span style="font-weight:normal;color:${GRIS};font-size:12px">· ${[g.paiements ? nbP(g.paiements) : '', g.L.length - g.paiements ? (g.L.length - g.paiements) + ' autre' + (g.L.length - g.paiements > 1 ? 's' : '') + ' mouvement' + (g.L.length - g.paiements > 1 ? 's' : '') : ''].filter(Boolean).join(' + ')} · net ${signe(S(g.L, 'net'))}${cat === 'besoin' ? ' à reverser' : ''}</span></td></tr>` +
    `<tr><th style="${thd};text-align:left">Date</th><th style="${thd};text-align:left">Donateur</th><th style="${thd};text-align:left">E-mail</th><th style="${thd};text-align:left">ID de paiement Stripe</th><th style="${thd}">Brut</th><th style="${thd}">Frais Stripe</th><th style="${thd}">Frais ${M.taux} %</th><th style="${thd}">Net</th></tr></thead><tbody>` +
    g.L.map(l => `<tr><td style="${tdd};text-align:left">${esc(l.date)} ${esc(l.heure)}</td><td style="${tdd};text-align:left;white-space:normal">${l.genre !== 'Don' ? `<b style="color:#b45309">${esc(l.genre === 'Autre' ? 'Mouvement Stripe' : l.genre)}</b><br>` : ''}<b>${esc([l.prenom, l.nom].filter(Boolean).join(' ') || '—')}</b>${[l.moyen, l.frequence, l.donateurType, l.recu ? 'Reçu ' + l.recu : ''].filter(Boolean).length ? `<br><span style="color:${GRIS};font-size:10px">${esc([l.moyen, l.frequence, l.donateurType, l.recu ? 'Reçu ' + l.recu : ''].filter(Boolean).join(' · '))}</span>` : ''}</td><td style="${tdd};text-align:left;white-space:normal;overflow-wrap:anywhere">${esc(l.email || '—')}</td><td style="${tdd};text-align:left;white-space:normal;overflow-wrap:anywhere;font-family:Menlo,Consolas,monospace;font-size:10px">${esc(l.paiement)}</td><td style="${tdd}">${signe(l.brut)}</td><td style="${tdd};color:#b45309">${moins(l.frais)}</td><td style="${tdd};color:#b45309">${moins(l.com)}</td><td style="${tdd};font-weight:bold;color:${TEAL}">${signe(l.net)}</td></tr>`).join('') +
    `<tr><td colspan="4" style="padding:7px 5px;border-top:2px solid ${TEAL};font-weight:bold;font-size:12px">Sous-total ${esc(g.type)}</td>${[signe(S(g.L, 'brut')), moins(S(g.L, 'frais')), moins(S(g.L, 'com')), signe(S(g.L, 'net'))].map((v, j) => `<td style="padding:7px 5px;border-top:2px solid ${TEAL};font-weight:bold;font-size:12px;text-align:right;white-space:nowrap${j === 3 ? ';color:' + TEAL : ''}">${v}</td>`).join('')}</tr></tbody></table>`;
  let n = 0;
  return G.bandeau({ titre: 'Relevé détaillé du virement', sous: 'Virement du ' + M.virement.dateLongue + ' · ' + eur(M.virement.montant) + ' · réf. ' + M.virement.id, pourPdf: true }) + G.avertissement(avert) +
    `<p style="margin:0 0 6px;font-size:13.5px;line-height:1.55">Chaque paiement contenu dans ce virement, avec son ID de paiement Stripe (à rechercher dans Stripe pour retrouver le paiement). Pour les besoins, le net de chaque cagnotte est la somme à lui reverser.</p>` +
    (M.general.length ? titre(++n, 'Dons généraux', '(par type de don)') + M.general.map(g => bloc(g, 'general')).join('') : '') +
    (M.besoins.length ? titre(++n, 'Besoins', '(cagnottes personnelles)') + M.besoins.map(g => bloc(g, 'besoin')).join('') : '') +
    (M.autres.length ? titre(++n, 'Autres mouvements Stripe', '(ni dons ni cagnottes)') + M.autres.map(g => bloc(g, 'autre')).join('') : '') +
    recap(M) + alerteEcart(M);
}

function resumeTexte(M, avert = '') {
  const T = M.totaux, lig = g => `  ${g.type} (${nbP(g.paiements)}) : ${signe(S(g.L, 'brut'))} brut ${moins(S(g.L, 'frais'))} frais Stripe ${moins(S(g.L, 'com'))} frais ${M.taux} % = ${signe(S(g.L, 'net'))} net`;
  return [avert || null, `Virement de ${eur(M.virement.montant)}, arrivée le ${M.virement.dateLongue} (réf. ${M.virement.id}).`, `Net pour l'association : ${eur(M.virement.montant - T.com)}.`, '',
    ...(M.general.length ? ['DONS GÉNÉRAUX (par type de don)', ...M.general.map(lig), ''] : []),
    ...(M.besoins.length ? ['BESOINS (cagnottes personnelles) : net à reverser', ...M.besoins.map(lig), ''] : []),
    ...(M.autres.length ? ['AUTRES MOUVEMENTS STRIPE', ...M.autres.map(lig), ''] : []),
    `Dons reçus : ${eur(T.dons)}${T.retours ? ' ; remboursements et litiges : ' + signe(T.retours) : ''} ; frais Stripe : ${moins(T.frais)}${T.autres ? ' ; autres mouvements : ' + signe(T.autres) : ''}${T.ecart ? ' ; ÉCART NON RATTACHÉ : ' + signe(T.ecart) : ''}`,
    `= Virement reçu à la banque : ${eur(M.virement.montant)} ; frais ${M.taux} % (à part, par carte) : ${moins(T.com)} ; = net : ${eur(M.virement.montant - T.com)}`, '',
    'Pièces jointes : relevé résumé (PDF), relevé détaillé avec chaque paiement et son ID Stripe (PDF), tableur Excel.'].filter(x => x !== null).join('\n');
}

// ───────── Excel ─────────
function tableur(M, { avert = '' } = {}) {
  const X = require('./xlsx.js'), e = c => Math.round(c) / 100;
  const cat = { general: 'Dons généraux', besoin: 'Besoin (cagnotte)', autre: 'Autre mouvement Stripe' };
  // Résumé
  const R = [[{ v: 'Relevé du virement du ' + M.virement.dateLongue, s: 'titre' }], ['Référence du virement Stripe : ' + M.virement.id + ' · montant viré : ' + eur(M.virement.montant)]];
  if (avert) R.push([{ v: avert, s: 'alerte' }]);
  R.push([]);
  const enTete = R.length + 1; R.push(['Catégorie', 'Type de don / cagnotte', 'Paiements', 'Brut', 'Frais Stripe', 'Frais ' + M.taux + ' %', 'Net'].map(v => ({ v, s: 'entete' })));
  const totaux = [];
  for (const [k, groupes] of [['general', M.general], ['besoin', M.besoins], ['autre', M.autres]]) {
    if (!groupes.length) continue;
    const d0 = R.length + 1;
    groupes.forEach(g => R.push([cat[k], g.type, g.paiements, { v: e(S(g.L, 'brut')), s: 'eur' }, { v: -e(S(g.L, 'frais')), s: 'eur' }, { v: -e(S(g.L, 'com')), s: 'eur' }, { v: e(S(g.L, 'net')), s: 'eur' }]));
    const L = groupes.flatMap(g => g.L), r = R.length + 1; totaux.push(r);
    R.push([{ v: '', s: 'gras' }, { v: 'Total ' + cat[k].toLowerCase(), s: 'gras' }, { f: `SUM(C${d0}:C${r - 1})`, v: groupes.reduce((a, g) => a + g.paiements, 0), s: 'gras' }, ...[['D', S(L, 'brut')], ['E', -S(L, 'frais')], ['F', -S(L, 'com')], ['G', S(L, 'net')]].map(([c, v]) => ({ f: `SUM(${c}${d0}:${c}${r - 1})`, v: e(v), s: 'eurGras' }))]);
  }
  const T = M.totaux, sommeT = c => totaux.map(r => c + r).join('+') || '0';
  const rt = R.length + 1;
  R.push([{ v: '', s: 'total' }, { v: 'TOTAL DES PAIEMENTS', s: 'total' }, { f: sommeT('C'), v: T.paiements, s: 'total' }, { f: sommeT('D'), v: e(T.brut), s: 'eurTotal' }, { f: sommeT('E'), v: -e(T.frais), s: 'eurTotal' }, { f: sommeT('F'), v: -e(T.com), s: 'eurTotal' }, { f: sommeT('G'), v: e(T.net), s: 'eurTotal' }]);
  R.push([]);
  if (T.ecart) R.push(['', { v: 'Écart non rattaché (solde reporté ?) : à vérifier dans Stripe', s: 'alerte' }, '', '', '', '', { v: e(T.ecart), s: 'eur' }]);
  R.push(['', { v: 'Virement reçu à la banque', s: 'gras' }, '', '', '', '', { v: e(M.virement.montant), s: 'eurGras' }]);
  R.push(['', 'Frais ' + M.taux + ' % prélevés à part, par carte', '', '', '', '', { f: `F${rt}`, v: -e(T.com), s: 'eur' }]);
  R.push(['', { v: 'Net pour l\'association', s: 'gras' }, '', '', '', '', { f: `G${R.length - 1}+G${R.length}`, v: e(M.virement.montant - T.com), s: 'eurGras' }]);
  // Détail
  const D = [['Catégorie', 'Type de don / cagnotte', 'Nature', 'Date', 'Heure', 'Prénom', 'Nom', 'E-mail', 'ID de paiement Stripe', 'N° de reçu', 'Brut', 'Frais Stripe', 'Frais ' + M.taux + ' %', 'Net', 'Référence du mouvement Stripe', 'Moyen de paiement', 'Fréquence', 'Particulier / entreprise'].map(v => ({ v, s: 'entete' }))];
  for (const [k, groupes] of [['general', M.general], ['besoin', M.besoins], ['autre', M.autres]]) for (const g of groupes) {
    const d0 = D.length + 1;
    g.L.forEach(l => D.push([cat[k], g.type, l.genre === 'Autre' ? 'Mouvement Stripe' : l.genre, l.date, l.heure, l.prenom, l.nom, l.email, l.paiement, l.recu, { v: e(l.brut), s: 'eur' }, { v: -e(l.frais), s: 'eur' }, { v: -e(l.com), s: 'eur' }, { v: e(l.net), s: 'eur' }, l.mouvement, l.moyen, l.frequence, l.donateurType]));
    const r = D.length + 1;
    D.push([{ v: '', s: 'gras' }, { v: 'Sous-total ' + g.type, s: 'gras' }, { v: g.L.length + ' ligne' + (g.L.length > 1 ? 's' : ''), s: 'gras' }, ...Array(7).fill({ v: '', s: 'gras' }), ...[['K', S(g.L, 'brut')], ['L', -S(g.L, 'frais')], ['M', -S(g.L, 'com')], ['N', S(g.L, 'net')]].map(([c, v]) => ({ f: `SUM(${c}${d0}:${c}${r - 1})`, v: e(v), s: 'eurGras' })), { v: '', s: 'gras' }, { v: '', s: 'gras' }, { v: '', s: 'gras' }, { v: '', s: 'gras' }]);
  }
  const fin = D.length;
  D.push([{ v: '', s: 'total' }, { v: 'TOTAL DU VIREMENT', s: 'total' }, ...Array(8).fill({ v: '', s: 'total' }), ...[['K', T.brut], ['L', -T.frais], ['M', -T.com], ['N', T.net]].map(([c, v]) => ({ f: `SUMIF(B2:B${fin},"Sous-total*",${c}2:${c}${fin})`, v: e(v), s: 'eurTotal' })), { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }]);
  return X.classeur([
    { nom: 'Résumé', colonnes: [22, 44, 11, 14, 14, 13, 14], lignes: R, figer: enTete },
    { nom: 'Détail des paiements', colonnes: [20, 34, 15, 11, 7, 14, 18, 32, 30, 13, 12, 12, 12, 12, 30, 22, 26, 16], lignes: D, figer: 1, filtre: true, filtreFin: fin }
  ]);
}

// ───────── Google Sheet de l'association ─────────
function pourSheet(M) {
  return { virement: { id: M.virement.id, date: M.virement.date, montant: M.virement.montant, ecart: M.totaux.ecart, statut: M.virement.statut || '' },
    paiements: M.lignes.map(l => ({ categorie: l.categorie, type: l.type, nature: l.genre, date: l.date + ' ' + l.heure, prenom: l.prenom, nom: l.nom, email: l.email, id: l.paiement, recu: l.recu, brut: l.brut, frais: l.frais, com: l.com, net: l.net, moyen: l.moyen, frequence: l.frequence, donateurType: l.donateurType })) };
}

function fichierBase(M) { return 'virement_' + new Date((M.virement.arrivee || M.virement.cree || 0) * 1000).toLocaleDateString('sv-SE', P) + '_' + (M.virement.montant / 100).toFixed(2).replace('.', '-') + 'EUR'; }
function sujet(M, marque = '') {
  const b = M.besoins.length, net = S(M.besoins.flatMap(g => g.L), 'net');
  return marque + 'Virement Stripe vers la banque : ' + eur(M.virement.montant) + ', arrivée le ' + new Date((M.virement.arrivee || 0) * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...P }) + (b ? ' (dont ' + (b === 1 ? 'cagnotte « ' + M.besoins[0].type + ' »' : b + ' cagnottes') + ' : ' + eur(net) + ' net)' : '') + (M.totaux.ecart ? ' — ÉCART À VÉRIFIER' : '');
}

module.exports = { modele, typeDon, cagnotteDe, resumeCorps, detailCorps, resumeTexte, tableur, pourSheet, fichierBase, sujet };
