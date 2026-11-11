// Compte des mini-cagnottes : essais sur des paiements inventés (aucun appel à Stripe).
const C = require('../cagnottes.js'); let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 300)); };
let i = 0; const P = (amount, fee, o = {}) => ({ id: 'pi_' + (++i), status: 'succeeded', currency: 'eur', amount, amount_received: amount, metadata: { besoin: 'loyer' }, latest_charge: { amount_refunded: 0, disputed: false, balance_transaction: fee == null ? 'txn_non_deplie' : { fee, net: amount - fee } }, ...o });
(async () => {
  let r = C.resumer([P(100000, 2000)]); ok(r.dons === 1 && r.brut === 100000 && r.frais === 2000 && r.net === 98000 && !r.incomplets, '1 000 € collectés, 20 € de frais : 980 € nets', r);
  r = C.resumer([P(5000, 100), P(2000, 55), P(13000, 220)]); ok(r.dons === 3 && r.brut === 20000 && r.frais === 375 && r.net === 19625, 'trois dons : frais additionnés au centime', r);
  r = C.resumer([P(5000, 100), P(2000, 55, { latest_charge: { amount_refunded: 2000, disputed: false, balance_transaction: { fee: 55 } } })]); ok(r.rembourse === 2000 && r.net === 5000 + 2000 - 155 - 2000, 'don remboursé : retiré de la somme due', r);
  r = C.resumer([P(5000, 100), P(3000, null)]); ok(r.dons === 2 && r.frais === 100 && r.incomplets === 1, 'frais pas encore connus : signalé, jamais inventé', r);
  r = C.resumer([P(5000, 100), P(4000, 90, { status: 'processing' }), P(900, 30, { currency: 'usd' })]); ok(r.dons === 1 && r.brut === 5000 && r.incomplets === 1, 'paiement non abouti ignoré, devise étrangère signalée', r);
  r = C.resumer([P(5000, 100, { latest_charge: { amount_refunded: 0, disputed: true, balance_transaction: { fee: 100 } } })]); ok(r.litiges === 1, 'paiement contesté : signalé', r);
  r = C.resumer([]); ok(r.dons === 0 && r.net === 0, 'cagnotte sans don : 0', r);
  // point d'entrée : faux serveur, faux Stripe
  const routes = {}, app = { get: (p, f) => routes[p] = f }; let appels = [], autorise = true;
  const base = { loyer: [P(100000, 2000), P(5000, 100, { metadata: { besoin: 'loyer-2' } })], armoire: [P(3000, 70, { metadata: { besoin: 'armoire' } })] };
  const stripe = { paymentIntents: { search: q => { appels.push(q); const s = (q.query.match(/:'([a-z0-9-]+)'/) || [])[1]; return (async function* () { for (const x of base[s] || []) yield x; })(); } } };
  C.monter(app, { stripe, adminOk: (req, res) => { if (!autorise) res.status(401).json({ error: 'non autorisé' }); return autorise; } });
  const appel = async q => { let code = 200, corps; const res = { status: c => (code = c, res), json: j => (corps = j, res), setHeader: () => {} }; await routes['/api/admin/cagnottes']({ query: q }, res); return { code, corps }; };
  let a = await appel({ slugs: "loyer,armoire,inconnue,MAUVAIS'OR 1=1" });
  ok(a.code === 200 && a.corps.par.loyer.net === 98000 && a.corps.par.loyer.dons === 1, "le don d'une autre cagnotte au nom proche (loyer-2) n'est pas compté", a.corps);
  ok(a.corps.par.armoire.net === 2930 && a.corps.par.inconnue.dons === 0 && Object.keys(a.corps.par).length === 3, 'plusieurs cagnottes ; adresse invalide écartée (pas d\'injection dans la recherche)', a.corps);
  ok(appels.every(q => /^metadata\['besoin'\]:'[a-z0-9-]+' AND status:'succeeded'$/.test(q.query) && q.expand[0] === 'data.latest_charge.balance_transaction'), 'recherche Stripe : étiquette exacte, paiements aboutis, frais réels demandés', appels);
  const n = appels.length; await appel({ slugs: 'loyer' }); ok(appels.length === n, 'second affichage dans la minute : pas de nouvel appel à Stripe');
  autorise = false; a = await appel({ slugs: 'loyer' }); ok(a.code === 401, 'sans signature du serveur du site : refusé', a);
  const src = require('fs').readFileSync(require('path').join(__dirname, '../cagnottes.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/\.(create|update|del|confirm|capture|cancel)\(/.test(src) && !/transfers|payouts|refunds/.test(src), 'lecture seule : aucun appel Stripe qui crée, modifie, rembourse ou vire');
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})();
