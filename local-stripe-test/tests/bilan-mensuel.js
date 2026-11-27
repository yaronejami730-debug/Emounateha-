// BILAN MENSUEL DES COMMISSIONS (prestataire, URSSAF) : essais avec deux FAUX comptes Stripe (aucun appel réseau, aucun paiement, aucun vrai e-mail).
process.env.STRIPE_SECRET_KEY = 'sk_test_faux'; process.env.COMMISSION_EMAIL = 'prestataire@exemple.test';
const B = require('../bilan-mensuel.js'), C = require('../commission.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); };
const T = j => Math.floor(Date.parse(j) / 1000), gen = a => (async function* () { for (const x of a) yield x; })();
let n = 0; const don = (amount, fee, description, quand = '2026-11-10T10:00:00Z') => ({ id: 'txn_' + (++n), type: 'charge', amount, fee, net: amount - fee, currency: 'eur', created: T(quand), description, source: { id: 'ch_' + n, payment_intent: 'pi_' + n, billing_details: { name: 'Donateur ' + n, email: 'd' + n + '@exemple.test' } } });
const W = { payouts: {}, mv: {}, factures: [] };
const virement = (id, arrivee, mouvements) => { const net = mouvements.reduce((a, m) => a + m.net, 0); W.payouts[id] = { id, amount: net, currency: 'eur', status: 'paid', arrival_date: T(arrivee + 'T00:00:00Z'), created: T(arrivee + 'T00:00:00Z') }; W.mv[id] = [{ id: 'txn_p' + id, type: 'payout', amount: -net, fee: 0, net: -net, currency: 'eur' }, ...mouvements]; };
const stripe = { payouts: { retrieve: async id => W.payouts[id] }, balanceTransactions: { list: o => gen(W.mv[o.payout] || []) } };
const stripe2 = { invoices: { list: o => gen(W.factures.filter(f => !o.status || f.status === o.status)) } };
const facture = (id, cree, paye, ids, montant, o = {}) => W.factures.push({ id, number: 'F-' + id, status: o.status || 'paid', created: T(cree), status_transitions: { paid_at: paye ? T(paye) : null }, amount_paid: montant, total: montant, metadata: { commission: '1', v0: ids.join(','), ...(o.avoir ? { avoir: String(o.avoir) } : {}) } });

(async () => {
  console.log('\n— Novembre : facture faite avant la règle des cagnottes (7 % sur tout)');
  virement('po_1', '2026-11-12', [don(10000, 175, 'Don — Colis de Chabbat'), don(10000, 175, 'Don — Besoin : Famille Lévy (famille-levy)')]);
  facture('in_1', '2026-11-13T11:00:00Z', '2026-11-13T11:30:00Z', ['po_1'], Math.round(19650 * 0.07));
  virement('po_0', '2026-10-28', [don(5000, 100, 'Don — Colis de Chabbat', '2026-10-27T10:00:00Z')]);
  facture('in_0', '2026-10-29T11:00:00Z', '2026-10-29T11:30:00Z', ['po_0'], 343);   // payée en octobre : pas dans le bilan de novembre
  let b = await B.bilan({ stripe, stripe2, mois: '2026-11' });
  ok(b.factures.length === 1 && b.factures[0].numero === 'F-in_1', 'seules les factures PAYÉES dans le mois comptent', b.factures);
  ok(b.general.length === 1 && b.besoins.length === 1 && b.besoins[0].objet === 'Famille Lévy', 'dons généraux d\'un côté, cagnottes de l\'autre', [b.general.length, b.besoins.length]);
  ok(b.T.recu === 1376 && b.T.general + b.T.besoins === 1376 && b.T.ecart === 0 && /7 % \(règle d'avant/.test(b.besoins[0].regle), 'ancienne facture : 7 % sur tout, total = facture payée (13,76 €)', b.T);

  console.log('\n— Décembre : nouvelle règle + trop-perçu rendu');
  virement('po_2', '2026-12-01', [don(10000, 175, 'Don — Hanouka : Beignets', '2026-11-30T10:00:00Z'), don(10000, 175, 'Don — Besoin : Famille Lévy (famille-levy)', '2026-11-30T11:00:00Z')]);
  const presta = C.partsBesoin(10000, 9825).prestataire;
  facture('in_2', '2026-12-02T11:00:00Z', '2026-12-02T11:30:00Z', ['po_2'], 688 + presta - 200, { avoir: 200 });
  facture('in_3', '2026-12-03T11:00:00Z', null, ['po_2'], 999, { status: 'open' });   // pas payée : jamais comptée
  b = await B.bilan({ stripe, stripe2, mois: '2026-12' });
  ok(b.T.general === 688 && b.T.besoins === presta && b.T.avoir === 200 && b.T.recu === 688 + presta - 200 && b.T.ecart === 0, 'décembre : 7 % des dons généraux + moitié du reste sur la cagnotte − trop-perçu = reçu', b.T);
  ok(b.besoins[0].personne === 8800 && b.besoins[0].regle === 'moitié du reste', 'cagnotte : 88 € pour la personne sur 100 €, règle indiquée', b.besoins[0]);
  ok(b.factures.length === 1, 'facture non payée : pas dans le bilan', b.factures);
  const m = B.mail(b, false);
  ok(/Bilan des commissions de décembre 2026/.test(m.subject) && /TOTAL DES COMMISSIONS REÇUES/.test(m.pdfHtml) && /Cagnotte « Famille Lévy »/.test(m.pdfHtml) && /Hanouka/.test(m.pdfHtml) && /Trop-perçu rendu/.test(m.pdfHtml), 'PDF : total, cagnottes et dons généraux séparés, trop-perçu', m.subject);
  ok(/TOTAL DES COMMISSIONS REÇUES";.*;\d/.test(m.csv.replace(/\r\n/g, '\n').split('\n').pop()) && m.csv.split('\r\n').filter(l => /^"(Don général|Cagnotte)"/.test(l)).length === 2, 'CSV : une ligne par don, total à la fin', m.csv.slice(-200));

  console.log('\n— Envoi : une seule fois par mois');
  let routes = {}, data = {}, mails = [];
  const app = { post: (u, h) => { routes[u] = h; } };
  B.monter(app, { stripe, stripe2, adminOk: () => true, load: () => JSON.parse(JSON.stringify(data)), save: d => { data = d; }, pdfTampon: async () => Buffer.from('%PDF'), mailer: { send: async x => { mails.push(x); return { sent: true }; } } });
  const appel = async body => { let r = null; await routes['/api/admin/commission/bilan-mensuel']({ body }, { json: x => { r = x; }, status() { return this; }, setHeader() {} }); return r; };
  let r = await appel({ mois: '2026-12' });
  ok(r.envoye && mails.length === 1 && mails[0].to === 'prestataire@exemple.test' && mails[0].attachments.length === 2 && mails[0].attachments[0].name === 'commissions_2026-12.pdf', 'e-mail au prestataire avec le PDF et le CSV', r);
  r = await appel({ mois: '2026-12' }); ok(!r.envoye && /déjà envoyé/.test(r.raison) && mails.length === 1, 'deuxième appel le même mois : rien de plus', r);
  ok(B.moisPrecedent('2027-01') === '2026-12' && B.moisPrecedent('2026-12') === '2026-11', 'le 1er janvier : bilan de décembre');
  console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ECHEC erreur du test', e.stack); process.exit(1); });
