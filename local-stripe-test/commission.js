// Commission du prestataire technique — MODE À BLANC : calcul et relevé seulement.
// Lecture seule sur le compte Stripe de l'association (mouvements de solde). Aucune facture, aucun prélèvement, rien n'est écrit nulle part.
//
// Règle : commission = TAUX % du NET réellement encaissé sur la période,
//         net = dons encaissés − frais Stripe − remboursements − litiges perdus (+ litiges regagnés).
// Les virements du solde vers la banque (payout) et les mouvements internes ne comptent pas.
// Les dons hors Stripe (chèque, virement, espèces) ne sont pas dans Stripe : ils ne comptent pas.

const TAUX = Math.max(0, Math.min(100, Number(process.env.COMMISSION_TAUX || 7)));
const CLIENT = process.env.STRIPE_COMMISSION_CLIENT || 'cus_VbtVLcPE714MbD';   // l'association, cliente sur le compte Stripe du prestataire (identifiant non secret) — servira à l'étape « facture »

// types de mouvements Stripe qui entrent dans la base de calcul
const ENTREES = new Set(['charge', 'payment']);
const SORTIES = new Set(['refund', 'payment_refund', 'payment_failure_refund', 'refund_failure', 'payment_reversal']);
const LITIGES = new Set(['adjustment']);   // litige ouvert (débit) ou regagné (crédit)
const HORS_BASE = new Set(['payout', 'payout_cancel', 'payout_failure', 'transfer', 'transfer_cancel', 'transfer_failure', 'transfer_refund', 'topup', 'topup_reversal', 'reserve_transaction', 'reserved_funds', 'stripe_fee', 'stripe_fx_fee', 'tax_fee', 'network_cost', 'contribution', 'application_fee', 'application_fee_refund', 'advance', 'advance_funding', 'anticipation_repayment', 'connect_collection_transfer', 'issuing_authorization_hold', 'issuing_authorization_release', 'issuing_dispute', 'issuing_transaction', 'payment_network_reserve_hold', 'payment_network_reserve_release', 'climate_order_purchase', 'climate_order_refund', 'payment_unreconciled']);

const parisJour = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
// minuit, heure de Paris, pour une date AAAA-MM-JJ → instant UTC (gère heure d'été / d'hiver)
function minuitParis(jour) {
  const approx = Date.parse(jour + 'T00:00:00Z');
  for (const dec of [-2, -1]) { const t = approx + dec * 3600000; if (new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T').startsWith(jour + 'T00:00:00')) return t; }
  return approx - 3600000;
}
const lendemain = jour => { const d = new Date(jour + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// période = la SEMAINE (du lundi au dimanche, bornes incluses) qui contient un jour donné : la commission est réglée chaque semaine
function semaine(jour) {
  const d = new Date(jour + 'T12:00:00Z'), n = (d.getUTCDay() + 6) % 7;   // 0 = lundi
  const lun = new Date(d); lun.setUTCDate(d.getUTCDate() - n); const dim = new Date(lun); dim.setUTCDate(lun.getUTCDate() + 6);
  return { du: lun.toISOString().slice(0, 10), au: dim.toISOString().slice(0, 10) };
}
function semainePrecedente(p) { const d = new Date(p.du + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return semaine(d.toISOString().slice(0, 10)); }

// Calcul pur, à partir des mouvements de solde Stripe (montants en centimes). Aucune estimation : fee et net sont ceux de Stripe.
function calculer(mouvements, taux = TAUX) {
  const lignes = [], ignores = {}, inconnus = {};
  let brut = 0, frais = 0, rembourse = 0, litiges = 0, net = 0, nbDons = 0;
  for (const m of mouvements) {
    if (m.currency && String(m.currency).toLowerCase() !== 'eur') { inconnus['devise ' + m.currency] = (inconnus['devise ' + m.currency] || 0) + 1; continue; }
    const type = String(m.type || '');
    let genre = ENTREES.has(type) ? 'don' : SORTIES.has(type) ? 'remboursement' : LITIGES.has(type) ? 'litige' : null;
    if (!genre) { if (HORS_BASE.has(type)) ignores[type] = (ignores[type] || 0) + 1; else inconnus[type] = (inconnus[type] || 0) + 1; continue; }
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0), n = Math.round(Number(m.net) || 0);
    if (genre === 'don') { brut += a; nbDons++; } else if (genre === 'remboursement') rembourse += a; else litiges += a;
    frais += f; net += n;
    lignes.push({ id: m.id, at: new Date((m.created || 0) * 1000).toISOString(), jour: parisJour((m.created || 0) * 1000), genre, description: String(m.description || '').slice(0, 140), brut: a, frais: f, net: n });
  }
  lignes.sort((x, y) => x.at.localeCompare(y.at));
  const base = net, commission = base > 0 ? Math.round(base * taux / 100) : 0;
  // contrôle : la somme des lignes doit redonner exactement le net (au centime)
  const controle = brut + rembourse + litiges - frais === net;
  return { taux, nbDons, nbLignes: lignes.length, brut, frais, rembourse, litiges, net, base, commission, resteAssociation: net - commission, controle, ignores, inconnus, lignes };
}

async function mouvementsStripe(stripe, du, au) {   // bornes incluses, jours de Paris
  const gte = Math.floor(minuitParis(du) / 1000), lt = Math.floor(minuitParis(lendemain(au)) / 1000), out = [];
  for await (const m of stripe.balanceTransactions.list({ created: { gte, lt }, limit: 100 })) { out.push(m); if (out.length > 20000) throw new Error('trop de mouvements sur la période'); }
  return out;
}

// Relevé de la semaine écoulée, en texte, en HTML et en CSV (pièce jointe). Aucune donnée de donateur : dates, libellés Stripe, montants.
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const jourLong = j => new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function releveMail(p, r, live, rattrapage) {
  const titre = rattrapage ? `Rattrapage : période du ${jourLong(p.du)} au ${jourLong(p.au)}` : `Semaine du ${jourLong(p.du)} au ${jourLong(p.au)}`, tx = String(r.taux).replace('.', ',');
  const L = [['Dons encaissés (' + r.nbDons + ')', eur(r.brut)], ['− Frais Stripe', '− ' + eur(r.frais)]];
  if (r.rembourse) L.push(['− Remboursements', '− ' + eur(-r.rembourse)]);
  if (r.litiges) L.push([r.litiges < 0 ? '− Litiges' : '+ Litiges regagnés', (r.litiges < 0 ? '− ' : '+ ') + eur(Math.abs(r.litiges))]);
  L.push(['= Net encaissé par l\'association', eur(r.net)], ['× ' + tx + ' % = Commission', eur(r.commission)]);
  const alertes = [];
  if (!r.controle) alertes.push('CONTRÔLE EN ÉCHEC : la somme des lignes ne redonne pas le net. Ne rien facturer sur cette base.');
  if (Object.keys(r.inconnus).length) alertes.push('Mouvements non reconnus, donc non comptés : ' + Object.entries(r.inconnus).map(([k, n]) => k + ' (' + n + ')').join(', '));
  if (r.net < 0) alertes.push('Semaine négative (plus de remboursements que de dons) : commission de 0 €.');
  if (!live) alertes.push('Compte Stripe de TEST : ce ne sont pas de vrais dons.');
  const subject = `${live ? '' : '[TEST] '}Commission — ${titre.toLowerCase()} : ${eur(r.commission)}`;
  const text = `${titre}\n\n` + L.map(x => x[0] + ' : ' + x[1]).join('\n') + `\n\nMode à blanc : aucune facture créée, aucun prélèvement.\n` + (alertes.length ? '\n' + alertes.map(x => '⚠ ' + x).join('\n') + '\n' : '') + `\nContrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).`;
  const e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px"><h2 style="color:#1f6a72;margin:0 0 4px">Relevé de commission</h2><p style="margin:0 0 14px;color:#6b7280">${e(titre)}</p><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">` + L.map((x, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[0])}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[1])}</td></tr>`).join('') + `</table><p style="margin:14px 0 0;padding:10px 12px;background:#fff9ea;border:1px solid #f5d48a;border-radius:8px;font-size:13px;color:#7a5a10"><b>Mode à blanc.</b> Aucune facture créée, aucun prélèvement.</p>` + alertes.map(x => `<p style="margin:8px 0 0;font-size:13px;color:#b45309">⚠ ${e(x)}</p>`).join('') + `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Contrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Frais et net sont ceux appliqués par Stripe. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).</p></div>`;
  const q = s => '"' + String(s).replace(/"/g, '""') + '"', n = c => (c / 100).toFixed(2).replace('.', ',');
  const csv = '\ufeff' + ['Date;Heure;Mouvement;Libellé;Montant;Frais;Net;Identifiant Stripe'].concat(r.lignes.map(l => [l.jour, new Date(l.at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }), l.genre, q(l.description), n(l.brut), n(l.frais), n(l.net), l.id].join(';'))).concat(['', ';;;' + q('Net') + ';;;' + n(r.net), ';;;' + q('Commission ' + tx + ' %') + ';;;' + n(r.commission)]).join('\r\n');
  return { subject, text, html, csv, fichier: `commission_${p.du}_${p.au}.csv` };
}

function monter(app, { stripe, adminOk, mailer, load, save }) {
  // Appelé chaque lundi par le serveur du site : envoie au prestataire le relevé de la semaine écoulée (lundi → dimanche). Une seule fois par semaine.
  app.post('/api/admin/commission/envoyer', async (req, res) => {
    if (!adminOk(req, res)) return;
    try {
      const to = String(process.env.COMMISSION_EMAIL || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return res.json({ ok: true, envoye: false, raison: 'COMMISSION_EMAIL non renseigné' });
      if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
      // période au choix (rattrapage des dons reçus avant la mise en place du relevé hebdomadaire) : { du, au } ; sinon la semaine écoulée
      const b = req.body || {}, bon = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')), rattrapage = bon(b.du) && bon(b.au) && b.du <= b.au;
      if (rattrapage && (Date.parse(b.au) - Date.parse(b.du)) / 86400000 > 370) return res.status(400).json({ error: 'Période trop longue (un an au plus)' });
      const p = rattrapage ? { du: b.du, au: b.au } : semainePrecedente(semaine(parisJour(Date.now()))), d = load();
      if (!rattrapage && d.commission && d.commission.dernierReleve === p.du && !b.forcer) return res.json({ ok: true, envoye: false, raison: 'déjà envoyé pour la semaine du ' + p.du });
      const live = /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), r = calculer(await mouvementsStripe(stripe, p.du, p.au)), m = releveMail(p, r, live, rattrapage);
      const env = await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text, attachments: [{ name: m.fichier, content: Buffer.from(m.csv, 'utf8').toString('base64') }] });   // format attendu par l'envoi Brevo : nom + contenu en base64
      if (!(env && (env.sent === true || (env.simulated && mailer.isFake && mailer.isFake(to))))) return res.json({ ok: true, envoye: false, raison: 'e-mail non envoyé' + (env && env.reason ? ' (' + env.reason + ')' : '') });   // rien n'est noté : nouvel essai plus tard
      const d2 = load(); d2.commission = rattrapage ? { ...(d2.commission || {}), rattrapage: { du: p.du, au: p.au, envoyeLe: new Date().toISOString(), net: r.net, commission: r.commission } } : { ...(d2.commission || {}), dernierReleve: p.du, envoyeLe: new Date().toISOString() }; save(d2);
      res.json({ ok: true, envoye: true, rattrapage, periode: p, nbDons: r.nbDons, commission: r.commission, net: r.net, controle: r.controle, mail: true });
    } catch (e) { console.error('commission/envoyer', e.message); res.status(502).json({ error: e.message }); }
  });

  // CRM → relevé d'une période (par défaut : la semaine en cours) et rappel des périodes précédentes
  app.get('/api/admin/commission', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
      const auj = parisJour(Date.now());
      let p = ok(req.query.du) && ok(req.query.au) && req.query.du <= req.query.au ? { du: req.query.du, au: req.query.au } : semaine(auj);
      if ((Date.parse(p.au) - Date.parse(p.du)) / 86400000 > 370) return res.status(400).json({ error: 'Période trop longue (un an au plus)' });
      const releve = calculer(await mouvementsStripe(stripe, p.du, p.au));
      // six semaines précédentes, en résumé (sans le détail des lignes)
      const precedentes = []; let q = semaine(p.du);
      if (req.query.historique !== '0') for (let i = 0; i < 6; i++) { q = semainePrecedente(q); const r = calculer(await mouvementsStripe(stripe, q.du, q.au)); precedentes.push({ du: q.du, au: q.au, nbDons: r.nbDons, brut: r.brut, frais: r.frais, rembourse: r.rembourse, litiges: r.litiges, net: r.net, commission: r.commission, controle: r.controle }); }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ mode: 'a-blanc', rythme: 'hebdomadaire', periode: p, enCours: p.au >= auj, client: CLIENT, live: /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), ...releve, precedentes });
    } catch (e) { console.error('commission', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { releveMail, calculer, semaine, semainePrecedente, minuitParis, mouvementsStripe, monter, TAUX, CLIENT };
