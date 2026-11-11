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

// Une ligne par mouvement, pour le tableau, le CSV et le PDF. recus = reçus fiscaux déjà émis (pour retrouver le donateur et le numéro de reçu).
function lignes(mouvements, recus) {
  const out = [];
  for (const m of mouvements || []) {
    if (m.type === 'payout') continue;
    const src = m.source && typeof m.source === 'object' ? m.source : null;
    const cle = src ? [src.payment_intent, src.invoice, src.id].map(x => x && typeof x === 'object' ? x.id : x).find(k => k && recus && recus[k]) : null, r = cle ? recus[cle] : null;
    const genre = m.type === 'charge' || m.type === 'payment' ? 'Don' : /refund|reversal/.test(String(m.type)) ? 'Remboursement' : m.type === 'adjustment' ? 'Litige' : /fee/.test(String(m.type)) ? 'Frais Stripe' : 'Autre';
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0);
    out.push({ t: m.created || 0, genre, libelle: String((r && r.affectation) || m.description || '').replace(/\s+/g, ' ').trim().slice(0, 90), donateur: r ? String(r.nom || '').slice(0, 60) : '', recu: r ? String(r.numero || '') : '', brut: a, frais: f, net: m.net != null ? Math.round(Number(m.net)) : a - f, ref: m.id || '' });
  }
  return out.sort((x, y) => x.t - y.t);
}

function csvVirement(p, c, L) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"', n = v => (v / 100).toFixed(2).replace('.', ',');
  const rows = ['Date;Heure;Type;Libellé;Donateur;N° de reçu;Montant;Frais Stripe;Net;Référence Stripe'].concat(L.map(l => [jourCourt(l.t), heure(l.t), l.genre, q(l.libelle), q(l.donateur), q(l.recu), n(l.brut), n(l.frais), n(l.net), l.ref].join(';')));
  rows.push('', ';;;' + q('Total des dons') + ';;;' + n(c.brut), ';;;' + q('Frais Stripe') + ';;;;' + n(c.frais));
  if (c.rembourse) rows.push(';;;' + q('Dons remboursés') + ';;;' + n(c.rembourse));
  if (c.autres) rows.push(';;;' + q('Autres mouvements') + ';;;;;' + n(c.autres));
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

const TEAL = '#1f6a72', OR = '#a8842a', GRIS = '#6b7280', TRAIT = '#e5e7eb';
function tableauDons(L, max) {
  const vus = max ? L.slice(0, max) : L, th = 'padding:7px 4px;border-bottom:2px solid ' + TEAL + ';font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:' + GRIS + ';text-align:left', td = 'padding:7px 4px;border-bottom:1px solid ' + TRAIT + ';font-size:13px;vertical-align:top';
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><thead><tr><th style="${th}">Date</th><th style="${th}">Donateur · objet</th><th style="${th};text-align:right">Don</th><th style="${th};text-align:right">Frais</th><th style="${th};text-align:right">Net</th></tr></thead><tbody>` +
    vus.map(l => `<tr><td style="${td};white-space:nowrap">${esc(jourCourt(l.t))}<br><span style="color:${GRIS};font-size:11px">${esc(heure(l.t))}</span></td><td style="${td};overflow-wrap:anywhere;word-break:break-word">${l.genre === 'Don' ? '' : '<b style="color:#b45309;white-space:nowrap">' + esc(l.genre) + '</b><br>'}${l.donateur ? '<b>' + esc(l.donateur) + '</b><br>' : ''}<span style="color:#4b5563">${esc(l.libelle || '—')}</span>${l.recu ? '<br><span style="color:' + GRIS + ';font-size:11px">Reçu ' + esc(l.recu) + '</span>' : ''}</td><td style="${td};text-align:right;white-space:nowrap">${esc(signe(l.brut))}</td><td style="${td};text-align:right;white-space:nowrap;color:${GRIS}">${l.frais ? '− ' + esc(eur(l.frais)) : '—'}</td><td style="${td};text-align:right;white-space:nowrap;font-weight:bold">${esc(signe(l.net))}</td></tr>`).join('') +
    `</tbody></table>` + (max && L.length > max ? `<p style="margin:8px 0 0;font-size:12px;color:${GRIS}">… et ${L.length - max} autre(s) ligne(s) : le détail complet est dans les pièces jointes.</p>` : '');
}
function tableauCalcul(R) {
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + R.map(x => { const tot = x[2] === 'total'; return `<tr><td style="padding:9px 0;${tot ? 'border-top:2px solid ' + TEAL + ';font-weight:bold;font-size:15px' : 'border-bottom:1px solid ' + TRAIT + ';font-size:14px'}">${tot ? '= ' : ''}${esc(x[0])}</td><td style="padding:9px 0;text-align:right;white-space:nowrap;${tot ? 'border-top:2px solid ' + TEAL + ';font-weight:bold;font-size:18px;color:' + TEAL : 'border-bottom:1px solid ' + TRAIT + ';font-size:14px' + (x[2] === 'moins' ? ';color:#b45309' : '')}">${esc(x[1])}</td></tr>`; }).join('') + '</table>';
}

function mailVirement(p, c, { echec = false, test = false, exemple = false, lignes: L = [], pdf = true } = {}) {
  const b = p.destination && typeof p.destination === 'object' ? p.destination : null;
  const banque = b ? [b.bank_name, b.last4 ? '···· ' + b.last4 : ''].filter(Boolean).join(' ') : '';
  const marque = exemple ? '[EXEMPLE] ' : test ? '[TEST] ' : '';
  const arr = new Date(p.arrival_date * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', ...P });
  const subject = marque + (echec ? 'Virement Stripe REFUSÉ : ' + eur(p.amount) : 'Virement Stripe vers la banque : ' + eur(p.amount) + ', arrivée ' + arr);
  const avert = exemple ? "CECI EST UN EXEMPLE : aucun virement réel n'a eu lieu, les montants et les noms ci-dessous sont inventés. Vous recevrez un e-mail comme celui-ci à chaque virement de Stripe vers le compte bancaire de l'association." : test ? 'Compte Stripe de TEST : ce ne sont pas de vrais dons.' : '';
  const periode = L.length ? (jourCourt(L[0].t) === jourCourt(L[L.length - 1].t) ? 'du ' + jourCourt(L[0].t) : 'du ' + jourCourt(L[0].t) + ' au ' + jourCourt(L[L.length - 1].t)) : '';
  const R = !echec && c ? calcul(p, c) : [];
  const intro = echec
    ? "Stripe n'a pas pu verser cette somme sur le compte bancaire de l'association. L'argent n'est pas perdu : il reste sur le compte Stripe et sera reversé au prochain virement, une fois le problème réglé."
    : `Stripe vient d'envoyer ${eur(p.amount)} sur le compte bancaire de l'association. La somme devrait apparaître sur le relevé bancaire le ${jour(p.arrival_date)}.`;
  const explique = echec
    ? ['Motif indiqué par Stripe : ' + (p.failure_message || p.failure_code || 'non précisé') + '.', 'À faire : vérifier le RIB enregistré dans Stripe (Paramètres, Comptes bancaires), puis relancer le virement depuis Stripe ou attendre le suivant.']
    : [`Ce virement regroupe ${c && c.dons ? c.dons + ' don' + (c.dons > 1 ? 's' : '') + ' reçu' + (c.dons > 1 ? 's' : '') + ' en ligne' + (periode ? ' ' + periode : '') : 'les mouvements listés ci-dessous'}.`,
       'Stripe retient ses frais bancaires sur chaque don, puis verse le reste en une seule fois.',
       'Sur le relevé bancaire, la ligne porte le libellé « STRIPE » et le montant exact indiqué ici.'];
  // ---- texte brut
  const text = [avert || null, avert ? '' : null, intro, '', ...(R.length ? ['POURQUOI CE MONTANT', ...R.map(x => (x[2] === 'total' ? '= ' : '') + x[0] + ' : ' + x[1]), ''] : []), ...explique, '',
    ...(L.length && !echec ? ['DÉTAIL', ...L.map(l => `${jourCourt(l.t)} ${heure(l.t)} · ${l.genre}${l.donateur ? ' · ' + l.donateur : ''} · ${l.libelle || '—'}${l.recu ? ' · reçu ' + l.recu : ''} · ${signe(l.brut)} − frais ${eur(l.frais)} = ${signe(l.net)}`), ''] : []),
    banque ? 'Compte crédité : ' + banque : null, 'Lancé par Stripe le ' + jour(p.created), 'Référence du virement : ' + p.id, !echec ? 'Pièces jointes : le détail en CSV (tableur)' + (pdf ? ' et en PDF (à imprimer ou à classer).' : '.') : null].filter(x => x !== null).join('\n');
  // ---- corps commun (e-mail et PDF)
  const corps = (pourPdf) => `${avert ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fff9ea;border:1px solid #f5d48a;border-radius:8px;font-size:13px;color:#7a5a10"><b>${esc(avert.split(':')[0])}${avert.includes(':') ? ' :' : ''}</b>${esc(avert.includes(':') ? avert.slice(avert.indexOf(':') + 1) : '')}</p>` : ''}
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${echec ? '#b91c1c' : OR};font-weight:bold">${echec ? 'Virement refusé par la banque' : 'Virement vers la banque'}</p>
<p style="margin:0;font-size:${pourPdf ? 30 : 32}px;font-weight:bold;color:${echec ? '#b91c1c' : TEAL};line-height:1.1">${esc(eur(p.amount))}</p>
<p style="margin:10px 0 18px;font-size:15px;line-height:1.5;color:#1f2937">${esc(intro)}</p>
${R.length ? `<h3 style="margin:0 0 6px;font-size:15px;color:#111827">Pourquoi ce montant ?</h3>${tableauCalcul(R)}` : ''}
<div style="margin:16px 0;padding:12px 14px;background:#f3f8f8;border-radius:10px;font-size:13.5px;line-height:1.55;color:#374151">${explique.map(x => esc(x)).join('<br>')}</div>
${L.length && !echec ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#111827">Ce que contient ce virement</h3>${tableauDons(L, pourPdf ? 0 : 20)}` : ''}
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:18px;font-size:12.5px;color:${GRIS}">${[banque ? ['Compte crédité', banque] : null, ['Lancé par Stripe le', jour(p.created)], [echec ? 'Date prévue à l\'origine' : 'Arrivée prévue', jour(p.arrival_date)], ['Référence du virement', p.id]].filter(Boolean).map(x => `<tr><td style="padding:3px 0">${esc(x[0])}</td><td style="padding:3px 0;text-align:right">${esc(x[1])}</td></tr>`).join('')}</table>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:620px">${corps(false)}<p style="margin:16px 0 0;font-size:12px;color:${GRIS};line-height:1.5">${echec ? '' : 'En pièces jointes : le détail en CSV (à ouvrir dans un tableur)' + (pdf ? ' et le relevé en PDF (à imprimer ou à classer en comptabilité). ' : '. ')}Tous les montants sont lus dans Stripe, sans estimation.</p></div>`;
  const pdfHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm 15mm}html,body{background:#fff}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0}tr{page-break-inside:avoid}</style></head><body>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;border-bottom:3px solid ${TEAL}"><tr><td style="padding:0 0 10px;font-size:20px;font-weight:bold;color:${TEAL}">Émounatéha</td><td style="padding:0 0 10px;text-align:right;font-size:12px;color:${GRIS}">Relevé de virement Stripe<br>établi le ${esc(jourCourt(Math.floor(Date.now() / 1000)))}</td></tr></table>
${corps(true)}<p style="margin:18px 0 0;font-size:10.5px;color:${GRIS}">Document établi automatiquement à partir des mouvements enregistrés par Stripe. Montants en euros, sans estimation.</p></body></html>`;
  return { subject, text, html, pdfHtml, fichier: 'virement-stripe_' + new Date(p.arrival_date * 1000).toLocaleDateString('sv-SE', P) + '_' + (p.amount / 100).toFixed(2).replace('.', '-') + 'EUR' };
}

// Trois virements inventés, pour montrer à l'administrateur ce qu'il recevra (noms fictifs)
function exemples() {
  const n = Math.floor(Date.now() / 1000), J = 86400, b = { bank_name: 'BANQUE (exemple)', last4: '0000' };
  const m = (id, type, amount, fee, t, description) => ({ id, type, amount, fee, net: amount - fee, created: t, description, currency: 'eur' });
  const A = [m('txn_ex1', 'charge', 5200, 103, n - 4 * J, 'Colis de Chabbat'), m('txn_ex2', 'charge', 12600, 214, n - 4 * J + 5400, 'Là où le besoin est le plus grand'), m('txn_ex3', 'charge', 2600, 64, n - 3 * J, 'Besoin : Loyer en retard'), m('txn_ex4', 'charge', 25200, 403, n - 3 * J + 9000, "Un toit sur la tête (nuits d'hôtel)"), m('txn_ex5', 'charge', 1800, 52, n - 2 * J, 'Colis de Chabbat (don mensuel)'), m('txn_ex6', 'charge', 52600, 814, n - 2 * J + 3600, 'Besoin : Loyer en retard')];
  const B = [m('txn_ex7', 'charge', 10000, 175, n - 9 * J, "L'aide à la scolarité"), m('txn_ex8', 'charge', 3600, 79, n - 8 * J, 'Vêtements et soins'), m('txn_ex9', 'refund', -3600, 0, n - 8 * J + 7200, 'Remboursement : don saisi deux fois'), m('txn_ex10', 'charge', 7700, 141, n - 7 * J, 'Réinsertion sociale')];
  const R = { pi_1: { nom: 'Sarah L. (exemple)', numero: 'EX-0001' }, pi_2: { nom: 'David C. (exemple)', numero: 'EX-0002' }, pi_3: { nom: 'Anonyme (exemple)', numero: 'EX-0003' }, pi_4: { nom: 'Boulangerie B. SAS (exemple)', numero: 'EX-0004' }, pi_5: { nom: 'Myriam A. (exemple)', numero: 'EX-0005' }, pi_6: { nom: 'Yossef H. (exemple)', numero: 'EX-0006' }, pi_7: { nom: 'Rachel T. (exemple)', numero: 'EX-0007' }, pi_8: { nom: 'Moché Z. (exemple)', numero: 'EX-0008' }, pi_10: { nom: 'Esther K. (exemple)', numero: 'EX-0010' } };
  [...A, ...B].forEach(x => { const k = 'pi_' + x.id.replace('txn_ex', ''); if (R[k]) x.source = { id: 'ch_' + k, payment_intent: k }; });
  const somme = M => contenu(M).net;
  return [
    { p: { id: 'po_exemple_1', amount: somme(A), currency: 'eur', status: 'in_transit', created: n, arrival_date: n + 3 * J, destination: b }, mv: A, recus: R },
    { p: { id: 'po_exemple_2', amount: somme(B), currency: 'eur', status: 'in_transit', created: n - 5 * J, arrival_date: n - 2 * J, destination: b }, mv: B, recus: R },
    { p: { id: 'po_exemple_3', amount: 4800, currency: 'eur', status: 'failed', failure_message: 'Le compte bancaire est clôturé (exemple)', created: n - J, arrival_date: n + 2 * J, destination: b }, mv: [], recus: R, echec: true }
  ];
}

function monter(app, { stripe, adminOk, mailer, load, save, pdfTampon }) {
  // fabrique le message complet (corps + CSV + PDF) et l'envoie ; si le PDF ne peut pas être fabriqué, le mail part quand même avec le CSV
  async function envoyer(p, mv, recus, opt) {
    const echec = !!opt.echec, c = echec ? null : contenu(mv), L = echec ? [] : lignes(mv, recus);
    let pdf = null; const brouillon = mailVirement(p, c, { ...opt, lignes: L, pdf: true });
    if (!echec && pdfTampon) { try { pdf = await pdfTampon(brouillon.pdfHtml); } catch (e) { console.error('virements : PDF non fabriqué', e.message); } }
    const m = pdf ? brouillon : mailVirement(p, c, { ...opt, lignes: L, pdf: false }), pj = [];
    if (!echec) { pj.push({ name: m.fichier + '.csv', content: Buffer.from(csvVirement(p, c, L), 'utf8').toString('base64') }); if (pdf) pj.push({ name: m.fichier + '.pdf', content: Buffer.from(pdf).toString('base64') }); }
    const env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: m.subject, html: m.html, text: m.text, attachments: pj });
    return { mail: env && env.sent !== undefined ? env.sent : true, pdf: !!pdf, lignes: L.length };
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
      const vus = { ...(etat.vus || {}) }, envoyes = [], erreurs = [];
      for (const p of liste.slice().reverse()) {   // du plus ancien au plus récent
        const echec = ECHEC.has(p.status), avant = vus[p.id];
        if (p.currency && String(p.currency).toLowerCase() !== 'eur') { vus[p.id] = avant || 'vu'; continue; }
        if (avant === 'echec' || (avant === 'vu' && !echec)) continue;
        if (!avant && p.amount <= 0 && !echec) { vus[p.id] = 'vu'; continue; }   // régularisation négative : pas un virement reçu
        try {
          const mv = []; if (!echec) for await (const m of stripe.balanceTransactions.list({ payout: p.id, limit: 100, expand: ['data.source'] })) { mv.push(m); if (mv.length > 5000) break; }
          const r = await envoyer(p, mv, load().receipts || {}, { echec, test });
          vus[p.id] = echec ? 'echec' : 'vu'; envoyes.push({ id: p.id, montant: p.amount, echec, ...r });
        } catch (e) { erreurs.push(p.id + ' : ' + e.message); }   // pas noté comme vu : nouvel essai à la prochaine vérification
      }
      const garde = Object.fromEntries(Object.entries(vus).slice(-400));
      const d3 = load(); d3.virements = { ...(d3.virements || etat), vus: garde, verifieLe: new Date().toISOString() }; save(d3);
      if (erreurs.length) console.error('virements', erreurs.join(' | '));
      res.json({ ok: true, envoyes: envoyes.length, detail: envoyes, erreurs });
    } catch (e) { console.error('virements', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { contenu, lignes, csvVirement, calcul, mailVirement, exemples, monter };
