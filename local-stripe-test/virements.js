// Virements de Stripe vers la banque de l'association : à chaque virement, un e-mail à l'administrateur qui explique
// d'où vient la somme (dons regroupés, frais, remboursements), avec le détail en CSV et en PDF.
// LECTURE SEULE sur le compte Stripe : aucun virement n'est créé, modifié ni annulé ici ; on lit ceux que Stripe fait de lui-même.
//
// Le serveur du site appelle ce point d'entrée toutes les heures. Chaque virement donne lieu à un seul e-mail au moment où Stripe le lance,
// et à un second seulement si la banque le refuse. À la mise en service, les virements déjà existants sont notés comme vus, sans e-mail.
// Tous les montants viennent de Stripe (mouvements de solde rattachés au virement) : aucune estimation.

const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const signe = c => (c < 0 ? '− ' : '') + eur(Math.abs(c));
const P = { timeZone: 'Europe/Paris' };
const jour = t => new Date(t * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...P });
const jourCourt = t => new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...P });
const heure = t => new Date(t * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...P });
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ECHEC = new Set(['failed', 'canceled']);

// Ce que le virement regroupe, d'après les mouvements de solde que Stripe y rattache (montants réels, en centimes)
function contenu(mouvements) {
  let dons = 0, brut = 0, frais = 0, rembourse = 0, autres = 0;
  for (const m of mouvements || []) {
    if (m.type === 'payout') continue;
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0);
    if (m.type === 'charge' || m.type === 'payment') { dons++; brut += a; frais += f; }
    else if (/refund|reversal/.test(String(m.type))) { rembourse += a; frais += f; }
    else { autres += a - f; }
  }
  return { dons, brut, frais, rembourse, autres, net: brut - frais + rembourse + autres };
}

// Mini-cagnotte nominative (« besoin ») d'où vient un don : le reçu la garde (besoin = adresse, affectation « Besoin : <titre> ») ;
// à défaut de reçu, le libellé Stripe du paiement (« … — Besoin : <titre> (<adresse>) »). Dons généraux, actions, fêtes et campagnes : aucune.
function cagnotteDe(r, description) {
  if (r && r.besoin && /^Besoin : /.test(String(r.affectation || ''))) return String(r.affectation).slice(9).replace(/\s+/g, ' ').trim().slice(0, 80);
  const m = String(description || '').match(/(?:^|— )Besoin : (.+?)(?: \([a-z0-9-]{1,40}\))?\s*$/);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

// Ce que le virement contient pour chaque cagnotte (net = dons − frais Stripe − remboursements, comme la « somme à reverser » du CRM),
// et le reste du virement (dons généraux). Les deux additionnés font exactement le montant viré.
function parCagnotte(L, montantVire) {
  const M = new Map();
  for (const l of L || []) {
    if (!l.cagnotte) continue;
    const x = M.get(l.cagnotte) || { titre: l.cagnotte, dons: 0, brut: 0, frais: 0, net: 0 };
    if (l.genre === 'Don') x.dons++;
    x.brut += l.brut; x.frais += l.frais; x.net += l.net; M.set(l.cagnotte, x);
  }
  const cagnottes = [...M.values()].sort((a, b) => b.net - a.net || a.titre.localeCompare(b.titre)), total = cagnottes.reduce((a, x) => a + x.net, 0);
  return { cagnottes, total, general: Math.round(Number(montantVire) || 0) - total };
}

// Une ligne par mouvement, pour le tableau, le CSV et le PDF. recus = reçus fiscaux déjà émis (pour retrouver le donateur et le numéro de reçu).
function lignes(mouvements, recus) {
  const out = [];
  for (const m of mouvements || []) {
    if (m.type === 'payout') continue;
    const src = m.source && typeof m.source === 'object' ? m.source : null;
    const cle = src ? [src.payment_intent, src.invoice, src.id].map(x => x && typeof x === 'object' ? x.id : x).find(k => k && recus && recus[k]) : null, r = cle ? recus[cle] : null;
    const genre = m.type === 'charge' || m.type === 'payment' ? 'Don' : /refund|reversal/.test(String(m.type)) ? 'Remboursement' : m.type === 'adjustment' ? 'Litige' : /fee/.test(String(m.type)) ? 'Frais Stripe' : 'Autre';
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0);
    out.push({ t: m.created || 0, genre, libelle: String((r && r.affectation) || m.description || '').replace(/\s+/g, ' ').trim().slice(0, 90), donateur: r ? String(r.nom || '').slice(0, 60) : '', recu: r ? String(r.numero || '') : '', cagnotte: cagnotteDe(r, m.description), brut: a, frais: f, net: m.net != null ? Math.round(Number(m.net)) : a - f, ref: m.id || '' });
  }
  return out.sort((x, y) => x.t - y.t);
}

function csvVirement(p, c, L, prestataire = 0) {
  const q = s => { let t = String(s == null ? '' : s); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; }, n = v => (v / 100).toFixed(2).replace('.', ',');   // un texte qui commence par = + - @ serait lu comme une formule par le tableur : on le neutralise
  const rows = ['Date;Heure;Type;Libellé;Donateur;N° de reçu;Montant;Frais Stripe;Net;Référence Stripe;Cagnotte'].concat(L.map(l => [jourCourt(l.t), heure(l.t), l.genre, q(l.libelle), q(l.donateur), q(l.recu), n(l.brut), n(l.frais), n(l.net), l.ref, q(l.cagnotte || '')].join(';')));
  const pc = parCagnotte(L, p.amount);
  if (pc.cagnottes.length) { rows.push('', ';;;' + q('CAGNOTTES : SOMMES DUES DANS CE VIREMENT')); pc.cagnottes.forEach(x => rows.push(';;;' + q('Cagnotte « ' + x.titre + ' » (' + x.dons + ' don' + (x.dons > 1 ? 's' : '') + ')') + ';;;' + n(x.brut) + ';' + n(x.frais) + ';' + n(x.net))); rows.push(';;;' + q('Dons généraux (reste du virement)') + ';;;;;' + n(pc.general)); }
  rows.push('', ';;;' + q('Total des dons') + ';;;' + n(c.brut), ';;;' + q('Frais Stripe') + ';;;;' + n(c.frais));
  if (c.rembourse) rows.push(';;;' + q('Dons remboursés') + ';;;' + n(c.rembourse));
  if (c.autres) rows.push(';;;' + q('Autres mouvements') + ';;;;;' + n(c.autres));
  if (prestataire > 0) rows.push(';;;' + q('Frais prestataire (réglés à part)') + ';;;;' + n(prestataire));
  rows.push(';;;' + q('Montant viré à la banque') + ';;;;;' + n(p.amount), ';;;' + q('Arrivée prévue') + ';' + jourCourt(p.arrival_date), ';;;' + q('Référence du virement') + ';' + p.id);
  return '﻿' + rows.join('\r\n');
}

// Le calcul, ligne par ligne : « pourquoi j'ai reçu tant »
function calcul(p, c) {
  const R = [['Dons encaissés (' + c.dons + ')', eur(c.brut), '']];
  R.push(['Frais bancaires retenus par Stripe', '− ' + eur(c.frais), 'moins']);
  if (c.rembourse) R.push(['Dons remboursés à des donateurs', '− ' + eur(-c.rembourse), 'moins']);
  if (c.autres) R.push([c.autres < 0 ? 'Autres retenues de Stripe' : 'Autres crédits', signe(c.autres).replace(/^(?!−)/, '+ '), c.autres < 0 ? 'moins' : '']);
  if (c.net !== p.amount) R.push(['Solde reporté ou mouvement hors dons', signe(p.amount - c.net).replace(/^(?!−)/, '+ '), '']);
  R.push(['Viré sur le compte bancaire', eur(p.amount), 'total']);
  return R;
}

const G = require('./gabarit.js'), { TEAL, GRIS, TRAIT } = G, releve = require('./releve.js');
function tableauDons(L, max) {
  const vus = max ? L.slice(0, max) : L, th = 'padding:7px 4px;border-bottom:2px solid ' + TEAL + ';font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:' + GRIS + ';text-align:left', td = 'padding:7px 4px;border-bottom:1px solid ' + TRAIT + ';font-size:13px;vertical-align:top';
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">Date</th><th style="${th}">Donateur · objet</th><th style="${th};text-align:right">Don</th><th style="${th};text-align:right">Frais</th><th style="${th};text-align:right">Net</th></tr></thead><tbody>` +
    vus.map(l => `<tr><td style="${td};white-space:nowrap">${esc(jourCourt(l.t))}<br><span style="color:${GRIS};font-size:11px">${esc(heure(l.t))}</span></td><td style="${td};overflow-wrap:anywhere;word-break:break-word">${l.genre === 'Don' ? '' : '<b style="color:#b45309;white-space:nowrap">' + esc(l.genre) + '</b><br>'}${l.donateur ? '<b>' + esc(l.donateur) + '</b><br>' : ''}<span style="color:#4b5563">${esc(l.libelle || '—')}</span>${l.recu ? '<br><span style="color:' + GRIS + ';font-size:11px">Reçu ' + esc(l.recu) + '</span>' : ''}</td><td style="${td};text-align:right;white-space:nowrap">${esc(signe(l.brut))}</td><td style="${td};text-align:right;white-space:nowrap;color:${GRIS}">${l.frais ? '− ' + esc(eur(l.frais)) : '—'}</td><td style="${td};text-align:right;white-space:nowrap;font-weight:bold">${esc(signe(l.net))}</td></tr>`).join('') +
    `</tbody>${L.length > 1 ? `<tr><td colspan="2" style="padding:9px 4px;border-top:2px solid ${TEAL};font-weight:bold;font-size:13.5px">Total (${L.length} lignes)</td>` + [L.reduce((a, l) => a + l.brut, 0), -L.reduce((a, l) => a + l.frais, 0), L.reduce((a, l) => a + l.net, 0)].map((v, i) => `<td style="padding:9px 4px;border-top:2px solid ${TEAL};text-align:right;white-space:nowrap;font-weight:bold;font-size:13.5px${i === 2 ? ';color:' + TEAL : ''}">${esc(signe(v))}</td>`).join('') + '</tr>' : ''}</table>` + (max && L.length > max ? `<p style="margin:8px 0 0;font-size:12px;color:${GRIS}">… et ${L.length - max} autre(s) ligne(s) : le détail complet est dans les pièces jointes.</p>` : '');
}
function tableauCalcul(R) {
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + R.map(x => { const tot = x[2] === 'total'; return `<tr><td style="padding:9px 0;${tot ? 'border-top:2px solid ' + TEAL + ';font-weight:bold;font-size:15px' : 'border-bottom:1px solid ' + TRAIT + ';font-size:14px'}">${tot ? '= ' : ''}${esc(x[0])}</td><td style="padding:9px 0;text-align:right;white-space:nowrap;${tot ? 'border-top:2px solid ' + TEAL + ';font-weight:bold;font-size:18px;color:' + TEAL : 'border-bottom:1px solid ' + TRAIT + ';font-size:14px' + (x[2] === 'moins' ? ';color:#b45309' : '')}">${esc(x[1])}</td></tr>`; }).join('') + '</table>';
}

function mailVirement(p, c, { echec = false, test = false, exemple = false, lignes: L = [], pdf = true, prestataire = 0 } = {}) {
  const b = p.destination && typeof p.destination === 'object' ? p.destination : null;
  const banque = b ? [b.bank_name, b.last4 ? '···· ' + b.last4 : ''].filter(Boolean).join(' ') : '';
  const marque = exemple ? '[EXEMPLE] ' : test ? '[TEST] ' : '';
  const arr = new Date(p.arrival_date * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...P });
  const pc = echec ? { cagnottes: [] } : parCagnotte(L, p.amount), cag = pc.cagnottes.length > 0;   // cagnottes nominatives : ce que l'association leur doit
  const subject = marque + (echec ? 'Virement Stripe REFUSÉ : ' + eur(p.amount) : 'Virement Stripe vers la banque : ' + eur(p.amount) + ', arrivée ' + arr + (cag ? ' (dont ' + (pc.cagnottes.length === 1 ? 'cagnotte « ' + pc.cagnottes[0].titre + ' »' : pc.cagnottes.length + ' cagnottes') + ' : ' + eur(pc.total) + ')' : ''));
  const cagTexte = cag ? ['CAGNOTTES : CE QUE L\'ASSOCIATION LEUR DOIT', ...pc.cagnottes.map(x => `Cagnotte « ${x.titre} » : ${x.dons} don${x.dons > 1 ? 's' : ''}, ${signe(x.brut)} − frais Stripe ${eur(x.frais)} = ${signe(x.net)} dus`), `Dons généraux (reste du virement) : ${signe(pc.general)}`, '= Total du virement : ' + eur(p.amount), ''] : [];
  const tableauCag = () => { const td = 'padding:9px 4px;border-bottom:1px solid ' + TRAIT + ';font-size:14px', th = 'padding:7px 4px;border-bottom:2px solid ' + TEAL + ';font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:' + GRIS + ';text-align:right', tot = 'padding:9px 4px;border-top:2px solid ' + TEAL + ';font-weight:bold;font-size:15px';
    return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><thead><tr><th style="${th};text-align:left">Cagnotte</th><th style="${th}">Dons</th><th style="${th}">Frais Stripe</th><th style="${th}">Dû à la cagnotte</th></tr></thead><tbody>` +
      pc.cagnottes.map(x => `<tr><td style="${td};overflow-wrap:anywhere"><b>${esc(x.titre)}</b><br><span style="color:${GRIS};font-size:12px">${x.dons} don${x.dons > 1 ? 's' : ''}</span></td><td style="${td};text-align:right;white-space:nowrap">${esc(signe(x.brut))}</td><td style="${td};text-align:right;white-space:nowrap;color:${GRIS}">${x.frais ? '− ' + esc(eur(x.frais)) : '—'}</td><td style="${td};text-align:right;white-space:nowrap;font-weight:bold;color:${TEAL}">${esc(signe(x.net))}</td></tr>`).join('') +
      `<tr><td colspan="3" style="${td}">Dons généraux (reste du virement)</td><td style="${td};text-align:right;white-space:nowrap;font-weight:bold">${esc(signe(pc.general))}</td></tr>` +
      `<tr><td colspan="3" style="${tot}">= Total du virement</td><td style="${tot};text-align:right;white-space:nowrap">${esc(eur(p.amount))}</td></tr></tbody></table>` +
      `<p style="margin:8px 0 0;font-size:12.5px;color:${GRIS}">Somme due à chaque cagnotte : ses dons, moins les frais bancaires de Stripe (même calcul que la « somme à reverser » du CRM).</p>`; };
  const avert = exemple ? "CECI EST UN EXEMPLE : aucun virement réel n'a eu lieu, les montants et les noms ci-dessous sont inventés. Vous recevrez un e-mail comme celui-ci à chaque virement de Stripe vers le compte bancaire de l'association." : test ? 'Compte Stripe de TEST : ce ne sont pas de vrais dons.' : '';
  const periode = L.length ? (jourCourt(L[0].t) === jourCourt(L[L.length - 1].t) ? 'du ' + jourCourt(L[0].t) : 'du ' + jourCourt(L[0].t) + ' au ' + jourCourt(L[L.length - 1].t)) : '';
  const R = !echec && c ? calcul(p, c) : [];
  // frais du prestataire : réglés à part par carte le jour de l'arrivée du virement (ils ne sont pas retenus sur le virement lui-même)
  if (R.length && prestataire > 0) R.push(['Frais prestataire (réglés à part, par carte, le jour de l\'arrivée)', '− ' + eur(prestataire), 'moins'], ['Reste pour l\'association', eur(p.amount - prestataire), 'total']);
  const intro = echec
    ? "Stripe n'a pas pu verser cette somme sur le compte bancaire de l'association. L'argent n'est pas perdu : il reste sur le compte Stripe et sera reversé au prochain virement, une fois le problème réglé."
    : `Stripe vient d'envoyer ${eur(p.amount)} sur le compte bancaire de l'association. La somme devrait apparaître sur le relevé bancaire le ${jour(p.arrival_date)}.`;
  const explique = echec
    ? ['Motif indiqué par Stripe : ' + (p.failure_message || p.failure_code || 'non précisé') + '.', 'À faire : vérifier le RIB enregistré dans Stripe (Paramètres, Comptes bancaires), puis relancer le virement depuis Stripe ou attendre le suivant.']
    : [`Ce virement regroupe ${c && c.dons ? c.dons + ' don' + (c.dons > 1 ? 's' : '') + ' reçu' + (c.dons > 1 ? 's' : '') + ' en ligne' + (periode ? ' ' + periode : '') : 'les mouvements listés ci-dessous'}.`,
       'Stripe retient ses frais bancaires sur chaque don, puis verse le reste en une seule fois.',
       'Sur le relevé bancaire, la ligne porte le libellé « STRIPE » et le montant exact indiqué ici.'];
  // ---- texte brut
  const text = [avert || null, avert ? '' : null, intro, '', ...cagTexte, ...(R.length ? ['POURQUOI CE MONTANT', ...R.map(x => (x[2] === 'total' ? '= ' : '') + x[0] + ' : ' + x[1]), ''] : []), ...explique, '',
    ...(L.length && !echec ? ['DÉTAIL', ...L.map(l => `${jourCourt(l.t)} ${heure(l.t)} · ${l.genre}${l.donateur ? ' · ' + l.donateur : ''} · ${l.libelle || '—'}${l.recu ? ' · reçu ' + l.recu : ''} · ${signe(l.brut)} − frais ${eur(l.frais)} = ${signe(l.net)}`), ''] : []),
    banque ? 'Compte crédité : ' + banque : null, 'Lancé par Stripe le ' + jour(p.created), 'Référence du virement : ' + p.id, !echec ? 'Pièces jointes : le détail en CSV (tableur)' + (pdf ? ' et en PDF (à imprimer ou à classer).' : '.') : null].filter(x => x !== null).join('\n');
  // ---- corps commun (e-mail et PDF)
  const corps = (pourPdf) => G.bandeau({ titre: echec ? 'Virement refusé' : 'Avis de virement', sous: 'Relevé de virement Stripe · établi le ' + jourCourt(Math.floor(Date.now() / 1000)), pourPdf }) + G.avertissement(avert) +
    G.montant({ etiquette: echec ? 'Virement refusé par la banque' : 'Virement vers la banque de l\'association', valeur: eur(p.amount), etat: echec ? 'Somme non versée : elle reste sur le compte Stripe' : 'En route vers la banque', alerte: echec }) +
    (echec ? '' : G.reperes([{ l: 'Arrivée prévue', v: jour(p.arrival_date).replace(/^./, x => x.toUpperCase()), sous: 'sur le relevé bancaire' }, c && c.dons ? { l: 'Ce virement regroupe', v: c.dons + ' don' + (c.dons > 1 ? 's' : ''), sous: periode } : null, banque ? { l: 'Compte crédité', v: banque, sous: 'libellé « STRIPE »' } : null])) +
    `<p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#1f2937">${esc(intro)}</p>` +
    (cag ? G.partie(1, 'Cagnottes : ce que l\'association leur doit') + tableauCag() : '') +
    (R.length ? G.partie(cag ? 2 : 1, 'Pourquoi ce montant ?') + tableauCalcul(R) : '') +
    G.note(explique, echec ? 'Que faire ?' : 'À savoir') +
    (L.length && !echec ? G.partie(cag ? 3 : 2, 'Ce que contient ce virement') + tableauDons(L, pourPdf ? 0 : 20) : '') +
    G.references([banque ? ['Compte crédité', banque] : null, ['Lancé par Stripe le', jour(p.created)], [echec ? 'Date prévue à l\'origine' : 'Arrivée prévue', jour(p.arrival_date)], ['Référence du virement', p.id]]);
  const html = G.enMail(corps(false), (echec ? '' : 'En pièces jointes : le détail en CSV (à ouvrir dans un tableur)' + (pdf ? ' et le relevé en PDF (à imprimer ou à classer en comptabilité). ' : '. ')) + 'Tous les montants sont lus dans Stripe, sans estimation.');
  const pdfHtml = G.enPdf(corps(true));
  return { subject, text, html, pdfHtml, fichier: 'virement-stripe_' + new Date(p.arrival_date * 1000).toLocaleDateString('sv-SE', P) + '_' + (p.amount / 100).toFixed(2).replace('.', '-') + 'EUR' };
}

// Trois virements inventés, pour montrer à l'administrateur ce qu'il recevra (noms fictifs)
function exemples() {
  const n = Math.floor(Date.now() / 1000), J = 86400, b = { bank_name: 'BANQUE (exemple)', last4: '0000' };
  const m = (id, type, amount, fee, t, description) => ({ id, type, amount, fee, net: amount - fee, created: t, description, currency: 'eur' });
  const D = 'Don Émounatéha — ';
  const A = [m('txn_ex1', 'charge', 5200, 103, n - 4 * J, D + 'Colis de Chabbat'), m('txn_ex2', 'charge', 12600, 214, n - 4 * J + 5400, D + 'Là où le besoin est le plus grand'), m('txn_ex3', 'charge', 2600, 64, n - 3 * J, D + 'Besoin : Loyer en retard (loyer-en-retard)'), m('txn_ex4', 'charge', 25200, 403, n - 3 * J + 9000, D + 'Hanouka : Diffusion de la lumière, Beignets et cadeaux'), m('txn_ex5', 'charge', 1800, 52, n - 2 * J, 'Don mensuel Émounatéha — Colis de Chabbat'), m('txn_ex6', 'charge', 52600, 814, n - 2 * J + 3600, D + 'Besoin : Loyer en retard (loyer-en-retard)')];
  const B = [m('txn_ex7', 'charge', 10000, 175, n - 9 * J, D + "L'aide à la scolarité"), m('txn_ex8', 'charge', 3600, 79, n - 8 * J, D + 'Vêtements et soins'), m('txn_ex9', 'refund', -3600, 0, n - 8 * J + 7200, 'Remboursement : don saisi deux fois'), m('txn_ex10', 'charge', 7700, 141, n - 7 * J, D + 'Réinsertion sociale')];
  const R = { pi_1: { nom: 'Sarah L. (exemple)', numero: 'EX-0001' }, pi_2: { nom: 'David C. (exemple)', numero: 'EX-0002' }, pi_3: { nom: 'Anonyme (exemple)', numero: 'EX-0003' }, pi_4: { nom: 'Boulangerie B. SAS (exemple)', numero: 'EX-0004' }, pi_5: { nom: 'Myriam A. (exemple)', numero: 'EX-0005' }, pi_6: { nom: 'Yossef H. (exemple)', numero: 'EX-0006' }, pi_7: { nom: 'Rachel T. (exemple)', numero: 'EX-0007' }, pi_8: { nom: 'Moché Z. (exemple)', numero: 'EX-0008' }, pi_10: { nom: 'Esther K. (exemple)', numero: 'EX-0010' } };
  [...A, ...B].forEach(x => { const k = 'pi_' + x.id.replace('txn_ex', ''); if (R[k]) x.source = { id: 'ch_' + k, payment_intent: k }; });
  B[2].source = { id: 're_ex9', payment_intent: 'pi_8' };   // le remboursement se rattache au don qu'il annule
  const somme = M => contenu(M).net;
  return [
    { p: { id: 'po_exemple_1', amount: somme(A), currency: 'eur', status: 'in_transit', created: n, arrival_date: n + 3 * J, destination: b }, mv: A, recus: R },
    { p: { id: 'po_exemple_2', amount: somme(B), currency: 'eur', status: 'in_transit', created: n - 5 * J, arrival_date: n - 2 * J, destination: b }, mv: B, recus: R },
    { p: { id: 'po_exemple_3', amount: 4800, currency: 'eur', status: 'failed', failure_message: 'Le compte bancaire est clôturé (exemple)', created: n - J, arrival_date: n + 2 * J, destination: b }, mv: [], recus: R, echec: true }
  ];
}

// Stripe lance le virement dans la nuit (vers 2 h) et l'argent arrive en banque le jour même. L'e-mail part donc DÈS que le virement existe,
// pour arriver avant l'argent ; attendre 19 h le faisait arriver après (constaté le 20 nov 2026). Rien pendant Chabbat et les fêtes (chabbat.js).
// Le SMS suit l'e-mail, mais jamais la nuit : entre 7 h et 22 h (heure de Paris), sinon il attend 7 h. Un virement refusé reste signalé tout de suite.
//
// Prévenir LA VEILLE à 19 h (souhait de Yarone) : impossible avec le virement lui-même, qui n'existe pas encore chez Stripe à ce moment-là.
// On envoie donc une PRÉVISION, d'après ce que Stripe annonce (dons qu'il libère le lendemain + solde déjà disponible) : e-mail + SMS
// « virement prévu demain, environ X € », la veille à 19 h (vendredi : 3 h avant l'allumage ; samedi : 2 h après la sortie ; voir chabbat.js).
// Décision de Yarone, 20 nov 2026. Le lendemain, le relevé exact part par e-mail dès que Stripe lance le virement (sans second SMS),
// et l'écart entre la prévision et le montant réel est écrit dans les journaux.
const chabbat = require('./chabbat.js');
const smsVirement = p => 'Emounateha : virement de ' + eur(p.amount).replace(/[\u202f\u00a0]/g, ' ').replace('€', 'EUR') + ' en cours vers la banque, arrivee prevue le ' + new Date(p.arrival_date * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...P }) + '.';

const demainUtc = maintenant => { const j = chabbat.jourParis(maintenant + 86400000); return { jour: j, debut: Date.parse(j + 'T00:00:00Z') / 1000 }; };   // available_on de Stripe = minuit UTC du jour
async function prevision(stripe, maintenant = Date.now()) {   // LECTURE SEULE : ce que Stripe devrait virer demain
  const { jour: pour, debut } = demainUtc(maintenant);
  const solde = await stripe.balance.retrieve(), dispo = (solde.available || []).filter(x => String(x.currency).toLowerCase() === 'eur').reduce((a, x) => a + (x.amount || 0), 0);
  let libere = 0, mouvements = 0;
  for await (const m of stripe.balanceTransactions.list({ available_on: { gte: debut, lt: debut + 86400 }, limit: 100 })) {
    if (m.type === 'payout' || (m.currency && String(m.currency).toLowerCase() !== 'eur')) continue;
    libere += Math.round(Number(m.net) || 0); mouvements++; if (mouvements > 5000) break;
  }
  return { pour, montant: dispo + libere, dejaDisponible: dispo, libereDemain: libere, mouvements };
}

// L'annonce de la veille : courte, sans pièce jointe (le détail exact arrive avec le relevé du lendemain)
function mailPrevision(pv, { test = false } = {}) {
  const t = Date.parse(pv.pour + 'T12:00:00Z') / 1000, quand = jour(t), environ = 'environ ' + eur(pv.montant);
  const subject = (test ? '[TEST] ' : '') + 'Virement prévu demain : ' + environ;
  const intro = `Stripe prépare un virement vers le compte bancaire de l'association. Il devrait arriver demain, ${quand}, pour un montant d'${environ}.`;
  const explique = ['Ce montant est une prévision : il correspond aux dons que Stripe libère demain, frais bancaires déjà déduits.', 'Le montant exact peut différer de quelques euros (remboursement ou don de dernière minute).', 'Demain, dès que Stripe lance le virement, vous recevez le relevé exact, avec le détail des dons en PDF.'];
  const text = [test ? 'Compte Stripe de TEST : ce ne sont pas de vrais dons.' : null, intro, '', ...explique].filter(x => x !== null).join('\n');
  const html = G.enMail(G.bandeau({ titre: 'Virement à venir', sous: 'Prévision · établie le ' + jourCourt(Math.floor(Date.now() / 1000)) }) + G.avertissement(test ? 'Compte Stripe de TEST : ce ne sont pas de vrais dons.' : '') +
    G.montant({ etiquette: 'Virement prévu demain', valeur: environ, etat: 'Arrivée prévue le ' + quand }) + `<p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#1f2937">${esc(intro)}</p>` + G.note(explique, 'À savoir'), 'Montant lu dans Stripe la veille du virement. Le relevé exact suit.');
  const sms = 'Emounateha : virement d\'' + environ.replace(/[\u202f\u00a0]/g, ' ').replace('€', 'EUR') + ' prevu demain ' + new Date(t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...P }) + ' sur le compte bancaire. Releve exact par e-mail.';
  return { subject, text, html, sms };
}

// Le relevé d'un virement, avec les frais 7 % réels du prestataire (même calcul que sa facture)
function modeleDe(p, mv, recus) {
  let commission = null, taux = 7; try { const C = require('./commission'); taux = C.TAUX; commission = C.ligneVirement(p, mv, C.TAUX, recus).commission || 0; } catch (e) { console.error('virements : frais prestataire non calculés', e.message); }
  return releve.modele(p, mv, recus, { taux, commission });
}

// Google Sheet de l'association (script tools/google-sheet-virements.gs) : une écriture par virement, jamais deux (le script repère la référence po_…).
// Inactif tant que GOOGLE_SHEET_URL et GOOGLE_SHEET_SECRET ne sont pas réglés ; compte Stripe de test : seulement si GOOGLE_SHEET_TEST=oui.
const sheetActif = test => !!(process.env.GOOGLE_SHEET_URL && process.env.GOOGLE_SHEET_SECRET) && (!test || process.env.GOOGLE_SHEET_TEST === 'oui');
async function posterSheet(corps) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(process.env.GOOGLE_SHEET_URL || '')) throw new Error('adresse du Google Sheet invalide');
  const r = await fetch(process.env.GOOGLE_SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: process.env.GOOGLE_SHEET_SECRET, ...corps }), redirect: 'follow', signal: AbortSignal.timeout(25000) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!j || j.ok !== true) throw new Error('Google Sheet : ' + ((j && j.error) || 'réponse HTTP ' + r.status));
  return j;
}

function monter(app, { stripe, adminOk, mailer, load, save, pdfTampon, sheetPost = posterSheet, peutEnvoyer = () => chabbat.pasChabbat(), heureVeille = () => chabbat.peutEnvoyer(), peutSms = (t = Date.now()) => { const h = chabbat.heureParis(t); return h >= 7 && h < 22; }, adminSms = () => process.env.ADMIN_SMS || '0669670770' }) {
  const sms = async p => { try { const sm = await mailer.sendSms({ to: adminSms(), text: smsVirement(p), tag: 'virement' }); if (!(sm && sm.sent)) console.error('virements SMS non envoyé', (sm && sm.reason) || ''); return !!(sm && sm.sent === true); } catch (e) { console.error('virements SMS', e.message); return false; } };
  // fabrique le message complet et l'envoie. Virement reçu : relevé résumé (PDF), relevé détaillé paiement par paiement (PDF, paysage)
  // et tableur Excel (format voulu par Yarone, 23 nov 2026 ; voir releve.js). Si un PDF ne peut pas être fabriqué, le mail part quand même.
  // Virement refusé : simple alerte, sans pièce jointe.
  async function envoyer(p, mv, recus, opt) {
    const echec = !!opt.echec;
    if (echec) { const m = mailVirement(p, null, { ...opt, pdf: false }); const env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: m.subject, html: m.html, text: m.text, attachments: [] }); return { mail: !!(env && env.sent === true), pdf: false, lignes: 0 }; }
    const M = modeleDe(p, mv, recus), commission = M.totaux.com, marque = opt.exemple ? '[EXEMPLE] ' : opt.test ? '[TEST] ' : '';
    const avert = opt.exemple ? "EXEMPLE : aucun virement réel n'a eu lieu, les montants et les noms sont inventés." : opt.test ? 'Compte Stripe de TEST : ce ne sont pas de vrais dons.' : '';
    const base = releve.fichierBase(M), pj = [];
    const fabriquer = async (nom, html, o) => { if (!pdfTampon) return false; try { pj.push({ name: base + nom + '.pdf', content: Buffer.from(await pdfTampon(html, o)).toString('base64') }); return true; } catch (e) { console.error('virements : PDF ' + nom + ' non fabriqué', e.message); return false; } };
    const pdf1 = await fabriquer('_1-resume', G.enPdf(releve.resumeCorps(M, { pourPdf: true, avert })));
    const pdf2 = await fabriquer('_2-detail', G.enPdf(releve.detailCorps(M, { avert })).replace('size:A4', 'size:A4 landscape'), { landscape: true });
    try { pj.push({ name: base + '_3-tableur.xlsx', content: releve.tableur(M, { avert }).toString('base64') }); } catch (e) { console.error('virements : tableur non fabriqué', e.message); pj.push({ name: base + '.csv', content: Buffer.from(csvVirement(p, contenu(mv), lignes(mv, recus), commission || 0), 'utf8').toString('base64') }); }
    const pied = 'En pièces jointes : le relevé résumé (PDF), le relevé détaillé avec chaque paiement et son ID Stripe (PDF) et le tableur Excel. Tous les montants sont lus dans Stripe, sans estimation.';
    const env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: releve.sujet(M, marque), html: G.enMail(releve.resumeCorps(M, { avert }), pied), text: releve.resumeTexte(M, avert), attachments: pj });
    if (M.totaux.ecart) console.error('virements : écart entre les paiements et le montant viré', JSON.stringify({ id: p.id, montant: p.amount, lignes: M.totaux.sommeStripe, ecart: M.totaux.ecart }));
    return { mail: !!(env && env.sent === true), pdf: pdf1 && pdf2, lignes: M.lignes.length, ecart: M.totaux.ecart, M };
  }

  app.post('/api/admin/virements/verifier', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      if (req.body && req.body.exemple) {   // e-mails d'exemple : montants et noms inventés, rien n'est lu dans Stripe ni noté
        const out = []; for (const x of exemples()) out.push(await envoyer(x.p, x.mv, x.recus, { exemple: true, echec: !!x.echec }));
        return res.json({ ok: true, exemple: true, envoye: out.every(o => o.mail), nombre: out.length, pdf: out.filter(o => o.pdf).length });
      }
      const test = !/^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), d = load(), etat = d.virements || null;
      const liste = (await stripe.payouts.list({ limit: 30, expand: ['data.destination'] })).data || [];
      if (!etat) {   // mise en service : on part de maintenant, sans e-mail pour le passé
        const d2 = load(); d2.virements = { depuis: new Date().toISOString(), vus: Object.fromEntries(liste.map(p => [p.id, ECHEC.has(p.status) ? 'echec' : 'vu'])) }; save(d2);
        return res.json({ ok: true, miseEnService: true, dejaExistants: liste.length, envoyes: 0 });
      }
      const vus = { ...(etat.vus || {}) }, envoyes = [], erreurs = [], ouvert = await peutEnvoyer(), cacheMv = new Map();
      const mouvements = async id => { if (!cacheMv.has(id)) { const mv = []; for await (const m of stripe.balanceTransactions.list({ payout: id, limit: 100, expand: ['data.source'] })) { mv.push(m); if (mv.length > 5000) break; } cacheMv.set(id, mv); } return cacheMv.get(id); };
      let smsAttente = { ...(etat.smsAttente || {}) }, previsions = { ...(etat.previsions || {}) };
      // annonce de la veille : une fois par jour d'arrivée, seulement si Stripe a quelque chose à virer ; une panne ici ne bloque jamais le relevé
      try {
        if (stripe.balance && await heureVeille()) {
          const pour = demainUtc(Date.now()).jour;
          if (!previsions[pour]) {
            const pv = await prevision(stripe), note = { montant: pv.montant, le: new Date().toISOString(), annonce: false };
            if (pv.montant > 0) {
              const m = mailPrevision(pv, { test }), env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: m.subject, html: m.html, text: m.text });
              if (!(env && env.sent === true)) throw new Error('e-mail de prévision non envoyé');   // pas noté : nouvel essai à la prochaine vérification
              note.annonce = true; envoyes.push({ prevision: pour, montant: pv.montant, mail: true });
              if (!test && mailer.sendSms) { try { const sm = await mailer.sendSms({ to: adminSms(), text: m.sms, tag: 'virement' }); envoyes[envoyes.length - 1].sms = !!(sm && sm.sent === true); } catch (e) { envoyes[envoyes.length - 1].sms = false; console.error('virements SMS prévision', e.message); } }
            }
            previsions[pour] = note; console.log('virements prévision', JSON.stringify({ ...pv, annonce: note.annonce }));
          }
        }
      } catch (e) { console.error('virements prévision', e.message); }
      // SMS restés en attente (virement lancé la nuit) : envoyés dès 7 h, hors Chabbat
      if (!test && mailer.sendSms && ouvert && peutSms()) for (const id of Object.keys(smsAttente)) { const a = smsAttente[id]; delete smsAttente[id]; envoyes.push({ id, montant: a.amount, smsSeul: true, sms: await sms(a) }); }
      for (const p of liste.slice().reverse()) {   // du plus ancien au plus récent
        const echec = ECHEC.has(p.status), avant = vus[p.id];
        if (p.currency && String(p.currency).toLowerCase() !== 'eur') { vus[p.id] = avant || 'vu'; continue; }
        if (avant === 'echec' || (avant === 'vu' && !echec)) continue;
        if (!avant && p.amount <= 0 && !echec) { vus[p.id] = 'vu'; continue; }   // régularisation négative : pas un virement reçu
        if (!echec && !ouvert) continue;   // Chabbat ou fête : on attend, pas noté comme vu, repris à une vérification suivante (2 h après la sortie)
        try {
          const mv = echec ? [] : await mouvements(p.id);
          const { M, ...r } = await envoyer(p, mv, load().receipts || {}, { echec, test });
          if (r.mail !== true) throw new Error('e-mail non envoyé');   // pas noté comme vu : nouvel essai à la prochaine vérification
          vus[p.id] = echec ? 'echec' : 'vu'; envoyes.push({ id: p.id, montant: p.amount, echec, ...r });
          const jr = chabbat.jourParis(p.arrival_date * 1000), dejaAnnonce = !!(previsions[jr] && previsions[jr].annonce);   // SMS déjà reçu la veille : pas de second SMS
          if (!echec) { const pv = previsions[jr]; if (pv && !pv.reel) { pv.reel = p.amount; console.log('virements prévision comparée au réel', JSON.stringify({ arrivee: jr, prevu: pv.montant, reel: p.amount, ecart: p.amount - pv.montant })); } }
          if (!echec && !test && mailer.sendSms && !dejaAnnonce) {   // pas d'annonce la veille : SMS après l'e-mail, jamais la nuit ; un SMS raté ne renvoie pas l'e-mail (virement déjà noté comme vu)
            if (peutSms()) envoyes[envoyes.length - 1].sms = await sms(p);
            else { smsAttente[p.id] = { amount: p.amount, arrival_date: p.arrival_date }; envoyes[envoyes.length - 1].sms = 'à 7 h'; }
          }
        } catch (e) { erreurs.push(p.id + ' : ' + e.message); }   // pas noté comme vu : nouvel essai à la prochaine vérification
      }
      // Google Sheet : chaque virement reçu y est écrit une fois ; 5 au plus par vérification (toutes les heures), les plus anciens d'abord.
      // Une panne n'empêche rien d'autre : nouvel essai à la vérification suivante.
      let sheet = { ...(etat.sheet || {}) };
      // Rattrapage : TOUS les virements déjà arrivés à la banque (pas seulement les 30 derniers), demande de Yarone du 23 nov 2026.
      if (sheetActif(test)) {
        let n = 0, tous = liste;
        try { const L = stripe.payouts.list({ limit: 100 }); if (L && L[Symbol.asyncIterator]) { tous = []; for await (const p of L) { tous.push(p); if (tous.length >= 500) break; } } } catch (e) { erreurs.push('liste complète des virements : ' + e.message); }
        // sheet[id] = dernier statut Stripe écrit dans le Sheet ; quand le virement arrive en banque (ou est refusé), le statut y est mis à jour
        for (const p of tous.slice().reverse()) {
          if (n >= 5) break;
          if (p.currency && String(p.currency).toLowerCase() !== 'eur') continue;
          const ecrit = sheet[p.id];
          if (ecrit) {
            if (ecrit === p.status || !['paid', 'failed', 'canceled'].includes(p.status)) continue;
            n++;
            try { await sheetPost({ action: 'statut', virement: { id: p.id, statut: p.status } }); sheet[p.id] = p.status; envoyes.push({ id: p.id, sheet: 'statut ' + p.status }); }
            catch (e) { erreurs.push(p.id + ' (Google Sheet, statut) : ' + e.message); }
            continue;
          }
          if (ECHEC.has(p.status) || !(vus[p.id] === 'vu' || p.status === 'paid') || !(p.amount > 0)) continue;
          n++;
          try { const M = modeleDe(p, await mouvements(p.id), load().receipts || {}); await sheetPost(releve.pourSheet(M)); sheet[p.id] = p.status || 'ecrit'; envoyes.push({ id: p.id, sheet: 'écrit', lignes: M.lignes.length }); }
          catch (e) { erreurs.push(p.id + ' (Google Sheet) : ' + e.message); }
        }
      }
      sheet = Object.fromEntries(Object.entries(sheet).slice(-1000));
      const garde = Object.fromEntries(Object.entries(vus).slice(-400));
      // enregistré seulement si la liste des virements vus a changé (sinon tout le fichier était réécrit en base chaque heure pour rien)
      previsions = Object.fromEntries(Object.entries(previsions).sort().slice(-40));
      const d3 = load(), av = d3.virements || {}, cle = x => JSON.stringify([x.vus || null, x.smsAttente || {}, x.previsions || {}, x.sheet || {}]);
      if (cle(av) !== cle({ vus: garde, smsAttente, previsions, sheet })) { d3.virements = { ...(d3.virements || etat), vus: garde, smsAttente, previsions, sheet, verifieLe: new Date().toISOString() }; save(d3); }
      if (erreurs.length) console.error('virements', erreurs.join(' | '));
      res.json({ ok: true, envoyes: envoyes.length, detail: envoyes, erreurs });
    } catch (e) { console.error('virements', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { contenu, lignes, cagnotteDe, parCagnotte, modeleDe, sheetActif, csvVirement, calcul, mailVirement, mailPrevision, exemples, prevision, monter };
