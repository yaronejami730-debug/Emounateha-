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
  { const mp = V.mailVirement(P('po_1', 98000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }, { prestataire: 6860 });
    ok(/Frais bancaires retenus par Stripe : − 20,00 €/.test(mp.text) && /Frais prestataire[^\n]* : − 68,60 €/.test(mp.text) && /= Reste pour l'association : 911,40 €/.test(mp.text) && /Frais prestataire/.test(mp.html) && /Frais prestataire/.test(mp.pdfHtml) && /Frais prestataire/.test(V.csvVirement(P('po_1', 98000), { brut: 100000, frais: 2000 }, [], 6860)) && /= Viré sur le compte bancaire : 980,00 €/.test(mp.text), 'frais Stripe ET frais prestataire affichés (e-mail, PDF, CSV), avec le reste pour l\'association', mp.text); }
  m = V.mailVirement(P('po_2', 90000), { dons: 2, brut: 100000, frais: 2000, rembourse: 0, autres: 0, net: 98000 }); ok(/Solde reporté ou mouvement hors dons : − 80,00 €/.test(m.text), 'écart entre dons et virement : signalé, pas masqué', m.text);
  m = V.mailVirement(P('po_3', 5000, { status: 'failed', failure_message: 'Compte clôturé' }), null, { echec: true }); ok(/REFUSÉ/.test(m.subject) && /Compte clôturé/.test(m.text), 'virement refusé : e-mail d\'alerte avec le motif', m.subject);
  // point d'entrée : faux serveur, faux Stripe, faux e-mails
  const routes = {}, app = { post: (p, f) => routes[p] = f }; let data = { receipts: {} }, mails = [], liste = [P('po_ancien', 12000, { status: 'paid' })], panne = false, autorise = true, ecritures = 0, heure = 20, chabbatEnCours = false, veille = false, soldeLus = 0, smsEnvoyes = [], smsPanne = false;
  const stripe = { balance: { retrieve: async () => { soldeLus++; return { available: [{ currency: 'eur', amount: 500 }] }; } }, payouts: { list: async o => ({ data: liste.slice() }) }, balanceTransactions: { list: o => (async function* () { if (o.available_on) { yield { type: 'charge', net: 98000, currency: 'eur' }; return; } yield { type: 'payout', amount: -1, fee: 0 }; yield { type: 'charge', amount: 100000, fee: 2000 }; })() } };
  const mailer = { ADMIN_EMAIL: () => 'admin@exemple.com', send: async x => { if (panne) throw new Error('Brevo en panne'); mails.push(x); return { sent: true }; }, sendSms: async x => { if (smsPanne) throw new Error('Brevo SMS en panne'); smsEnvoyes.push(x); return { sent: true }; } };
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  let pdfKo = false; V.monter(app, { peutEnvoyer: async () => !chabbatEnCours, peutSms: () => heure >= 7 && heure < 22, heureVeille: async () => veille, pdfTampon: async h => { if (pdfKo) throw new Error('navigateur indisponible'); return Buffer.from('%PDF-essai ' + h.length); }, stripe, mailer, adminOk: (q, r) => { if (!autorise) r.status(401).json({}); return autorise; }, load: () => JSON.parse(JSON.stringify(data)), save: d => { data = d; ecritures++; } });
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
  // ---- envoi dès que Stripe lance le virement (comme avant le 19 nov), sauf Chabbat ; SMS jamais la nuit (demande de Yarone, 20 nov 2026)
  { const nb = mails.length; heure = 2; liste.unshift(P('po_nuit', 31000)); r = await appel();
    ok(mails.length === nb + 1 && /310,00 €/.test(mails[nb].subject) && data.virements.vus.po_nuit === 'vu', 'à 2 h du matin : l\'e-mail part tout de suite, avant l\'argent (plus d\'attente jusqu\'à 19 h)', [r.corps, mails.map(x => x.subject).slice(-1)]);
    r = await appel(); ok(mails.length === nb + 1, 'pas de second e-mail');
    chabbatEnCours = true; liste.unshift(P('po_chabbat', 32000)); r = await appel();
    ok(mails.length === nb + 1 && r.corps.envoyes === 0 && !data.virements.vus.po_chabbat, 'pendant Chabbat : le virement « en cours » n\'est PAS envoyé et reste à notifier', r.corps);
    liste.unshift(P('po_refuse', 6000, { status: 'failed', failure_code: 'account_closed' })); r = await appel();
    ok(mails.length === nb + 2 && /REFUSÉ/.test(mails[nb + 1].subject), 'virement refusé par la banque : alerte immédiate', mails.map(x => x.subject).slice(-1));
    chabbatEnCours = false; r = await appel(); ok(mails.length === nb + 3 && /320,00 €/.test(mails[nb + 2].subject) && data.virements.vus.po_chabbat === 'vu', 'après la sortie de Chabbat : l\'e-mail en attente part', mails.map(x => x.subject).slice(-1));
    ok(smsEnvoyes.length === 0, 'mode test (clé sk_test) : aucun SMS réel envoyé'); }
  { process.env.STRIPE_SECRET_KEY = 'sk_live_x'; const nbM = mails.length, nbS = smsEnvoyes.length;
    heure = 2; liste.unshift(P('po_sms', 98000, { arrival_date: t('2026-11-20') })); r = await appel();
    ok(mails.length === nbM + 1 && smsEnvoyes.length === nbS && r.corps.detail[0].sms === 'à 7 h' && data.virements.smsAttente.po_sms, 'à 2 h (mode réel) : e-mail tout de suite, SMS gardé pour 7 h (pas de SMS la nuit)', r.corps);
    heure = 6; r = await appel(); ok(smsEnvoyes.length === nbS && mails.length === nbM + 1, 'à 6 h : toujours pas de SMS, pas de second e-mail');
    heure = 7; r = await appel();
    ok(mails.length === nbM + 1 && smsEnvoyes.length === nbS + 1 && smsEnvoyes[nbS].to === '0669670770' && smsEnvoyes[nbS].tag === 'virement' && /980,00 EUR/.test(smsEnvoyes[nbS].text) && /20 novembre/.test(smsEnvoyes[nbS].text) && smsEnvoyes[nbS].text.length <= 160 && !data.virements.smsAttente.po_sms, 'à 7 h : le SMS part au 06 69 67 07 70, 160 caractères au plus', [smsEnvoyes.slice(-1), r.corps]);
    r = await appel(); ok(smsEnvoyes.length === nbS + 1, 'pas de second SMS');
    heure = 12; liste.unshift(P('po_jour', 4000)); r = await appel(); ok(mails.length === nbM + 2 && smsEnvoyes.length === nbS + 2 && r.corps.detail[0].sms === true, 'en journée : e-mail et SMS partent ensemble', r.corps);
    heure = 3; chabbatEnCours = false; liste.unshift(P('po_veilleChabbat', 3000)); r = await appel(); chabbatEnCours = true; heure = 10; r = await appel();
    ok(smsEnvoyes.length === nbS + 2 && data.virements.smsAttente.po_veilleChabbat, 'SMS en attente : pas envoyé pendant Chabbat'); chabbatEnCours = false; r = await appel(); ok(smsEnvoyes.length === nbS + 3, 'SMS en attente : envoyé après la sortie');
    smsPanne = true; heure = 12; liste.unshift(P('po_smspanne', 5000)); r = await appel();
    ok(mails.length === nbM + 4 && data.virements.vus.po_smspanne === 'vu' && r.corps.detail[0].sms === false, 'SMS en panne : l\'e-mail part quand même, virement noté comme vu (pas de doublon d\'e-mail)', r.corps); smsPanne = false;
    liste.unshift(P('po_refuse2', 7000, { status: 'failed', failure_code: 'account_closed' })); const nbS2 = smsEnvoyes.length; r = await appel(); ok(smsEnvoyes.length === nbS2, 'virement refusé : pas de SMS « en cours »');
    // annonce de la veille à 19 h : e-mail + SMS « virement prévu demain, environ X € » (décision de Yarone, 20 nov 2026)
    const nbM3 = mails.length, nbS3 = smsEnvoyes.length; r = await appel(); ok(mails.length === nbM3 && soldeLus === 0, 'avant l\'heure de la veille : aucune prévision, Stripe pas interrogé');
    veille = true; panne = true; r = await appel(); panne = false; ok(Object.keys(data.virements.previsions || {}).length === 0, 'e-mail de prévision en panne : rien de noté, nouvel essai ensuite', data.virements.previsions);
    r = await appel(); const pv = Object.entries(data.virements.previsions || {}), mp = mails[nbM3] || {}, sp = smsEnvoyes[nbS3] || {};
    ok(pv.length === 1 && pv[0][1].montant === 98500 && pv[0][1].annonce === true && mails.length === nbM3 + 1 && /Virement prévu demain : environ 985,00 €/.test(mp.subject) && /prévision/.test(mp.text) && !(mp.attachments || []).length, 'veille à 19 h : e-mail « virement prévu demain, environ 985,00 € » (solde disponible + dons libérés demain), sans pièce jointe', [mp.subject, data.virements.previsions]);
    ok(smsEnvoyes.length === nbS3 + 1 && sp.to === '0669670770' && /environ 985,00 EUR prevu demain/.test(sp.text) && sp.text.length <= 160, 'veille à 19 h : SMS de prévision, 160 caractères au plus', sp);
    r = await appel(); ok(mails.length === nbM3 + 1 && smsEnvoyes.length === nbS3 + 1, 'prévision : une seule fois par jour d\'arrivée'); veille = false;
    heure = 12; liste.unshift(P('po_annonce', 98400, { arrival_date: Date.parse(pv[0][0] + 'T00:00:00Z') / 1000 })); r = await appel();
    ok(mails.length === nbM3 + 2 && /984,00 €/.test(mails[nbM3 + 1].subject) && smsEnvoyes.length === nbS3 + 1 && data.virements.previsions[pv[0][0]].reel === 98400, 'le lendemain : relevé exact par e-mail, PAS de second SMS, écart prévision / réel noté', [r.corps, data.virements.previsions]);
    { const z = V.mailPrevision({ pour: '2026-11-20', montant: 30330 }); ok(/vendredi 20 novembre 2026/.test(z.text) && /environ 303,30 €/.test(z.subject) && !/commission/i.test(z.text + z.html), 'texte de la prévision : jour d\'arrivée en clair, montant « environ »', z.text); }
    const pr = await V.prevision({ balance: { retrieve: async () => ({ available: [{ currency: 'eur', amount: 1000 }, { currency: 'usd', amount: 999 }] }) }, balanceTransactions: { list: o => (async function* () { yield { type: 'charge', net: 5000, currency: 'eur' }; yield { type: 'payout', net: -700, currency: 'eur' }; yield { type: 'refund', net: -300, currency: 'eur' }; })() } }, Date.parse('2026-11-19T19:00:00+01:00'));
    ok(pr.pour === '2026-11-20' && pr.montant === 5700 && pr.dejaDisponible === 1000 && pr.libereDemain === 4700, 'prévision : jour d\'arrivée = demain, euros seulement, virements exclus, remboursements déduits', pr);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; }
  autorise = false; r = await appel(); ok(r.code === 401, 'sans signature du serveur du site : refusé');
  const src = require('fs').readFileSync(require('path').join(__dirname, '../virements.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/payouts\.(create|update|cancel|reverse)|transfers\.|refunds\./.test(src), 'lecture seule : aucun virement créé, modifié ou annulé');
  console.log(pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})();
