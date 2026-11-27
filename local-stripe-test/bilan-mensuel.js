// BILAN MENSUEL DU PRESTATAIRE (pour sa déclaration URSSAF) — demandé par Yarone le 27 nov 2026.
// Le 1er de chaque mois, un e-mail au prestataire (COMMISSION_EMAIL) avec un PDF et un CSV du mois écoulé :
//   - les factures de commission PAYÉES dans le mois (= commissions reçues, ce qui se déclare) ;
//   - pour chaque don couvert par ces factures : date, donateur, objet, montant, frais Stripe, net, règle appliquée, commission ;
//   - dons généraux d'un côté (7 %), cagnottes (besoins) de l'autre (moitié de ce qui reste après les 88 % de la personne et les frais Stripe) ;
//   - trop-perçu rendu à l'association (déduit des factures) ; TOTAL DES COMMISSIONS REÇUES.
// Lecture seule sur les deux comptes Stripe : rien n'est créé, payé ou viré.
const C = require('./commission.js'), R = require('./releve.js'), G = require('./gabarit.js'), { TEAL, GRIS, esc } = G;
const ENTREES = new Set(['charge', 'payment']), SORTIES = new Set(['refund', 'payment_refund', 'payment_failure_refund', 'refund_failure', 'payment_reversal']), LITIGES = new Set(['adjustment']);
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const S = (L, k) => L.reduce((a, l) => a + (Number(l[k]) || 0), 0);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisLong = m => MOIS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const jour = t => new Date(t * 1000).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const parisMois = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 7);
const moisPrecedent = m => { const [a, n] = m.split('-').map(Number); return n === 1 ? (a - 1) + '-12' : a + '-' + String(n - 1).padStart(2, '0'); };
const moisSuivant = m => { const [a, n] = m.split('-').map(Number); return n === 12 ? (a + 1) + '-01' : a + '-' + String(n + 1).padStart(2, '0'); };
const bornes = m => ({ du: Math.floor(C.minuitParis(m + '-01') / 1000), au: Math.floor(C.minuitParis(moisSuivant(m) + '-01') / 1000) });

// répartit un total (centimes) au prorata du net Stripe des lignes, au centime près
function repartir(L, total) {
  const base = S(L, 'netStripe'); L.forEach(l => { l.com = 0; }); if (!total || !base) return;
  const parts = L.map(l => { const v = total * l.netStripe / base; return { l, e: Math.trunc(v), r: v - Math.trunc(v) }; });
  let reste = total - parts.reduce((a, x) => a + x.e, 0); parts.sort((x, y) => (reste > 0 ? y.r - x.r : x.r - y.r));
  for (let i = 0; reste !== 0 && parts.length; i = (i + 1) % parts.length) { parts[i].e += Math.sign(reste); reste -= Math.sign(reste); }
  parts.forEach(x => { x.l.com = x.e; });
}

async function bilan({ stripe, stripe2, recus = {}, mois }) {
  const { du, au } = bornes(mois), factures = [];
  for await (const f of stripe2.invoices.list({ customer: C.CLIENT, status: 'paid', limit: 100 })) {
    const paye = Number((f.status_transitions && f.status_transitions.paid_at) || 0);
    if (f.metadata && f.metadata.commission === '1' && paye >= du && paye < au) factures.push({ ...f, paye });
  }
  factures.sort((a, b) => a.paye - b.paye);
  const general = [], besoins = [], recap = [];
  for (const f of factures) {
    const ids = []; for (const [k, v] of Object.entries(f.metadata || {})) if (/^v\d+$/.test(k)) String(v).split(',').forEach(x => x && ids.push(x));
    const ancienne = Number(f.created || 0) < C.AVOIR_AVANT;   // facture faite avant la règle des cagnottes : 7 % sur tout
    let comCalc = 0;
    for (const id of ids) {
      const p = await stripe.payouts.retrieve(id), mv = [];
      for await (const m of stripe.balanceTransactions.list({ payout: id, limit: 100, expand: ['data.source'] })) mv.push(m);
      const M = R.modele(p, mv, recus, { taux: C.TAUX, commission: ancienne ? null : C.ligneVirement(p, mv, C.TAUX, recus).commission });
      const base = M.lignes.filter(l => l.categorie !== 'autre');
      if (ancienne) repartir(base, Math.round(S(base, 'netStripe') * C.TAUX / 100));
      for (const l of base) {
        const x = { facture: f.number || f.id, virement: id, date: l.date + ' ' + l.heure, donateur: [l.prenom, l.nom].filter(Boolean).join(' ') || '—', email: l.email, objet: l.type, nature: l.genre, paiement: l.paiement, recu: l.recu,
          brut: l.brut, frais: l.frais, net: l.netStripe, com: l.com, regle: ancienne ? C.TAUX + ' % (règle d\'avant le 26/11/2026)' : l.categorie === 'besoin' ? 'moitié du reste' : C.TAUX + ' %', personne: l.categorie === 'besoin' && !ancienne ? l.reverser : null };
        (l.categorie === 'besoin' ? besoins : general).push(x); comCalc += l.com;
      }
    }
    const avoir = Number((f.metadata && f.metadata.avoir) || 0), recu = Number(f.amount_paid != null ? f.amount_paid : f.total) || 0;
    recap.push({ numero: f.number || f.id, paye: f.paye, virements: ids.length, commission: comCalc, avoir, recu, ecart: recu - (comCalc - avoir) });
  }
  const T = { general: S(general, 'com'), besoins: S(besoins, 'com'), avoir: S(recap, 'avoir'), recu: S(recap, 'recu') };
  T.ecart = T.recu - (T.general + T.besoins - T.avoir);
  return { mois, factures: recap, general, besoins, T };
}

// ───────── PDF / e-mail ─────────
const th = 'padding:6px 4px;border-bottom:2px solid ' + TEAL + ';font-size:9px;text-transform:uppercase;letter-spacing:.03em;color:' + GRIS + ';text-align:right';
const td = 'padding:5px 4px;border-bottom:1px solid #e5e7eb;font-size:10.5px;text-align:right;white-space:nowrap';
function tableDons(L, besoin) {
  if (!L.length) return '<p style="font-size:13px;color:' + GRIS + '">Aucun don ce mois-ci.</p>';
  const groupes = new Map(); for (const l of L) { if (!groupes.has(l.objet)) groupes.set(l.objet, []); groupes.get(l.objet).push(l); }
  let h = '';
  for (const [objet, G2] of groupes) {
    h += `<p style="margin:12px 0 4px;font-size:13px;font-weight:bold;color:${TEAL}">${besoin ? 'Cagnotte « ' + esc(objet) + ' »' : esc(objet)} <span style="font-weight:normal;color:${GRIS};font-size:11px">· ${G2.length} ligne${G2.length > 1 ? 's' : ''} · commission ${eur(S(G2, 'com'))}</span></p>` +
      `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tr><th style="${th};text-align:left;width:12%">Date</th><th style="${th};text-align:left;width:17%">Donateur</th><th style="${th};text-align:left;width:14%">ID de paiement Stripe</th><th style="${th}">Don</th><th style="${th}">Frais Stripe</th><th style="${th}">Net</th>${besoin ? `<th style="${th}">Pour la personne</th>` : ''}<th style="${th};text-align:left">Règle</th><th style="${th}">Commission</th></tr>` +
      G2.map(l => `<tr><td style="${td};text-align:left">${esc(l.date)}</td><td style="${td};text-align:left;white-space:normal">${l.nature !== 'Don' ? '<b style="color:#b45309">' + esc(l.nature) + '</b> · ' : ''}${esc(l.donateur)}${l.recu ? '<br><span style="color:' + GRIS + ';font-size:9px">reçu ' + esc(l.recu) + '</span>' : ''}</td><td style="${td};text-align:left;white-space:normal;overflow-wrap:anywhere;font-family:Menlo,monospace;font-size:9px">${esc(l.paiement)}</td><td style="${td}">${eur(l.brut)}</td><td style="${td};color:#b45309">− ${eur(l.frais)}</td><td style="${td}">${eur(l.net)}</td>${besoin ? `<td style="${td}">${l.personne == null ? '—' : eur(l.personne)}</td>` : ''}<td style="${td};text-align:left;white-space:normal;font-size:9.5px">${esc(l.regle)}</td><td style="${td};font-weight:bold;color:${TEAL}">${eur(l.com)}</td></tr>`).join('') +
      `<tr><td colspan="3" style="padding:6px 4px;border-top:2px solid ${TEAL};font-weight:bold;font-size:11px">Sous-total ${esc(objet)}</td><td style="${td};border-top:2px solid ${TEAL};font-weight:bold">${eur(S(G2, 'brut'))}</td><td style="${td};border-top:2px solid ${TEAL};font-weight:bold">− ${eur(S(G2, 'frais'))}</td><td style="${td};border-top:2px solid ${TEAL};font-weight:bold">${eur(S(G2, 'net'))}</td>${besoin ? `<td style="${td};border-top:2px solid ${TEAL};font-weight:bold">${eur(S(G2.filter(l => l.personne != null), 'personne'))}</td>` : ''}<td style="border-top:2px solid ${TEAL}"></td><td style="${td};border-top:2px solid ${TEAL};font-weight:bold;color:${TEAL}">${eur(S(G2, 'com'))}</td></tr></table>`;
  }
  return h;
}
function corps(b, pourPdf) {
  const T = b.T, f = b.factures, ligne = (l, v, gras) => `<tr><td style="padding:8px 14px 0;font-size:14px${gras ? ';font-weight:bold' : ''}">${l}</td><td style="padding:8px 14px 0;text-align:right;font-size:14px;white-space:nowrap${gras ? ';font-weight:bold' : ''}">${v}</td></tr>`;
  return G.bandeau({ titre: 'Bilan des commissions — ' + moisLong(b.mois), sous: 'Prestataire technique · pour la déclaration URSSAF', pourPdf }) +
    G.montant({ etiquette: 'Total des commissions reçues en ' + moisLong(b.mois), valeur: eur(T.recu), etat: f.length + ' facture' + (f.length > 1 ? 's' : '') + ' payée' + (f.length > 1 ? 's' : '') + ' par carte dans le mois' }) +
    G.reperes([{ l: 'Dons généraux', v: eur(T.general), sous: S(b.general.filter(l => l.nature === 'Don'), 'brut') ? 'sur ' + eur(S(b.general, 'brut')) + ' de dons' : '' }, { l: 'Cagnottes (besoins)', v: eur(T.besoins), sous: S(b.besoins, 'brut') ? 'sur ' + eur(S(b.besoins, 'brut')) + ' de dons' : '' }, { l: 'Trop-perçu rendu', v: T.avoir ? '− ' + eur(T.avoir) : '0,00 €', sous: 'déduit des factures' }]) +
    `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0 0;background:#f3f7f7;border-radius:10px">${ligne('Commissions sur les dons généraux (' + C.TAUX + ' %)', eur(T.general))}${ligne('Commissions sur les cagnottes (moitié de ce qui reste après les 88 % de la personne et les frais Stripe)', eur(T.besoins))}${T.avoir ? ligne('− Trop-perçu rendu à l\'association', '− ' + eur(T.avoir)) : ''}` +
    `<tr><td style="padding:12px 14px;font-weight:bold;font-size:16px;border-top:2px solid ${TEAL}">= TOTAL DES COMMISSIONS REÇUES</td><td style="padding:12px 14px;text-align:right;font-weight:bold;font-size:20px;color:${TEAL};border-top:2px solid ${TEAL};white-space:nowrap">${eur(T.recu)}</td></tr></table>` +
    (T.ecart ? `<p style="margin:12px 0 0;padding:10px;background:#fdecec;border:1px solid #f5b5b5;border-radius:8px;font-size:13px;color:#991b1b"><b>À vérifier :</b> le détail des dons donne ${eur(T.general + T.besoins - T.avoir)}, les factures payées ${eur(T.recu)} (écart ${eur(T.ecart)}). Le montant à déclarer est celui des factures payées.</p>` : '') +
    G.partie(1, 'Factures payées dans le mois') +
    (f.length ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><th style="${th};text-align:left">Facture</th><th style="${th};text-align:left">Payée le</th><th style="${th}">Virements</th><th style="${th}">Commission</th><th style="${th}">Trop-perçu rendu</th><th style="${th}">Reçu</th></tr>` +
      f.map(x => `<tr><td style="${td};text-align:left">${esc(x.numero)}</td><td style="${td};text-align:left">${jour(x.paye)}</td><td style="${td}">${x.virements}</td><td style="${td}">${eur(x.commission)}</td><td style="${td}">${x.avoir ? '− ' + eur(x.avoir) : '—'}</td><td style="${td};font-weight:bold;color:${TEAL}">${eur(x.recu)}</td></tr>`).join('') + '</table>' : '<p style="font-size:13px;color:' + GRIS + '">Aucune facture payée ce mois-ci.</p>') +
    G.partie(2, 'Dons généraux (' + C.TAUX + ' %) — don par don') + tableDons(b.general, false) +
    G.partie(3, 'Cagnottes (besoins) — don par don') + tableDons(b.besoins, true) +
    G.note(['Commission = ce qui est facturé à l\'association et payé par carte ; seules les factures payées dans le mois sont comptées.', 'Dons généraux : ' + C.TAUX + ' % du don après frais Stripe.', 'Cagnottes : la personne reçoit 88 % du don ; ce qui reste après les frais Stripe est partagé moitié prestataire, moitié association.', 'Dons des cagnottes facturés avant le 26/11/2026 : ' + C.TAUX + ' % (ancienne règle) ; la différence est rendue à l\'association (« trop-perçu rendu »).', 'Montants lus dans Stripe, sans estimation.'], 'Comment c\'est calculé');
}
function csv(b) {
  const n = c => (c / 100).toFixed(2).replace('.', ','), q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const L = [['Catégorie', 'Objet', 'Date', 'Donateur', 'E-mail', 'ID de paiement Stripe', 'N° de reçu', 'Nature', 'Don', 'Frais Stripe', 'Net', 'Pour la personne', 'Règle', 'Commission', 'Facture'].map(q).join(';')];
  for (const [cat, A] of [['Don général', b.general], ['Cagnotte', b.besoins]]) for (const l of A) L.push([cat, l.objet, l.date, l.donateur, l.email, l.paiement, l.recu, l.nature].map(q).concat([n(l.brut), n(l.frais), n(l.net), l.personne == null ? '' : n(l.personne), q(l.regle), n(l.com), q(l.facture)]).join(';'));
  L.push('', [q('Total dons généraux'), '', '', '', '', '', '', '', '', '', '', '', '', n(b.T.general)].join(';'), [q('Total cagnottes'), '', '', '', '', '', '', '', '', '', '', '', '', n(b.T.besoins)].join(';'), [q('Trop-perçu rendu'), '', '', '', '', '', '', '', '', '', '', '', '', '-' + n(b.T.avoir)].join(';'), [q('TOTAL DES COMMISSIONS REÇUES'), '', '', '', '', '', '', '', '', '', '', '', '', n(b.T.recu)].join(';'));
  return '﻿' + L.join('\r\n');
}
function mail(b, live) {
  const subject = (live ? '' : '[TEST] ') + 'Bilan des commissions de ' + moisLong(b.mois) + ' : ' + eur(b.T.recu) + ' reçus';
  const text = ['Bilan des commissions de ' + moisLong(b.mois) + ' (pour la déclaration URSSAF).', '', 'Dons généraux (' + C.TAUX + ' %) : ' + eur(b.T.general), 'Cagnottes (besoins) : ' + eur(b.T.besoins), 'Trop-perçu rendu : − ' + eur(b.T.avoir), 'TOTAL DES COMMISSIONS REÇUES : ' + eur(b.T.recu), '', b.factures.length + ' facture(s) payée(s) dans le mois. Détail don par don dans le PDF et le CSV joints.'].join('\n');
  return { subject, text, html: G.enMail(corps(b, false), 'En pièces jointes : le bilan en PDF (à garder pour l\'URSSAF) et le détail en CSV.'), pdfHtml: G.enPdf(corps(b, true)), csv: csv(b), fichier: 'commissions_' + b.mois };
}

function monter(app, { stripe, adminOk, mailer, load, save, pdfTampon, stripe2 = process.env.STRIPE_COMMISSION_KEY ? require('stripe')(process.env.STRIPE_COMMISSION_KEY) : null }) {
  // Appelé chaque jour par le serveur du site à partir du 1er du mois : envoie le bilan du mois écoulé, une seule fois. { mois: 'AAAA-MM', forcer } pour un mois précis.
  app.post('/api/admin/commission/bilan-mensuel', async (req, res) => {
    if (!adminOk(req, res)) return;
    try {
      const to = String(process.env.COMMISSION_EMAIL || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return res.json({ ok: true, envoye: false, raison: 'COMMISSION_EMAIL non renseigné' });
      if (!stripe || !stripe2) return res.json({ ok: true, envoye: false, raison: 'clés Stripe absentes' });
      const b0 = req.body || {}, mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(b0.mois || '')) ? b0.mois : moisPrecedent(parisMois(Date.now())), d = load();
      if (d.commission && d.commission.dernierBilan === mois && !b0.forcer) return res.json({ ok: true, envoye: false, raison: 'déjà envoyé pour ' + mois });
      const b = await bilan({ stripe, stripe2, recus: d.receipts || {}, mois }), m = mail(b, /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''));
      const pj = []; try { pj.push({ name: m.fichier + '.pdf', content: (await pdfTampon(m.pdfHtml)).toString('base64') }); } catch (e) { console.error('bilan mensuel : PDF non fabriqué', e.message); }
      pj.push({ name: m.fichier + '.csv', content: Buffer.from(m.csv, 'utf8').toString('base64') });
      const env = await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text, attachments: pj });
      if (!(env && (env.sent === true || (env.simulated && mailer.isFake && mailer.isFake(to))))) return res.json({ ok: true, envoye: false, raison: 'e-mail non envoyé' + (env && env.reason ? ' (' + env.reason + ')' : '') });
      const d2 = load(); d2.commission = { ...(d2.commission || {}), dernierBilan: mois, bilanEnvoyeLe: new Date().toISOString() }; save(d2);
      res.json({ ok: true, envoye: true, mois, total: b.T, factures: b.factures.length, pdf: pj.length === 2 });
    } catch (e) { console.error('commission/bilan-mensuel', e.message); res.status(502).json({ error: e.message }); }
  });
}

module.exports = { bilan, corps, csv, mail, monter, moisPrecedent, bornes };
