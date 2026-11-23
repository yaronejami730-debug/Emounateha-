// Relevé détaillé de chaque virement de l'association (PDF résumé, PDF détail, Excel, Google Sheet) : essais sur des mouvements inventés.
// Aucun appel à Stripe, aucun e-mail réel, aucun envoi vers Google.
const R = require('../releve.js'), V = require('../virements.js'), X = require('../xlsx.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 600)); };
const t0 = Math.floor(Date.parse('2026-11-24T10:00:00Z') / 1000);
const mv = (id, type, amount, fee, src, description, k = 0) => ({ id, type, amount, fee, net: amount - fee, created: t0 + k * 60, currency: 'eur', source: src, description });
const recus = {
  pi_h1: { nom: 'Sarah Lévy', form: { prenom: 'Sarah', nom: 'Lévy' }, donorEmail: 'sarah@exemple.fr', numero: 'A2026/0001', affectation: 'Hanouka : Diffusion de la lumière, Beignets et cadeaux' },
  pi_h2: { nom: 'David Cohen', form: { prenom: 'David', nom: 'Cohen' }, donorEmail: 'david@exemple.fr', numero: 'A2026/0002', besoin: 'hanouka', affectation: 'Campagne de Hanouka : Une lumière dans chaque foyer' },
  pi_c: { nom: 'Rivka T.', form: { prenom: 'Rivka', nom: 'T.' }, donorEmail: 'rivka@exemple.fr', numero: 'A2026/0003', besoin: 'club-hai', affectation: "Club 'Haï : Chaque mois, à leurs côtés" },
  pi_b1: { nom: 'Yarone J.', form: { prenom: 'Yarone', nom: 'J.' }, donorEmail: 'y@exemple.fr', numero: 'A2026/0004', besoin: 'famille-cohen', affectation: 'Besoin : Famille Cohen' },
  pi_b2: { nom: 'Léa', form: { prenom: 'Léa', nom: '' }, donorEmail: 'lea@exemple.fr', numero: 'A2026/0005', besoin: 'famille-cohen', affectation: 'Besoin : Famille Cohen' },
  pi_g: { nom: 'Boulangerie B. SAS', donorEmail: 'compta@b.fr', numero: 'A2026/0006', type: 'entreprise', affectation: 'Là où le besoin est le plus grand' },
  in_m: { nom: 'Moché Z.', form: { prenom: 'Moché', nom: 'Z.' }, donorEmail: 'moche@exemple.fr', numero: 'A2026/0007', affectation: 'Colis de Chabbat' }
};
const MV = [
  { id: 'txn_po', type: 'payout', amount: -99999, fee: 0 },
  mv('txn_h1', 'charge', 5000, 100, { id: 'ch_h1', payment_intent: 'pi_h1' }, 'Don Émounatéha — Hanouka : Diffusion de la lumière', 1),
  mv('txn_h2', 'charge', 3600, 79, { id: 'ch_h2', payment_intent: { id: 'pi_h2' } }, '', 2),
  mv('txn_c', 'charge', 1800, 52, { id: 'ch_c', payment_intent: 'pi_c' }, '', 3),
  mv('txn_b1', 'charge', 5000, 105, { id: 'ch_b1', payment_intent: 'pi_b1' }, '', 4),
  mv('txn_b2', 'charge', 3000, 70, { id: 'ch_b2', payment_intent: 'pi_b2' }, '', 5),
  mv('txn_b3', 'charge', 2000, 55, { id: 'ch_b3', payment_intent: 'pi_b3', billing_details: { name: 'Ruth Assouline', email: 'ruth@exemple.fr' } }, 'Don Émounatéha — Besoin : Loyer de Myriam (loyer-myriam)', 6),
  mv('txn_g', 'charge', 18000, 295, { id: 'ch_g', payment_intent: 'pi_g' }, '', 7),
  mv('txn_m', 'charge', 1800, 52, { id: 'ch_m', invoice: 'in_m', payment_intent: 'pi_m' }, 'Subscription update', 8),
  mv('txn_inc', 'charge', 2500, 63, { id: 'ch_inc', payment_intent: 'pi_inc', billing_details: { name: 'Inconnu Total', email: 'x@exemple.fr' } }, 'Paiement sans libellé', 9),
  mv('txn_rf', 'refund', -3000, 0, { id: 're_1', payment_intent: 'pi_b2' }, 'REFUND FOR CHARGE', 10),
  mv('txn_dp', 'adjustment', -1800, 1500, { id: 'dp_1', payment_intent: 'pi_c' }, 'Chargeback withdrawal', 11),
  mv('txn_fee', 'stripe_fee', -200, 0, { id: 'fee_1' }, 'Billing - Usage Fee', 12)
];
const somme = MV.filter(m => m.type !== 'payout').reduce((a, m) => a + m.net, 0);
const P = (id, amount) => ({ id, amount, currency: 'eur', status: 'paid', created: t0 + 86400, arrival_date: t0 + 2 * 86400 });

(async () => {
  // ── modèle : rien d'oublié, classement, totaux au centime ──
  const M = R.modele(P('po_1', somme), MV, recus, { taux: 7 });
  ok(M.lignes.length === MV.length - 1 && M.lignes.every(l => MV.some(m => m.id === l.mouvement)), 'chaque mouvement du virement a sa ligne (sauf le virement lui-même)', M.lignes.length);
  const types = g => g.map(x => x.type + ':' + x.L.length).sort().join(' | ');
  ok(types(M.general) === ["Club 'Haï:2", 'Colis de Chabbat:1', "Don non identifié (voir l'ID Stripe):1", 'Hanouka:2', 'Là où le besoin est le plus grand:1'].join(' | '), 'dons généraux par type : fête et campagne → Hanouka, Club \'Haï (avec son litige), Colis de Chabbat (don mensuel retrouvé par la facture), inconnu signalé', types(M.general));
  ok(types(M.besoins) === ['Famille Cohen:3', 'Loyer de Myriam:1'].join(' | '), 'cagnottes : par le reçu, ou par le libellé Stripe ; le remboursement reste dans sa cagnotte', types(M.besoins));
  ok(M.autres.length === 1 && M.autres[0].type === 'Frais Stripe divers' && M.autres[0].L[0].net === -200, 'frais Stripe hors don : ligne à part, pas cachés', M.autres);
  const coh = M.besoins.find(g => g.type === 'Famille Cohen');
  ok(coh.paiements === 2 && coh.L.some(l => l.genre === 'Remboursement') && coh.L.reduce((a, l) => a + l.netStripe, 0) === 4895 + 2930 - 3000, 'Famille Cohen : 2 paiements + 1 remboursement, net Stripe exact', coh);
  const base = MV.filter(m => ['charge', 'refund', 'adjustment'].includes(m.type)).reduce((a, m) => a + m.net, 0);
  ok(M.totaux.com === Math.round(base * 0.07) && M.lignes.filter(l => l.categorie === 'autre').every(l => l.com === 0), 'frais 7 % : même base que la commission (dons, remboursements, litiges), répartis sans perdre un centime', [M.totaux.com, Math.round(base * 0.07)]);
  const M2 = R.modele(P('po_1', somme), MV, recus, { taux: 7, commission: 1234 });
  ok(M2.totaux.com === 1234, 'frais 7 % : la commission réelle donnée est répartie exactement', M2.totaux.com);
  ok(M.totaux.ecart === 0 && M.complet && M.totaux.net === somme - M.totaux.com && M.totaux.brut - M.totaux.frais === somme, 'sommes : brut − frais Stripe = virement ; − 7 % = net ; aucun écart', M.totaux);
  const g = M.general.find(x => x.type === 'Là où le besoin est le plus grand').L[0], inc = M.general.find(x => /non identifié/.test(x.type)).L[0], my = M.besoins.find(x => x.type === 'Loyer de Myriam').L[0];
  ok(g.nom === 'Boulangerie B. SAS' && g.email === 'compta@b.fr' && g.paiement === 'pi_g' && g.recu === 'A2026/0006' && inc.nom === 'Inconnu Total' && inc.paiement === 'pi_inc' && my.nom === 'Ruth Assouline' && my.email === 'ruth@exemple.fr', 'donateur, e-mail, ID de paiement et n° de reçu : par le reçu, sinon par Stripe', [g, inc, my]);
  { const L2 = R.modele(P('po_m', 0), [mv('a', 'charge', 1000, 40, { id: 'ch_a', payment_intent: 'pi_a', payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242', wallet: { type: 'apple_pay' } } } }, 'Don — Colis de Chabbat'), mv('b', 'charge', 1800, 52, { id: 'ch_b', payment_intent: 'pi_b', invoice: 'in_b', payment_method_details: { type: 'sepa_debit' } }, ''), mv('c', 'charge', 2000, 60, { id: 'ch_c', payment_intent: 'pi_c2', payment_method_details: { type: 'card', card: { brand: 'mastercard', last4: '0987' } } }, '')], { in_b: { nom: 'X', mensuel: true, echeance: 3, affectation: "Club 'Haï : x" }, pi_c2: { nom: 'Y SAS', type: 'entreprise', affectation: 'Vêtements et soins' } }, { taux: 7 }).lignes;
    const [a, b, c] = L2; const det = R.detailCorps(R.modele(P('po_m', 0), [mv('a', 'charge', 1000, 40, { id: 'ch_a', payment_intent: 'pi_a', payment_method_details: { type: 'paypal' } }, 'Don — Colis de Chabbat')], {}, { taux: 7 }));
    ok(a.moyen === 'Apple Pay' && a.frequence === 'Ponctuel' && b.moyen === 'Prélèvement SEPA' && b.frequence === 'Mensuel (échéance n°3)' && b.donateurType === 'Particulier' && c.moyen === 'Carte Mastercard ···· 0987' && c.donateurType === 'Entreprise' && /PayPal · Ponctuel/.test(det) && R.tableur(R.modele(P('po_m', 0), [], {}, {})).length > 0 && R.pourSheet(R.modele(P('po_m', 0), [mv('a', 'charge', 1000, 40, { id: 'ch_a', payment_intent: 'pi_a', payment_method_details: { type: 'klarna' } }, '')], {}, {})).paiements[0].moyen === 'Klarna', 'moyen de paiement, fréquence (échéance du mensuel), particulier ou entreprise : dans le détail, l\'Excel et le Sheet', L2); }
  ok(R.typeDon("Pessah : Matsot, Colis alimentaires") === 'Pessah' && R.typeDon("Campagne d'Hanouka : x") === 'Hanouka' && R.typeDon('Vêtements et soins') === 'Vêtements et soins' && R.typeDon('') === '', 'type de don : fête, campagne, action');
  // écart : jamais masqué
  const ME = R.modele(P('po_e', somme + 500), MV, recus, { taux: 7 });
  ok(ME.totaux.ecart === 500 && !ME.complet && /ÉCART À VÉRIFIER/.test(R.sujet(ME)) && /Attention/.test(R.resumeCorps(ME)) && /Écart/.test(R.detailCorps(ME)) && /ÉCART NON RATTACHÉ/.test(R.resumeTexte(ME)), 'écart entre les paiements et le virement : affiché partout (objet, résumé, détail, texte)', ME.totaux);
  // ── documents ──
  const res = R.resumeCorps(M, { pourPdf: true }), det = R.detailCorps(M), txt = R.resumeTexte(M);
  ok(/Dons généraux/.test(res) && /Besoins/.test(res) && /cagnottes personnelles/.test(res) && /Hanouka/.test(res) && /Famille Cohen/.test(res) && /Frais 7 %/.test(res) && /Net pour l&#39;association|Net pour l'association/.test(res) && !/pi_h1/.test(res), 'résumé : dons généraux par type, besoins par cagnotte, frais Stripe et 7 %, pas de liste de paiements', '');
  ok(MV.filter(m => m.type !== 'payout' && m.source && m.source.payment_intent).every(m => det.includes(typeof m.source.payment_intent === 'object' ? m.source.payment_intent.id : m.source.payment_intent)) && /sarah@exemple\.fr/.test(det) && /Sous-total Famille Cohen/.test(det) && /à reverser/.test(det) && /Remboursement/.test(det) && /Litige/.test(det), 'détail : chaque ID de paiement Stripe, e-mail, sous-total par cagnotte « à reverser », remboursements et litiges visibles', '');
  ok(/BESOINS \(cagnottes personnelles\)/.test(txt) && /Famille Cohen \(2 paiements\)/.test(txt) && /Hanouka \(2 paiements\)/.test(txt), 'texte de l\'e-mail : même résumé', txt.slice(0, 500));
  ok(/dont 2 cagnottes/.test(R.sujet(M)) && /^virement_2026-11-26_/.test(R.fichierBase(M)), 'objet et nom des fichiers', [R.sujet(M), R.fichierBase(M)]);
  // ── Excel ──
  const xl = R.tableur(M), s = xl.toString('latin1');
  ok(xl.slice(0, 2).toString() === 'PK' && /xl\/worksheets\/sheet1\.xml/.test(s) && /xl\/worksheets\/sheet2\.xml/.test(s) && xl.toString('utf8').includes('Détail des paiements') && xl.toString('utf8').includes('pi_h1') && xl.toString('utf8').includes('Sous-total Famille Cohen') && xl.toString('utf8').includes('SUMIF('), 'Excel : 2 onglets, chaque ID de paiement, sous-totaux et formules', xl.length);
  ok(X.crc32(Buffer.from('123456789')) === 0xcbf43926 && X.colonne(0) === 'A' && X.colonne(25) === 'Z' && X.colonne(26) === 'AA', 'Excel : somme de contrôle et noms de colonnes justes');
  const piege = R.tableur(R.modele(P('po_x', 1000), [mv('t', 'charge', 1000, 0, { id: 'c', payment_intent: 'pi_x', billing_details: { name: '=HYPERLINK("x")', email: '<a>' } }, 'Don — =1+1')], {}, { taux: 7 })).toString('utf8');
  ok(!/<f>HYPERLINK/.test(piege) && /&lt;a&gt;/.test(piege), 'Excel : un nom de donateur qui ressemble à une formule reste du texte', '');
  // ── Google Sheet ──
  const sh = R.pourSheet(M);
  ok(sh.virement.id === 'po_1' && sh.paiements.length === M.lignes.length && sh.paiements.every(p => p.id && p.type && Number.isInteger(p.net)) && sh.paiements.reduce((a, p) => a + p.net + p.com, 0) === somme, 'Google Sheet : une ligne par mouvement, montants en centimes, total = virement', sh.paiements.length);

  // ── intégration : e-mail + Google Sheet, une seule fois par virement ──
  const routes = {}, app = { post: (p, f) => routes[p] = f }; let data = { receipts: recus, virements: { vus: {} } }, mails = [], posts = [], sheetKo = false;
  const liste = [P('po_a', somme), P('po_b', somme), P('po_c', somme), P('po_d', somme)];
  const stripe = { payouts: { list: async () => ({ data: liste.slice() }) }, balanceTransactions: { list: () => (async function* () { for (const m of MV) yield m; })() } };
  const mailer = { ADMIN_EMAIL: () => 'admin@exemple.com', send: async x => { mails.push(x); return { sent: true }; } };
  process.env.STRIPE_SECRET_KEY = 'sk_live_essai'; process.env.GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/ESSAI-abc_123/exec'; process.env.GOOGLE_SHEET_SECRET = 'secret-essai';
  V.monter(app, { stripe, mailer, adminOk: () => true, peutEnvoyer: async () => true, heureVeille: async () => false, peutSms: () => false, pdfTampon: async (h, o) => Buffer.from('%PDF ' + (o && o.landscape ? 'paysage' : 'portrait')), load: () => JSON.parse(JSON.stringify(data)), save: d => { data = d; },
    sheetPost: async c => { if (sheetKo) throw new Error('Google indisponible'); posts.push(c); return { ok: true } } });
  const appel = async () => { let corps; const res = { status: () => res, json: j => (corps = j, res) }; await routes['/api/admin/virements/verifier']({ body: {} }, res); return corps; };
  let r = await appel();
  ok(mails.length === 4 && mails.every(m => m.attachments.length === 3) && Buffer.from(mails[0].attachments[1].content, 'base64').toString() === '%PDF paysage', '4 virements : 4 e-mails avec résumé, détail (paysage) et tableur', mails.map(m => m.attachments.map(a => a.name)));
  ok(posts.length === 4 && Object.keys(data.virements.sheet).length === 4 && !JSON.stringify(r).includes('sarah@exemple.fr'), 'Google Sheet : les 4 virements écrits ; aucune donnée de donateur dans la réponse', [posts.length, data.virements.sheet]);
  r = await appel(); ok(posts.length === 4 && mails.length === 4, 'ensuite : plus rien à écrire (jamais deux fois le même virement), pas de second e-mail', [posts.length, mails.length]);
  // rattrapage des anciens virements : toute la liste Stripe (pas seulement les 30 derniers), 5 par vérification, y compris ceux d'avant la mise en service
  const anciens = Array.from({ length: 7 }, (_, i) => ({ ...P('po_vieux' + i, somme), status: 'paid' }));
  stripe.payouts.list = o => { const L = [...liste, ...anciens]; if (o && o.expand) return Promise.resolve({ data: liste.slice() }); return { [Symbol.asyncIterator]: async function* () { for (const p of L) yield p; } }; };
  sheetKo = true; r = await appel(); ok(posts.length === 4 && r.erreurs.some(e => /Google Sheet/.test(e)) && !Object.keys(data.virements.sheet).some(k => /vieux/.test(k)), 'Google Sheet en panne : erreur notée, rien de perdu', r.erreurs);
  sheetKo = false; r = await appel(); ok(posts.length === 9 && mails.length === 4, 'rattrapage : 5 anciens virements écrits, sans e-mail', [posts.length, mails.length]);
  r = await appel(); ok(posts.length === 11 && anciens.every(p => data.virements.sheet[p.id]), 'rattrapage : les anciens restants à la vérification suivante, tous écrits', posts.length);
  r = await appel(); ok(posts.length === 11, 'tout est à jour : plus rien n\'est envoyé', posts.length);
  // statut : un virement écrit « en cours » est mis à jour quand il arrive en banque, une seule fois
  const enCours = { ...P('po_route', somme), status: 'in_transit' }; liste.unshift(enCours);
  r = await appel(); const ecrit = posts.filter(p => p.virement && p.virement.id === 'po_route');
  ok(ecrit.length === 1 && ecrit[0].virement.statut === 'in_transit' && !ecrit[0].action && data.virements.sheet.po_route === 'in_transit', 'virement en cours : écrit avec le statut « en cours »', ecrit);
  enCours.status = 'paid'; r = await appel(); r = await appel(); const maj = posts.filter(p => p.action === 'statut');
  ok(maj.length === 1 && maj[0].virement.id === 'po_route' && maj[0].virement.statut === 'paid' && !maj[0].paiements && data.virements.sheet.po_route === 'paid', 'arrivé en banque : statut mis à jour une seule fois, sans réécrire les paiements', maj);
  process.env.STRIPE_SECRET_KEY = 'sk_test_essai'; ok(!V.sheetActif(true) && V.sheetActif(false), 'compte Stripe de test : rien vers le Google Sheet de l\'association');
  delete process.env.GOOGLE_SHEET_URL; ok(!V.sheetActif(false), 'sans adresse de Sheet : inactif');

  console.log(`${pass} ok, ${fail} échec`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
