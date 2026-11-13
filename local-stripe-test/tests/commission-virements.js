// Virements côté prestataire : essais avec un faux Stripe (aucun appel réseau).
process.env.STRIPE_COMMISSION_CLIENT = 'cus_x'; const C = require('../commission.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); };
const T = (d, h) => Date.parse(d + 'T' + h + ':00+01:00'), gen = a => (async function* () { for (const x of a) yield x; })();
const J = (d, h) => C.jourUrssaf(T(d, h || '10:00'));
ok(!J('2026-11-29') && J('2026-11-30').mois === '2026-11' && !J('2026-12-30') && J('2026-12-31').mois === '2026-12' && J('2027-02-28').mois === '2027-02' && !J('2027-02-27') && J('2028-02-29').mois === '2028-02' && !J('2028-02-28'), 'dernier jour du mois : 30 nov., 31 déc., 28 févr. 2027, 29 févr. 2028 — pas la veille');
ok(J('2026-12-01').mois === '2026-11' && J('2027-01-03').mois === '2026-12' && !J('2027-01-04') && !J('2026-12-15'), 'rattrapage les 1er, 2 et 3 pour le mois écoulé, plus rien ensuite');
function monde(interval = 'manual') {
  const W = { F: [], P: [], solde: 0, n: 0 };
  W.facture = (brut, frais, paye, o = {}) => { const id = 'in_' + (++W.n); W.F.push({ id, number: 'F' + W.n, metadata: { commission: '1' }, status_transitions: { paid_at: Math.floor(paye / 1000) }, charge: { amount_refunded: 0, ...o.charge, balance_transaction: { amount: brut, fee: frais, net: brut - frais, currency: 'eur', status: o.attente ? 'pending' : 'available' } } }); if (!o.attente) W.solde += brut - frais; return id; };
  W.s = { accounts: { retrieve: async () => ({ settings: { payouts: { schedule: { interval } } } }) }, invoices: { list: () => gen(W.F) }, payouts: { list: () => gen(W.P), create: async p => { if (p.amount > W.solde) throw new Error('fonds insuffisants'); W.solde -= p.amount; const x = { id: 'po_' + (W.P.length + 1), status: 'pending', arrival_date: 1, ...p }; W.P.push(x); return x; } }, balance: { retrieve: async () => ({ available: [{ currency: 'eur', amount: W.solde }] }) } };
  W.run = (quand, actif = true) => C.virer({ stripe2: W.s, maintenant: quand, actif }); return W;
}
(async () => {
  let W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00'));
  let v = await W.run(T('2026-11-18', '09:00')); ok(v.partNette.virement.montant === 6825 && W.solde === 3000 && !v.urssaf.virement, '100 € de commission, 1,75 € de frais : 68,25 € virés, 30 € restent sur Stripe', v);
  W.facture(20000, 300, T('2026-11-24', '17:00')); v = await W.run(T('2026-11-25', '09:00')); ok(v.partNette.virement.montant === 13700 && W.solde === 9000, 'deuxième commission de 200 € : 137 € virés, réserve à 90 €', [v.partNette, W.solde]);
  v = await W.run(T('2026-11-29', '17:00')); ok(!v.urssaf.virement && W.solde === 9000, 'le 29 : la réserve ne bouge pas');
  v = await W.run(T('2026-11-30', '09:00')); ok(v.urssaf.virement.montant === 9000 && v.urssaf.virement.libelle === 'URSSAF 11/2026' && v.urssaf.encaisse === 30000 && W.solde === 0, 'le 30 novembre : 90 € virés, libellé « URSSAF 11/2026 », pour 300 € encaissés', v.urssaf);
  v = await W.run(T('2026-11-30', '17:00')); ok(!v.urssaf.virement && !v.partNette.virement && W.P.length === 3, 'second passage du 30 : rien');
  W.facture(5000, 100, T('2026-12-10', '17:00')); v = await W.run(T('2026-12-30', '17:00')); ok(!v.urssaf.virement && W.solde === 1500, 'décembre a 31 jours : rien le 30', v.urssaf);
  v = await W.run(T('2026-12-31', '09:00')); ok(v.urssaf.virement.montant === 1500 && v.urssaf.virement.libelle === 'URSSAF 12/2026', 'le 31 décembre : 15 € virés, libellé « URSSAF 12/2026 »', v.urssaf);
  // dernier jour manqué : rattrapage le 1er, sans prendre les commissions du nouveau mois
  W = monde(); W.facture(10000, 175, T('2027-01-20', '17:00')); await W.run(T('2027-01-21', '09:00')); W.facture(4000, 80, T('2027-02-01', '08:00'));
  v = await W.run(T('2027-02-01', '09:00')); ok(v.urssaf.virement && v.urssaf.virement.montant === 3000 && v.urssaf.virement.libelle === 'URSSAF 01/2027' && W.solde === 1200, 'fin janvier manquée : rattrapée le 1er février (30 €, libellé de janvier), la commission de février reste en réserve', [v.urssaf, W.solde]);
  v = await W.run(T('2027-02-28', '09:00')); ok(v.urssaf.virement.montant === 1200 && v.urssaf.virement.libelle === 'URSSAF 02/2027' && W.solde === 0, 'le 28 février : réserve de février virée');
  // fonds pas encore disponibles, virement refusé par la banque, compte automatique, interrupteur éteint
  W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00'), { attente: true }); v = await W.run(T('2026-11-30', '09:00')); ok(!v.partNette.virement && !v.urssaf.virement && v.enAttente === 1, 'fonds pas encore disponibles chez Stripe : rien, on attend', v);
  W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00')); await W.run(T('2026-11-18', '09:00')); W.P[0].status = 'failed'; W.solde += 6825; v = await W.run(T('2026-11-19', '09:00')); ok(v.partNette.virement && v.partNette.virement.montant === 6825 && W.solde === 3000, 'virement refusé par votre banque : refait au passage suivant, une seule fois');
  W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00')); v = await W.run(T('2026-11-30', '09:00'), false); ok(v.mode === 'simulation' && v.partNette.montant === 6825 && v.urssaf.montant === 3000 && !W.P.length && W.solde === 9825, 'interrupteur éteint : montants annoncés, rien viré', v);
  W = monde('daily'); W.facture(10000, 175, T('2026-11-17', '17:00')); v = await W.run(T('2026-11-30', '09:00')); ok(v.ok === false && /manuel/.test(v.error) && !W.P.length, 'compte en virements automatiques : refus, rien viré', v);
  W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00'), { charge: { amount_refunded: 10000 } }); v = await W.run(T('2026-11-30', '09:00')); ok(!W.P.length && v.ecartes.length === 1, 'commission remboursée à l\'association : rien viré, signalée', v);
  W = monde(); W.facture(10000, 175, T('2026-11-17', '17:00')); W.solde = 5000; v = await W.run(T('2026-11-18', '09:00')); ok(!W.P.length && /insuffisant/.test(v.partNette.attente), 'solde Stripe insuffisant : rien, nouvel essai plus tard', v.partNette);
  console.log(pass + ' ok, ' + fail + ' échec');
})().catch(e => console.error('ERREUR', e));
