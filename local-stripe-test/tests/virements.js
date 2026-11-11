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
  ok(/980,00 €/.test(m.subject) && /16 novembre/.test(m.subject) && /CREDIT MUTUEL ···· 4321/.test(m.text) && /Dons regroupés dans ce virement : 2/.test(m.text) && !/Écart/.test(m.text), 'e-mail : montant, date d\'arrivée, banque, nombre de dons', m.text);
  ok(!/commission|7 ?%/i.test(m.text + m.html) && !/[a-z0-9._-]+@[a-z]/i.test(m.text), 'e-mail : ni commission, ni donnée de donateur');
  m = V.mailVirement(P('po_2', 90000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }); ok(/Écart avec le montant viré/.test(m.text), 'écart entre dons et virement : signalé, pas masqué', m.text);
  m = V.mailVirement(P('po_3', 5000, { status: 'failed', failure_message: 'Compte clôturé' }), null, { echec: true }); ok(/REFUSÉ/.test(m.subject) && /Compte clôturé/.test(m.text), 'virement refusé : e-mail d\'alerte avec le motif', m.subject);
  // point d'entrée : faux serveur, faux Stripe, faux e-mails
  const routes = {}, app = { post: (p, f) => routes[p] = f }; let data = { receipts: {} }, mails = [], liste = [P('po_ancien', 12000, { status: 'paid' })], panne = false, autorise = true, ecritures = 0;
  const stripe = { payouts: { list: async o => ({ data: liste.slice() }) }, balanceTransactions: { list: o => (async function* () { yield { type: 'payout', amount: -1, fee: 0 }; yield { type: 'charge', amount: 100000, fee: 2000 }; })() } };
  const mailer = { ADMIN_EMAIL: () => 'admin@exemple.com', send: async x => { if (panne) throw new Error('Brevo en panne'); mails.push(x); return { sent: true }; } };
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  V.monter(app, { stripe, mailer, adminOk: (q, r) => { if (!autorise) r.status(401).json({}); return autorise; }, load: () => JSON.parse(JSON.stringify(data)), save: d => { data = d; ecritures++; } });
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
  autorise = false; r = await appel(); ok(r.code === 401, 'sans signature du serveur du site : refusé');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../virements.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/payouts\.(create|update|cancel|reverse)|transfers\.|refunds\./.test(src), 'lecture seule : aucun virement créé, modifié ou annulé');
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})();
