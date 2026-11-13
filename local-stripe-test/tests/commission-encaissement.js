// Encaissement de la commission par carte, virement par virement : essais avec deux FAUX comptes Stripe (aucun appel réseau, aucun paiement).
process.env.STRIPE_SECRET_KEY = 'sk_test_faux'; process.env.STRIPE_COMMISSION_KEY = 'sk_test_faux2'; process.env.COMMISSION_ENCAISSER = 'oui'; delete process.env.COMMISSION_DEPUIS;
const C = require('../commission.js'); let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 400)); };
const J = j => Math.floor(Date.parse(j + 'T00:00:00Z') / 1000), H = (j, h) => Date.parse(j + 'T' + h + ':00+01:00');
const gen = a => (async function* () { for (const x of a) yield x; })();
let n = 0; const don = (amount, fee) => ({ id: 'txn_' + (++n), type: 'charge', amount, fee, net: amount - fee, currency: 'eur', created: J('2026-11-10') });
const remb = amount => ({ id: 'txn_' + (++n), type: 'refund', amount: -amount, fee: 0, net: -amount, currency: 'eur', created: J('2026-11-10') });
function monde() {
  const W = { payouts: [], mv: {}, factures: [], postes: [], carte: true, refuse: false, appels: [], idem: {} };
  W.virement = (id, arrivee, mouvements, o = {}) => { const net = mouvements.reduce((a, m) => a + m.net, 0); W.payouts.push({ id, amount: net, currency: 'eur', status: 'paid', arrival_date: J(arrivee), ...o }); W.mv[id] = [{ id: 'txn_p' + id, type: 'payout', amount: -net, fee: 0, net: -net, currency: 'eur' }, ...mouvements]; };
  W.asso = { payouts: { list: o => gen(W.payouts.filter(p => !o.status || p.status === o.status)) }, balanceTransactions: { list: o => gen(W.mv[o.payout] || []) } };
  const total = f => W.postes.filter(p => p.invoice === f.id).reduce((a, p) => a + p.amount, 0) + (f.taxe || 0);
  W.moi = {
    customers: { retrieve: async id => ({ id, invoice_settings: { default_payment_method: W.carte ? { card: { brand: 'visa', last4: '4242', exp_month: 3, exp_year: 2029 } } : null } }) },
    paymentMethods: { list: async () => ({ data: (W.autres || []).map((x, i) => ({ id: 'pm_' + i, card: { brand: 'mastercard', last4: x, exp_month: 1, exp_year: 2030 } })) }) },
    invoices: {
      list: () => gen(W.factures.filter(f => !f.supprimee).map(f => ({ ...f }))),
      create: async (p, o) => { W.appels.push('create'); W.pmFacture = p.default_payment_method; if (W.idem[o.idempotencyKey]) return { ...W.idem[o.idempotencyKey] }; const f = { id: 'in_' + (W.factures.length + 1), status: 'draft', metadata: p.metadata, created: Math.floor(W.maintenant / 1000), description: p.description, taxe: W.taxe || 0 }; W.factures.push(f); W.idem[o.idempotencyKey] = f; return { ...f }; },
      retrieve: async id => { const f = W.factures.find(x => x.id === id); return { ...f, total: total(f) }; },
      finalizeInvoice: async id => { const f = W.factures.find(x => x.id === id); f.status = 'open'; f.number = 'F-000' + id.slice(3); f.total = f.amount_due = total(f); f.hosted_invoice_url = 'https://facture.exemple/' + id; return { ...f }; },
      pay: async id => { W.appels.push('pay ' + id); const f = W.factures.find(x => x.id === id); if (W.refuse) throw new Error('Votre carte a été refusée.'); f.status = 'paid'; f.amount_paid = f.total; return { ...f }; },
      del: async id => { const f = W.factures.find(x => x.id === id); f.supprimee = true; W.postes = W.postes.filter(p => p.invoice !== id); return { deleted: true }; },
    },
    invoiceItems: { create: async (p, o) => { if (W.panne) throw new Error('Stripe en panne'); if (!W.idem[o.idempotencyKey]) { W.idem[o.idempotencyKey] = 1; W.postes.push({ ...p }); } return p; } },
  };
  W.run = (quand, o = {}) => { W.maintenant = quand; return C.encaisser({ stripe: W.asso, stripe2: o.sansCle ? null : W.moi, simuler: o.simuler, maintenant: quand }); };
  W.encaisse = () => W.factures.filter(f => f.status === 'paid').reduce((a, f) => a + f.total, 0);
  return W;
}
(async () => {
  // ── l'exemple : virement qui arrive le 16 → rien le 16, encaissement le 17 au matin
  let W = monde(); W.virement('po_A', '2026-11-16', [don(10000, 175)]);
  let r = await W.run(H('2026-11-16', '09:00')); ok(r.rien && !W.factures.length, 'virement qui arrive le 16 : rien n\'est encaissé le 16 à 9 h', r);
  r = await W.run(H('2026-11-16', '23:00')); ok(r.rien && !W.factures.length, '… ni le 16 à 23 h');
  r = await W.run(H('2026-11-17', '09:00'));
  ok(r.facture && r.facture.paye && r.facture.montant === 688 && r.total === 688 && r.net === 9825, 'le 17 à 9 h : don de 100 €, net 98,25 €, commission 6,88 € payée par carte', r);
  ok(W.postes.length === 1 && /16\/11\/2026/.test(W.postes[0].description) && /98,25 €/.test(W.postes[0].description) && /7 %/.test(W.postes[0].description), 'ligne de facture : date d\'arrivée, net, taux', W.postes);
  r = await W.run(H('2026-11-18', '09:00')); ok(r.rien && W.factures.length === 1 && W.encaisse() === 688, 'le lendemain : rien de plus (pas de double encaissement)', r);
  for (let i = 0; i < 5; i++) await W.run(H('2026-11-19', '09:00') + i * 3600000); ok(W.factures.length === 1 && W.encaisse() === 688, '5 passages de plus : toujours une seule facture');
  // ── virement pas encore parti / en cours / refusé par la banque : jamais facturé
  W = monde(); W.virement('po_T', '2026-11-10', [don(5000, 100)], { status: 'in_transit' }); W.virement('po_F', '2026-11-10', [don(5000, 100)], { status: 'failed' }); W.virement('po_P', '2026-11-10', [don(5000, 100)], { status: 'pending' });
  r = await W.run(H('2026-11-20', '09:00')); ok(r.rien && !W.factures.length, 'virement en cours, en attente ou refusé par la banque : rien', r);
  // ── rattrapage depuis le premier don : plusieurs virements anciens, une seule facture, chacun compté une fois
  W = monde(); W.virement('po_1', '2026-10-05', [don(10000, 175), don(5200, 103)]); W.virement('po_2', '2026-10-12', [don(100000, 1525)]); W.virement('po_3', '2026-11-02', [don(2600, 64)]); W.virement('po_futur', '2026-11-20', [don(900000, 13000)]);
  r = await W.run(H('2026-11-13', '09:00'));
  const att = Math.round(14922 * 0.07) + Math.round(98475 * 0.07) + Math.round(2536 * 0.07);
  ok(r.facture && r.facture.paye && r.total === att && r.virements.length === 3 && W.postes.length === 3, 'rattrapage : 3 virements passés sur une facture (' + att / 100 + ' €), celui du 20 attend', r);
  ok(JSON.stringify([...C.dejaPris(W.factures)].sort()) === JSON.stringify(['po_1', 'po_2', 'po_3']), 'la facture garde la liste des virements qu\'elle couvre');
  r = await W.run(H('2026-11-21', '09:00')); ok(r.facture && r.virements.length === 1 && r.virements[0].id === 'po_futur' && r.total === Math.round(887000 * 0.07), 'le 21 : seul le virement du 20 est facturé', r);
  // ── simulation et absence de clé : rien n'est créé
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]);
  r = await W.run(H('2026-11-13', '09:00'), { simuler: true }); ok(r.mode === 'simulation' && r.total === 688 && r.carte.fin === '4242' && !W.factures.length && !W.appels.length, 'simulation : montant et carte affichés, rien créé', r);
  r = await W.run(H('2026-11-13', '09:00'), { sansCle: true }); ok(r.mode === 'simulation' && r.total === 688 && !W.factures.length, 'sans la clé du prestataire : simulation, rien créé', r);
  // ── carte refusée (compte vide) : facture gardée, nouvel essai, pas de nouvelle facture entre-temps, jamais payée deux fois
  W.refuse = true; r = await W.run(H('2026-11-13', '09:00')); ok(r.facture && r.facture.paye === false && /refusée/.test(r.facture.raison) && W.factures[0].status === 'open' && W.encaisse() === 0, 'carte refusée : facture en attente, rien encaissé', r);
  W.virement('po_2', '2026-11-12', [don(20000, 300)]);
  r = await W.run(H('2026-11-14', '09:00')); ok(r.attente && r.reessais.length === 1 && !r.reessais[0].paye && W.factures.length === 1, 'le lendemain, toujours refusée : nouvel essai, aucune nouvelle facture', r);
  let m = C.mailEncaissement(r, true); ok(/PAIEMENT REFUSÉ/.test(m.subject) && /facture\.exemple/.test(m.text), 'e-mail d\'alerte avec le lien de paiement', m.subject);
  W.refuse = false; r = await W.run(H('2026-11-15', '09:00'));
  ok(r.reessais[0].paye && r.facture && r.facture.paye && W.factures.length === 2 && W.encaisse() === 688 + Math.round(19700 * 0.07), 'carte de nouveau bonne : ancienne facture payée, puis le virement suivant facturé', r);
  m = C.mailEncaissement(r, true); ok(/encaissée/.test(m.subject) && /nouvel essai/.test(m.text) && m.csv && /po_2/.test(m.csv), 'e-mail de confirmation avec le détail en pièce jointe', m.subject);
  // ── pas de carte enregistrée : rien
  W = monde(); W.carte = false; W.virement('po_1', '2026-11-02', [don(10000, 175)]); r = await W.run(H('2026-11-13', '09:00')); ok(r.ok === false && /carte/.test(r.error) && !W.factures.length, 'aucune carte par défaut : refus net, rien créé', r);
  W.autres = ['1111', '2222']; r = await W.run(H('2026-11-13', '09:00')); ok(r.ok === false && /Plusieurs cartes/.test(r.error) && !W.factures.length, 'plusieurs cartes et aucune par défaut : on ne choisit pas, rien créé', r);
  r = await W.run(H('2026-11-13', '09:00'), { simuler: true }); ok(r.total === 688 && r.carte.ok === false && r.carte.cartesEnregistrees === 2 && !W.factures.length, 'sans carte, la simulation donne quand même le montant', r);
  W.autres = ['1111']; r = await W.run(H('2026-11-13', '09:00')); ok(r.facture && r.facture.paye && r.carte.fin === '1111' && r.carte.parDefaut === false && W.pmFacture === 'pm_0', 'une seule carte enregistrée, pas marquée par défaut : c\'est elle qui paie', r);
  // ── second verrou : sans COMMISSION_ENCAISSER=oui, simulation même avec la clé
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); W.maintenant = H('2026-11-13', '09:00'); r = await C.encaisser({ stripe: W.asso, stripe2: W.moi, maintenant: W.maintenant, actif: false }); ok(r.mode === 'simulation' && r.total === 688 && r.carte.fin === '4242' && !W.factures.length && !W.appels.length, 'clé présente mais interrupteur éteint : simulation, rien créé', r);
  delete process.env.COMMISSION_ENCAISSER; r = await W.run(H('2026-11-13', '09:00')); ok(r.mode === 'simulation' && !W.factures.length, 'interrupteur absent : simulation', r); process.env.COMMISSION_ENCAISSER = 'oui';
  // ── panne en cours de création : brouillon supprimé, repris proprement plus tard, une seule fois
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); W.panne = true; let err = null; try { await W.run(H('2026-11-13', '09:00')); } catch (e) { err = e; }
  ok(err && W.factures.every(f => f.supprimee) && W.encaisse() === 0, 'panne Stripe pendant la création : brouillon supprimé, rien encaissé');
  W.panne = false; r = await W.run(H('2026-11-13', '10:00')); ok(r.facture && r.facture.paye && W.encaisse() === 688 && W.factures.filter(f => !f.supprimee).length === 1, 'une heure après : repris, encaissé une seule fois', r);
  // ── brouillon orphelin (passage interrompu) : supprimé au passage suivant
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); W.factures.push({ id: 'in_orph', status: 'draft', created: Math.floor(H('2026-11-12', '09:00') / 1000), metadata: { commission: '1', v0: 'po_1' } });
  r = await W.run(H('2026-11-13', '09:00')); ok(W.factures[0].supprimee && r.facture && r.facture.paye && W.encaisse() === 688, 'brouillon resté d\'un passage interrompu : supprimé, virement repris', r);
  // ── facture annulée à la main (void) : ses virements sont repris ; facture d'un autre usage : ignorée
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); W.factures.push({ id: 'in_v', status: 'void', created: 1, metadata: { commission: '1', v0: 'po_1' } }, { id: 'in_autre', status: 'open', created: 1, metadata: {} });
  r = await W.run(H('2026-11-13', '09:00')); ok(r.facture && r.facture.paye && !W.appels.includes('pay in_autre'), 'facture annulée : virement refacturé ; facture étrangère à la commission : pas touchée', r);
  // ── taxe inattendue sur la facture : on n'encaisse pas
  W = monde(); W.taxe = 138; W.virement('po_1', '2026-11-02', [don(10000, 175)]); err = null; try { await W.run(H('2026-11-13', '09:00')); } catch (e) { err = e; }
  ok(err && /ne correspond pas/.test(err.message) && W.encaisse() === 0 && W.factures.every(f => f.supprimee), 'total de facture différent du calcul (taxe) : rien encaissé, brouillon supprimé', err && err.message);
  // ── remboursement dans un virement négatif : vient en déduction
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); W.virement('po_neg', '2026-11-03', [remb(4000)]);
  r = await W.run(H('2026-11-13', '09:00')); ok(r.total === 688 - 280 && r.facture.paye && W.postes.some(p => p.amount === -280), 'virement de régularisation (remboursement de 40 €) : 2,80 € déduits', r);
  // ── moins de 0,50 € : reporté, puis facturé avec le virement suivant
  W = monde(); W.virement('po_1', '2026-11-02', [don(500, 30)]); r = await W.run(H('2026-11-13', '09:00')); ok(r.rien && /0,50/.test(r.rien) && !W.factures.length, 'commission de 0,33 € : reportée', r);
  W.virement('po_2', '2026-11-12', [don(10000, 175)]); r = await W.run(H('2026-11-14', '09:00')); ok(r.facture && r.total === 33 + 688 && r.virements.length === 2, '… puis facturée avec le virement suivant (7,21 €)', r);
  // ── gros rattrapage : par lots de 60, tout est facturé une seule fois
  W = monde(); let somme = 0; for (let i = 0; i < 130; i++) { const d = new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10); W.virement('po_' + i, d, [don(10000 + i * 100, 175)]); somme += Math.round((10000 + i * 100 - 175) * 0.07); }
  r = await W.run(H('2026-11-13', '09:00')); ok(r.reste === 70 && r.virements.length === 60 && W.postes.length === 1, 'rattrapage de 130 virements : 60 au premier passage (une ligne groupée), 70 restent', [r.reste, W.postes.length]);
  await W.run(H('2026-11-13', '10:00')); r = await W.run(H('2026-11-13', '11:00')); const r4 = await W.run(H('2026-11-13', '12:00'));
  ok(r.reste === 0 && r4.rien && W.factures.length === 3 && W.encaisse() === somme && C.dejaPris(W.factures).size === 130, '3 passages : 130 virements, total exact au centime (' + somme / 100 + ' €), puis plus rien', [W.encaisse(), somme, C.dejaPris(W.factures).size]);
  ok(Object.values(W.factures[0].metadata).every(v => String(v).length <= 500), 'liste des virements découpée pour tenir dans les limites de Stripe');
  // ── deux passages au même moment : une seule facture
  W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); await Promise.all([W.run(H('2026-11-13', '09:00')), C.encaisser({ stripe: W.asso, stripe2: W.moi, maintenant: H('2026-11-13', '09:00') + 500 })]);
  ok(W.factures.length === 1 && W.postes.length === 1 && W.encaisse() === 688, 'deux passages simultanés : une facture, une ligne, un paiement', [W.factures.length, W.postes.length]);
  // ── clés de modes différents : refus
  process.env.STRIPE_COMMISSION_KEY = 'rk_live_x'; W = monde(); W.virement('po_1', '2026-11-02', [don(10000, 175)]); r = await W.run(H('2026-11-13', '09:00')); ok(r.ok === false && /même mode/.test(r.error) && !W.factures.length, 'une clé de test et une clé réelle : refus, rien créé', r);
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
