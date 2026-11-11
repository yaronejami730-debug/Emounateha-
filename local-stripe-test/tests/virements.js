// E-mail à chaque virement Stripe → banque : essais sur des virements inventés (aucun appel à Stripe, aucun e-mail réel).
const V = require('../virements.js'); let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 400)); };
const t = j => Math.floor(Date.parse(j + 'T08:00:00Z') / 1000);
const P = (id, amount, o = {}) => ({ id, amount, currency: 'eur', status: 'in_transit', created: t('2026-11-12'), arrival_date: t('2026-11-16'), destination: { bank_name: 'CREDIT MUTUEL', last4: '4321' }, ...o });
(async () => {
  let c = V.contenu([{ type: 'payout', amount: -98000, fee: 0 }, { type: 'charge', amount: 60000, fee: 1200 }, { type: 'charge', amount: 40000, fee: 800 }]);
  ok(c.dons === 2 && c.brut === 100000 && c.frais === 2000 && c.net === 98000, 'contenu : 2 dons, 1 000 € − 20 € de frais = 980 €', c);
  c = V.contenu([{ type: 'charge', amount: 5000, fee: 100 }, { type: 'refund', amount: -5000, fee: 0 }, { type: 'stripe_fee', amount: -200, fee: 0 }]);
  ok(c.rembourse === -5000 && c.autres === -200 && c.net === -300, 'remboursement et frais divers comptés à part', c);
  let m = V.mailVirement(P('po_1', 98000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 });
  ok(/980,00 €/.test(m.subject) && /16 novembre/.test(m.subject) && /CREDIT MUTUEL ···· 4321/.test(m.text) && /Dons encaissés \(2\) : 1.000,00 €/.test(m.text) && /= Viré sur le compte bancaire : 980,00 €/.test(m.text) && !/Solde reporté/.test(m.text), 'e-mail : montant, date d\'arrivée, banque, calcul complet', m.text);
  { const L = V.lignes([{ id: 't1', type: 'charge', amount: 60000, fee: 1200, net: 58800, created: 1794400000, description: 'Don Émounatéha', source: { id: 'ch_1', payment_intent: 'pi_1' } }, { id: 't2', type: 'charge', amount: 40000, fee: 800, net: 39200, created: 1794300000, description: 'Don sans reçu connu' }, { id: 't0', type: 'payout', amount: -98000, fee: 0 }], { pi_1: { nom: 'Sarah Lévy', numero: 'A2026/0007', affectation: 'Colis de Chabbat' } });
    ok(L.length === 2 && L[0].ref === 't2' && L[1].donateur === 'Sarah Lévy' && L[1].recu === 'A2026/0007' && L[1].libelle === 'Colis de Chabbat' && L[0].donateur === '' && L[0].libelle === 'Don sans reçu connu', 'détail : une ligne par don, par date, avec donateur et n° de reçu quand le reçu existe', L);
    const csv = V.csvVirement(P('po_1', 98000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }, L);
    ok(csv.charCodeAt(0) === 0xFEFF && /Date;Heure;Type;Libellé;Donateur;N° de reçu;Montant;Frais Stripe;Net;Référence Stripe/.test(csv) && /"Sarah Lévy";"A2026\/0007";600,00;12,00;588,00;t1/.test(csv) && /"Montant viré à la banque";;;;;980,00/.test(csv), 'CSV : en-têtes, une ligne par don, totaux, lisible par Excel', csv.slice(0, 400));
    const mm = V.mailVirement(P('po_1', 98000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }, { lignes: L });
    ok(/Pourquoi ce montant/.test(mm.html) && /Sarah Lévy/.test(mm.html) && /<!doctype html>/.test(mm.pdfHtml) && /Relevé de virement Stripe/.test(mm.pdfHtml) && /Sarah Lévy/.test(mm.pdfHtml) && /^virement-stripe_2026-11-16_980-00EUR$/.test(mm.fichier), 'e-mail et PDF : explication du montant et tableau des dons', mm.fichier); }
  { const E = V.exemples(); ok(E.length === 3 && E[0].p.amount === V.contenu(E[0].mv).net && E[1].mv.some(x => x.type === 'refund') && E[2].echec, 'exemples : un virement simple, un avec remboursement, un refusé ; montants cohérents', E.map(e => e.p.amount)); }
  ok(!/commission|7 ?%/i.test(m.text + m.html) && !/[a-z0-9._-]+@[a-z]/i.test(m.text), 'e-mail : ni commission, ni adresse e-mail de donateur');
  m = V.mailVirement(P('po_2', 90000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }); ok(/Solde reporté ou mouvement hors dons : − 80,00 €/.test(m.text), 'écart entre dons et virement : signalé, pas masqué', m.text);
  m = V.mailVirement(P('po_3', 5000, { status: 'failed', failure_message: 'Compte clôturé' }), null, { echec: true }); ok(/REFUSÉ/.test(m.subject) && /Compte clôturé/.test(m.text), 'virement refusé : e-mail d\'alerte avec le motif', m.subject);
  // point d'entrée : faux serveur, faux Stripe, faux e-mails
  const routes = {}, app = { post: (p, f) => routes[p] = f }; let data = { receipts: {} }, mails = [], liste = [P('po_ancien', 12000, { status: 'paid' })], panne = false, autorise = true, ecritures = 0;
  const stripe = { payouts: { list: async o => ({ data: liste.slice() }) }, balanceTransactions: { list: o => (async function* () { yield { type: 'payout', amount: -1, fee: 0 }; yield { type: 'charge', amount: 100000, fee: 2000 }; })() } };
  const mailer = { ADMIN_EMAIL: () => 'admin@exemple.com', send: async x => { if (panne) throw new Error('Brevo en panne'); mails.push(x); return { sent: true }; } };
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  let pdfKo = false; V.monter(app, { pdfTampon: async h => { if (pdfKo) throw new Error('navigateur indisponible'); return Buffer.from('%PDF-essai ' + h.length); }, stripe, mailer, adminOk: (q, r) => { if (!autorise) r.status(401).json({}); return autorise; }, load: () => JSON.parse(JSON.stringify(data)), save: d => { data = d; ecritures++; } });
  const appel = async () => { let code = 200, corps; const res = { status: c => (code = c, res), json: j => (corps = j, res) }; await routes['/api/admin/virements/verifier']({ body: {} }, res); return { code, corps }; };
  let r = await appel(); ok(r.corps.miseEnService && mails.length === 0 && data.virements.vus.po_ancien === 'vu', 'mise en service : les virements passés ne déclenchent aucun e-mail', r.corps);
  r = await appel(); ok(r.corps.envoyes === 0 && mails.length === 0, 'rien de nouveau : aucun e-mail', r.corps);
  liste.unshift(P('po_nouveau', 98000)); r = await appel();
  ok(r.corps.envoyes === 1 && mails.length === 1 && mails[0].to === 'admin@exemple.com' && /\[TEST\] Virement Stripe vers la banque : 980,00 €/.test(mails[0].subject), 'nouveau virement : un e-mail à l\'administrateur', [r.corps, mails.map(x => x.subject)]);
  r = await appel(); r = await appel(); ok(mails.length === 1, 'vérifications suivantes : pas de second e-mail pour le même virement');
  liste[0] = P('po_nouveau', 98000, { status: 'paid' }); r = await appel(); ok(mails.length === 1, 'virement arrivé à la banque : pas de second e-mail');
  liste[0] = P('po_nouveau', 98000, { status: 'failed', failure_code: 'account_closed' }); r = await appel(); ok(mails.length === 2 && /REFUSÉ/.test(mails[1].subject), 'virement refusé après coup : un e-mail d\'alerte', mails.map(x => x.subject));
  r = await appel(); ok(mails.length === 2, 'refus : une seule alerte');
  liste.unshift(P('po_panne', 4000)); panne = true; r = await appel(); ok(r.corps.erreurs.length === 1 && !data.virements.vus.po_panne, 'e-mail en panne : le virement n\'est pas noté comme vu', r.corps);
  panne = false; r = await appel(); ok(mails.length === 3 && data.virements.vus.po_panne === 'vu', 'à la vérification suivante : l\'e-mail part');
  liste.unshift(P('po_neg', -500)); r = await appel(); ok(mails.length === 3, 'régularisation négative : pas d\'e-mail');
  ok(mails[0].attachments.length === 2 && /\.csv$/.test(mails[0].attachments[0].name) && /\.pdf$/.test(mails[0].attachments[1].name) && Buffer.from(mails[0].attachments[1].content, 'base64').toString().startsWith('%PDF'), 'vrai virement : CSV et PDF joints, au format attendu par Brevo', mails[0].attachments.map(a => a.name));
  ok(mails[1].attachments.length === 0, 'virement refusé : pas de pièce jointe');
  liste.unshift(P('po_sanspdf', 7000)); pdfKo = true; r = await appel(); ok(mails.length === 4 && mails[3].attachments.length === 1 && !/PDF/.test(mails[3].text.split('Pièces jointes')[1] || ''), 'PDF impossible à fabriquer : le mail part quand même, avec le CSV', [mails.length, (mails[3] || {}).attachments]); pdfKo = false;
  autorise = false; r = await appel(); ok(r.code === 401, 'sans signature du serveur du site : refusé');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../virements.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/payouts\.(create|update|cancel|reverse)|transfers\.|refunds\./.test(src), 'lecture seule : aucun virement créé, modifié ou annulé');
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})();
