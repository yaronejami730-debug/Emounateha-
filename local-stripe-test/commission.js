// Commission du prestataire technique : relevé hebdomadaire par e-mail, et encaissement par carte après chaque virement arrivé en banque (voir plus bas).
// Lecture seule sur le compte Stripe de l'association. Les factures sont créées sur le compte Stripe du prestataire, seulement si sa clé est renseignée.
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
const NOTE = process.env.STRIPE_COMMISSION_KEY ? 'Relevé pour information. Le paiement par carte se fait à part, après chaque virement arrivé à la banque de l\'association.' : 'Mode à blanc : aucune facture créée, aucun paiement.';
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
  const text = `${titre}\n\n` + L.map(x => x[0] + ' : ' + x[1]).join('\n') + `\n\n${NOTE}\n` + (alertes.length ? '\n' + alertes.map(x => '⚠ ' + x).join('\n') + '\n' : '') + `\nContrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).`;
  const e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px"><h2 style="color:#1f6a72;margin:0 0 4px">Relevé de commission</h2><p style="margin:0 0 14px;color:#6b7280">${e(titre)}</p><table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">` + L.map((x, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[0])}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;${i >= L.length - 2 ? 'font-weight:bold;' : ''}${i === L.length - 1 ? 'color:#8a6a14;font-size:17px;border-bottom:0;' : ''}">${e(x[1])}</td></tr>`).join('') + `</table><p style="margin:14px 0 0;padding:10px 12px;background:#fff9ea;border:1px solid #f5d48a;border-radius:8px;font-size:13px;color:#7a5a10">${NOTE}</p>` + alertes.map(x => `<p style="margin:8px 0 0;font-size:13px;color:#b45309">⚠ ${e(x)}</p>`).join('') + `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Contrôle au centime : ${r.controle ? 'OK' : 'ÉCHEC'}. Frais et net sont ceux appliqués par Stripe. Détail ligne par ligne en pièce jointe (${r.nbLignes} mouvement(s)).</p></div>`;
  const q = s => '"' + String(s).replace(/"/g, '""') + '"', n = c => (c / 100).toFixed(2).replace('.', ',');
  const csv = '\ufeff' + ['Date;Heure;Mouvement;Libellé;Montant;Frais;Net;Identifiant Stripe'].concat(r.lignes.map(l => [l.jour, new Date(l.at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }), l.genre, q(l.description), n(l.brut), n(l.frais), n(l.net), l.id].join(';'))).concat(['', ';;;' + q('Net') + ';;;' + n(r.net), ';;;' + q('Commission ' + tx + ' %') + ';;;' + n(r.commission)]).join('\r\n');
  return { subject, text, html, csv, fichier: `commission_${p.du}_${p.au}.csv` };
}

// ───────── Encaissement par carte, virement par virement ─────────
// La commission est réglée par carte bancaire (celle que l'association a enregistrée sur le compte Stripe du prestataire), JAMAIS avant que l'argent
// soit arrivé à la banque de l'association : on part des virements de Stripe vers sa banque, et on n'encaisse qu'à partir de 17 h (Paris) LE JOUR D'ARRIVÉE.
// Stripe ne donne que le jour d'arrivée, pas l'heure : les banques créditent en général le matin ; à 17 h l'argent est là, et le plus tôt possible après.
// Base d'un virement = les dons qu'il regroupe − frais Stripe − remboursements − litiges (les mouvements que Stripe rattache à ce virement).
// Rien n'est mémorisé ici : ce qui a déjà été facturé se lit sur les factures du compte du prestataire (aucun risque de compter deux fois si un fichier se perd).
// Deux verrous : la clé STRIPE_COMMISSION_KEY ET COMMISSION_ENCAISSER=oui. S'il en manque un : simulation seulement, rien n'est créé ni encaissé.
const HEURE = Math.max(0, Math.min(23, Number(process.env.COMMISSION_HEURE || 17)));   // heure de Paris, le jour d'arrivée du virement
const MINIMUM = 50;          // en dessous de 0,50 € Stripe refuse un paiement : on attend les virements suivants
const LOT = 60;              // virements traités par passage (le reste au passage suivant)
const DEPUIS = /^\d{4}-\d{2}-\d{2}$/.test(process.env.COMMISSION_DEPUIS || '') ? Math.floor(Date.parse(process.env.COMMISSION_DEPUIS + 'T00:00:00Z') / 1000) : 0;   // par défaut : depuis le tout premier virement
const jourFr = t => new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const estLive = k => /^(sk|rk)_live_/.test(String(k || ''));

// un virement est « échu » quand Stripe le dit payé et qu'il est au moins HEURE h (Paris) le jour de son arrivée en banque (arrival_date = minuit UTC du jour d'arrivée)
function echu(p, maintenant, heure = HEURE) {
  return !!p && p.status === 'paid' && String(p.currency || 'eur').toLowerCase() === 'eur' && Number(p.arrival_date) > 0 && minuitParis(new Date(p.arrival_date * 1000).toISOString().slice(0, 10)) + heure * 3600000 <= maintenant && p.arrival_date >= DEPUIS;
}
// commission d'un virement : peut être négative (virement de régularisation : remboursements) — elle vient alors en déduction des autres
function ligneVirement(p, mouvements, taux = TAUX) {
  const r = calculer(mouvements, taux);
  return { id: p.id, arrivee: p.arrival_date, montantVire: p.amount, nbDons: r.nbDons, brut: r.brut, frais: r.frais, rembourse: r.rembourse, litiges: r.litiges, net: r.net, commission: Math.round(r.net * taux / 100), controle: r.controle, inconnus: Object.keys(r.inconnus) };
}
// virements déjà pris par une facture (brouillon, ouverte, payée ou abandonnée). Une facture ANNULÉE (void) libère ses virements.
function dejaPris(factures) {
  const pris = new Set();
  for (const f of factures) { if (f.status === 'void') continue; for (const [k, v] of Object.entries(f.metadata || {})) if (/^v\d+$/.test(k)) String(v).split(',').forEach(x => x && pris.add(x)); }
  return pris;
}
function metaVirements(ids) { const m = {}; let i = 0, cur = ''; for (const id of ids) { if ((cur + ',' + id).length > 480) { m['v' + i++] = cur; cur = id; } else cur = cur ? cur + ',' + id : id; } if (cur) m['v' + i] = cur; return m; }

async function encaisser({ stripe, stripe2, simuler, maintenant = Date.now(), actif = process.env.COMMISSION_ENCAISSER === 'oui' }) {
  if (!actif) simuler = true;
  const out = { ok: true, mode: stripe2 && !simuler ? 'reel' : 'simulation', taux: TAUX, client: CLIENT };
  let pmSeule = null;
  if (stripe2 && estLive(process.env.STRIPE_SECRET_KEY) !== estLive(process.env.STRIPE_COMMISSION_KEY)) return { ok: false, error: 'Les deux clés Stripe ne sont pas du même mode (test / réel) : rien n\'est fait.' };
  let factures = [];
  if (stripe2) {
    // la carte : celle par défaut du client « association » sur le compte du prestataire
    const c = await stripe2.customers.retrieve(CLIENT, { expand: ['invoice_settings.default_payment_method', 'default_source'] });
    if (!c || c.deleted) return { ok: false, error: 'Client ' + CLIENT + ' introuvable sur le compte Stripe du prestataire.' };
    const pm = c.invoice_settings && c.invoice_settings.default_payment_method, src = c.default_source; let carte = pm && pm.card ? pm.card : src && src.object === 'card' ? src : null, nbCartes = carte ? 1 : 0;
    if (!carte) {   // pas de carte « par défaut » : si le client n'a qu'UNE carte enregistrée, c'est elle ; s'il en a plusieurs, on ne choisit pas à sa place
      const L = (await stripe2.paymentMethods.list({ customer: CLIENT, type: 'card', limit: 5 })).data || []; nbCartes = L.length;
      if (L.length === 1) { carte = L[0].card; pmSeule = L[0].id; }
    }
    out.carte = carte ? { ok: true, marque: carte.brand, fin: carte.last4, expire: String(carte.exp_month).padStart(2, '0') + '/' + carte.exp_year, parDefaut: !pmSeule } : { ok: false, cartesEnregistrees: nbCartes };
    if (!carte && !simuler) return { ...out, ok: false, error: nbCartes ? 'Plusieurs cartes enregistrées et aucune par défaut : rien n\'est fait.' : 'Aucune carte enregistrée pour ce client : rien n\'est fait.' };
    for await (const f of stripe2.invoices.list({ customer: CLIENT, limit: 100 })) { if (f.metadata && f.metadata.commission === '1') factures.push(f); if (factures.length > 5000) break; }
    if (!simuler) {
      // brouillon resté d'un passage interrompu : supprimé, ses virements seront repris proprement
      for (const f of factures.filter(x => x.status === 'draft' && maintenant - x.created * 1000 > 600000)) { await stripe2.invoices.del(f.id); f.status = 'void'; }
      // facture finalisée mais pas encore payée (carte refusée la dernière fois) : nouvel essai ; tant qu'elle n'est pas réglée, on n'en crée pas d'autre
      const ouvertes = factures.filter(x => x.status === 'open'); out.reessais = [];
      for (const f of ouvertes) {
        try { const r = await stripe2.invoices.pay(f.id); f.status = r.status; out.reessais.push({ facture: f.id, numero: r.number, montant: r.amount_paid, paye: r.status === 'paid' }); }
        catch (e) { out.reessais.push({ facture: f.id, numero: f.number, montant: f.amount_due, paye: false, raison: e.message, lien: f.hosted_invoice_url }); }
      }
      if (out.reessais.some(x => !x.paye)) return { ...out, attente: 'facture impayée : nouvel essai au prochain passage, aucune nouvelle facture d\'ici là' };
    }
  }
  const pris = dejaPris(factures), dus = [];
  for await (const p of stripe.payouts.list({ status: 'paid', limit: 100 })) { if (echu(p, maintenant) && !pris.has(p.id)) dus.push(p); if (dus.length > 3000) break; }
  dus.sort((a, b) => a.arrival_date - b.arrival_date);
  const lot = dus.slice(0, LOT), lignes = [], ecartes = [];
  for (const p of lot) {
    if (p.automatic === false) { ecartes.push({ id: p.id, raison: 'virement déclenché à la main : Stripe ne dit pas quels dons il contient, à régler à part' }); continue; }   // Stripe ne rattache les mouvements qu'aux virements automatiques
    const mv = []; for await (const m of stripe.balanceTransactions.list({ payout: p.id, limit: 100 })) { mv.push(m); if (mv.length > 20000) throw new Error('trop de mouvements dans le virement ' + p.id); }
    const l = ligneVirement(p, mv);
    if (!l.controle) ecartes.push({ id: p.id, raison: 'contrôle au centime en échec' }); else lignes.push(l);   // base douteuse : jamais facturée, signalée
  }
  const total = lignes.reduce((a, l) => a + l.commission, 0), net = lignes.reduce((a, l) => a + l.net, 0);
  Object.assign(out, { virements: lignes, ecartes, net, total, reste: dus.length - lot.length });
  if (!lignes.length) return { ...out, rien: 'aucun virement arrivé en banque à facturer' };
  if (total < MINIMUM) return { ...out, rien: 'total inférieur à 0,50 € : reporté avec les prochains virements' };
  if (!stripe2 || simuler) return out;
  // facture sur le compte du prestataire, payée tout de suite par la carte enregistrée
  const ids = lignes.map(l => l.id), cle = 'commission-' + require('crypto').createHash('sha256').update(CLIENT + '|' + ids.join(',') + '|' + Math.floor(maintenant / 3600000)).digest('hex').slice(0, 32), tx = String(TAUX).replace('.', ',');   // clé : deux passages simultanés tombent sur la même facture ; un nouvel essai une heure plus tard repart de zéro
  const periode = lignes.length === 1 ? 'virement arrivé le ' + jourFr(lignes[0].arrivee) : lignes.length + ' virements arrivés du ' + jourFr(lignes[0].arrivee) + ' au ' + jourFr(lignes[lignes.length - 1].arrivee);
  let inv = await stripe2.invoices.create({ customer: CLIENT, collection_method: 'charge_automatically', auto_advance: false, pending_invoice_items_behavior: 'exclude', currency: 'eur', ...(pmSeule ? { default_payment_method: pmSeule } : {}), description: `Commission de ${tx} % sur les dons nets reçus — ${periode}`, metadata: { commission: '1', lot: cle, ...metaVirements(ids) } }, { idempotencyKey: cle });
  try {
    const postes = lignes.length <= 12 ? lignes.map(l => ({ amount: l.commission, description: `Virement arrivé le ${jourFr(l.arrivee)} — net des dons ${eur(l.net)} × ${tx} %`, k: l.id })) : [{ amount: total, description: `${periode} — net des dons ${eur(net)} × ${tx} %`, k: 'tout' }];
    for (const x of postes) await stripe2.invoiceItems.create({ customer: CLIENT, invoice: inv.id, amount: x.amount, currency: 'eur', description: x.description }, { idempotencyKey: cle + '-' + x.k });
    inv = await stripe2.invoices.retrieve(inv.id);
    if (inv.status === 'draft') {
      if (inv.total !== total) throw new Error('le total de la facture (' + inv.total + ') ne correspond pas au calcul (' + total + ')');   // taxe ou ligne inattendue : on n'encaisse pas
      inv = await stripe2.invoices.finalizeInvoice(inv.id, { auto_advance: false });
    }
  } catch (e) { try { if (inv.status === 'draft') await stripe2.invoices.del(inv.id); } catch (e2) {} throw e; }
  out.facture = { id: inv.id, numero: inv.number, montant: inv.total, lien: inv.hosted_invoice_url };
  try { if (inv.status !== 'paid') inv = await stripe2.invoices.pay(inv.id); out.facture.paye = inv.status === 'paid'; }
  catch (e) { out.facture.paye = false; out.facture.raison = e.message; }   // carte refusée : la facture reste ouverte, nouvel essai au prochain passage
  return out;
}

function mailEncaissement(r, live) {
  const tx = String(r.taux).replace('.', ','), f = r.facture || null, rates = (r.reessais || []).filter(x => !x.paye), reussis = (r.reessais || []).filter(x => x.paye);
  const refuse = (f && !f.paye) || rates.length, montant = f ? f.montant : (rates[0] || reussis[0] || {}).montant || 0;
  const subject = `${live ? '' : '[TEST] '}Commission ${refuse ? '— PAIEMENT REFUSÉ' : 'encaissée'} : ${eur(montant)}`;
  const L = [];
  for (const x of reussis) L.push(`Facture ${x.numero || x.facture} : ${eur(x.montant)} — payée au nouvel essai.`);
  for (const x of rates) L.push(`Facture ${x.numero || x.facture} : ${eur(x.montant)} — carte refusée (${x.raison || 'raison inconnue'}). Nouvel essai demain.${x.lien ? ' Lien de paiement : ' + x.lien : ''}`);
  if (f) L.push(`Facture ${f.numero || f.id} : ${eur(f.montant)} — ${f.paye ? 'payée par carte' : 'carte refusée (' + (f.raison || 'raison inconnue') + '). Nouvel essai demain.' + (f.lien ? ' Lien de paiement : ' + f.lien : '')}`);
  if (f) for (const l of r.virements || []) L.push(`  • virement arrivé le ${jourFr(l.arrivee)} (${eur(l.montantVire)} viré) : ${l.nbDons} don(s), net ${eur(l.net)} × ${tx} % = ${eur(l.commission)}`);
  for (const e of r.ecartes || []) L.push(`⚠ Virement ${e.id} non facturé : ${e.raison}.`);
  if (r.reste) L.push(`Il reste ${r.reste} virement(s) plus récents à traiter au prochain passage.`);
  const text = L.join('\n'), e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  const n = c => (c / 100).toFixed(2).replace('.', ',');
  const csv = f ? '﻿' + ['Arrivée en banque;Montant viré;Dons;Dons encaissés;Frais Stripe;Remboursements;Litiges;Net;Commission;Virement Stripe'].concat((r.virements || []).map(l => [jourFr(l.arrivee), n(l.montantVire), l.nbDons, n(l.brut), n(l.frais), n(l.rembourse), n(l.litiges), n(l.net), n(l.commission), l.id].join(';'))).concat(['', ';;;;;;;' + n(r.net) + ';' + n(r.total)]).join('\r\n') : null;
  return { subject, text, html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:600px"><h2 style="color:${refuse ? '#b45309' : '#1f6a72'};margin:0 0 10px">${e(subject)}</h2>` + L.map(x => `<p style="margin:6px 0;font-size:14px">${e(x)}</p>`).join('') + '</div>', csv, fichier: f ? `commission_facture_${f.numero || f.id}.csv` : null };
}


// ───────── Côté prestataire : virements vers sa banque, avec une réserve pour l'URSSAF ─────────
// Sur le compte Stripe du prestataire, pour chaque facture de commission payée par l'association, dès que Stripe rend les fonds disponibles :
//   • RÉSERVE % du montant encaissé (le brut, avant frais Stripe) reste sur le solde Stripe : c'est la part mise de côté pour l'URSSAF ;
//   • le reste (encaissé − frais Stripe − réserve) est viré à la banque du prestataire.
// Le DERNIER JOUR du mois (30, 31, 28 ou 29), la réserve accumulée est virée à part, avec le libellé « URSSAF mm/aaaa ».
// Passage manqué ce jour-là : rattrapé les trois premiers jours du mois suivant, pour les seules commissions du mois écoulé, sous le libellé du mois écoulé.
// Seules les factures de commission sont concernées : tout autre argent présent sur le compte n'est jamais touché.
// Il faut que les virements du compte soient réglés sur « manuel » (sinon Stripe vire tout, tout seul, et aucune réserve n'est possible).
// Rien n'est mémorisé ici : chaque virement garde la liste des factures qu'il couvre. Verrou : COMMISSION_VIREMENTS=oui, sinon simulation.
const RESERVE = Math.max(0, Math.min(90, Number(process.env.COMMISSION_RESERVE || 30)));
const MIN_VIREMENT = 100;   // pas de virement de moins de 1 €
const moisParis = t => parisJour(t).slice(0, 7);
function jourUrssaf(maintenant) {   // mois à solder : le mois en cours si c'est son dernier jour (Paris) ; le mois écoulé les 1er, 2 et 3 (rattrapage) ; sinon null
  const j = parisJour(maintenant), a = Number(j.slice(0, 4)), m = Number(j.slice(5, 7)), jour = Number(j.slice(8)), dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  if (jour === dernier) return { mois: j.slice(0, 7), avant: Infinity };
  if (jour <= 3) return { mois: new Date(Date.UTC(a, m - 2, 15)).toISOString().slice(0, 7), avant: Math.floor(minuitParis(j.slice(0, 8) + '01') / 1000) };   // seulement les commissions payées avant le 1er
  return null;
}
const metaListe = (ids, prefixe) => Object.fromEntries(Object.entries(metaVirements(ids)).map(([k, v]) => [prefixe + k.slice(1), v]));
function couvert(virements, genre) {   // factures déjà couvertes par un virement de ce genre (un virement refusé ou annulé ne compte pas)
  const set = new Set();
  for (const p of virements) { if (!p.metadata || p.metadata.commission !== genre || p.status === 'failed' || p.status === 'canceled') continue; for (const [k, v] of Object.entries(p.metadata)) if (/^f\d+$/.test(k)) String(v).split(',').forEach(x => x && set.add(x)); }
  return set;
}
async function virer({ stripe2, simuler, maintenant = Date.now(), actif = process.env.COMMISSION_VIREMENTS === 'oui' }) {
  if (!stripe2) return { ok: true, mode: 'simulation', rien: 'clé du prestataire absente' };
  if (!actif) simuler = true;
  const out = { ok: true, mode: simuler ? 'simulation' : 'reel', reserve: RESERVE };
  try { const a = await stripe2.accounts.retrieve(); const i = a && a.settings && a.settings.payouts && a.settings.payouts.schedule && a.settings.payouts.schedule.interval; out.calendrier = i || 'inconnu'; } catch (e) { out.calendrier = 'inconnu'; }
  if (out.calendrier !== 'manual' && out.calendrier !== 'inconnu') return { ...out, ok: !!simuler, error: 'Les virements de ce compte Stripe sont automatiques (' + out.calendrier + ') : il faut les régler sur « manuel », sinon aucune réserve n\'est possible. Rien n\'est fait.' };
  // factures de commission payées, avec ce que Stripe a réellement crédité (frais déduits) et la date de disponibilité des fonds
  const F = [];
  for await (const f of stripe2.invoices.list({ customer: CLIENT, status: 'paid', limit: 100, expand: ['data.charge.balance_transaction'] })) {
    if (!f.metadata || f.metadata.commission !== '1') continue;
    const ch = f.charge && typeof f.charge === 'object' ? f.charge : null, bt = ch && ch.balance_transaction && typeof ch.balance_transaction === 'object' ? ch.balance_transaction : null;
    if (!ch || !bt || String(bt.currency).toLowerCase() !== 'eur') continue;   // payée hors carte, ou devise étrangère : pas gérée ici
    const brut = bt.amount, net = bt.net, part = Math.round(brut * RESERVE / 100);
    F.push({ id: f.id, numero: f.number, brut, frais: bt.fee, net, reserve: part, reste: net - part, dispo: bt.status === 'available', paye: (f.status_transitions && f.status_transitions.paid_at) || f.created || 0, rembourse: ch.amount_refunded > 0 || ch.disputed === true });
    if (F.length > 5000) break;
  }
  const V = []; for await (const p of stripe2.payouts.list({ limit: 100 })) { if (p.metadata && p.metadata.commission) V.push(p); if (V.length > 5000) break; }
  const dejaReste = couvert(V, 'reste'), dejaUrssaf = couvert(V, 'urssaf');
  out.ecartes = F.filter(f => f.rembourse && !(dejaReste.has(f.id) && dejaUrssaf.has(f.id))).map(f => ({ facture: f.numero || f.id, raison: 'commission remboursée ou contestée : à traiter à la main' }));
  const bon = F.filter(f => f.dispo && !f.rembourse);
  out.enAttente = F.filter(f => !f.dispo && !f.rembourse).length;   // fonds pas encore rendus disponibles par Stripe
  let dispo = 0; { const b = await stripe2.balance.retrieve(); dispo = ((b.available || []).find(x => x.currency === 'eur') || { amount: 0 }).amount; } out.soldeDisponible = dispo;
  const creer = async (genre, lot, montant, libelle, description, extra = {}) => {
    const ids = lot.map(f => f.id), cle = 'virement-' + genre + '-' + require('crypto').createHash('sha256').update(ids.join(',') + '|' + Math.floor(maintenant / 3600000)).digest('hex').slice(0, 32);
    const p = await stripe2.payouts.create({ amount: montant, currency: 'eur', description, statement_descriptor: libelle, metadata: { commission: genre, ...extra, ...metaListe(ids, 'f') } }, { idempotencyKey: cle });
    dispo -= montant; return { id: p.id, montant, libelle, arrivee: p.arrival_date, etat: p.status, factures: lot.length };
  };
  // 1. la part nette : encaissé − frais Stripe − réserve
  { const lot = bon.filter(f => !dejaReste.has(f.id)).slice(0, 300), montant = lot.reduce((a, f) => a + f.reste, 0);
    out.partNette = { factures: lot.length, encaisse: lot.reduce((a, f) => a + f.brut, 0), frais: lot.reduce((a, f) => a + f.frais, 0), reserve: lot.reduce((a, f) => a + f.reserve, 0), montant };
    if (lot.length && montant >= MIN_VIREMENT) {
      if (montant > dispo) out.partNette.attente = 'solde disponible insuffisant (' + dispo + ' c) : au prochain passage';
      else if (!simuler) out.partNette.virement = await creer('reste', lot, montant, 'COMMISSION EMOUNATEHA', `Commission Émounatéha — part nette (${RESERVE} % gardés pour l'URSSAF)`);
    } }
  // 2. la réserve URSSAF : une fois par mois, le dernier jour du mois
  { const ju = jourUrssaf(maintenant), mois = ju ? ju.mois : moisParis(maintenant), fait = V.some(p => p.metadata.commission === 'urssaf' && p.metadata.mois === mois && p.status !== 'failed' && p.status !== 'canceled');
    const lot = bon.filter(f => !dejaUrssaf.has(f.id) && (!ju || f.paye < ju.avant)).slice(0, 300), montant = lot.reduce((a, f) => a + f.reserve, 0);
    out.urssaf = { enReserve: F.filter(f => !f.rembourse && !dejaUrssaf.has(f.id)).reduce((a, f) => a + f.reserve, 0), factures: lot.length, encaisse: lot.reduce((a, f) => a + f.brut, 0), montant, mois, jour: !!ju, dejaFait: fait };
    if (ju && !fait && lot.length && montant >= MIN_VIREMENT) {
      if (montant > dispo) out.urssaf.attente = 'solde disponible insuffisant (' + dispo + ' c) : au prochain passage';
      else if (!simuler) out.urssaf.virement = await creer('urssaf', lot, montant, 'URSSAF ' + mois.slice(5) + '/' + mois.slice(0, 4), `Réserve URSSAF ${mois.slice(5)}/${mois.slice(0, 4)} — ${RESERVE} % de ${eur(out.urssaf.encaisse)} de commissions encaissées`, { mois });
    } }
  return out;
}
function mailVirements(v, live) {
  const L = [], pn = v.partNette || {}, u = v.urssaf || {};
  if (pn.virement) L.push(`Virement de ${eur(pn.virement.montant)} vers votre banque (libellé « ${pn.virement.libelle} », arrivée prévue le ${jourFr(pn.virement.arrivee)}).`, `  Détail : ${eur(pn.encaisse)} encaissés − ${eur(pn.frais)} de frais Stripe − ${eur(pn.reserve)} gardés pour l'URSSAF (${v.reserve} %).`);
  if (u.virement) L.push(`Virement URSSAF de ${eur(u.virement.montant)} vers votre banque (libellé « ${u.virement.libelle} », arrivée prévue le ${jourFr(u.virement.arrivee)}).`, `  C'est la réserve de ${v.reserve} % sur ${eur(u.encaisse)} de commissions encaissées (${u.factures} facture(s)). Chiffre d'affaires correspondant à déclarer : ${eur(u.encaisse)}.`);
  for (const e of v.ecartes || []) L.push(`⚠ Facture ${e.facture} : ${e.raison}.`);
  const titre = u.virement ? `URSSAF : ${eur(u.virement.montant)} virés sur votre compte` : `Commission : ${eur((pn.virement || {}).montant || 0)} virés sur votre compte`, subject = (live ? '' : '[TEST] ') + titre;
  const e = s => String(s).replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
  return { subject, text: L.join('\n'), html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:600px"><h2 style="color:#1f6a72;margin:0 0 10px">${e(titre)}</h2>` + L.map(x => `<p style="margin:6px 0;font-size:14px">${e(x)}</p>`).join('') + '</div>' };
}

function monter(app, { stripe, adminOk, mailer, load, save, stripe2 = process.env.STRIPE_COMMISSION_KEY ? require('stripe')(process.env.STRIPE_COMMISSION_KEY) : null }) {
  // Appelé chaque jour par le serveur du site : encaisse par carte la commission des virements arrivés en banque (jamais avant). Sans clé du prestataire, ou avec { simuler: true } : simulation.
  app.post('/api/admin/commission/encaisser', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const r = await encaisser({ stripe, stripe2, simuler: !!(req.body && req.body.simuler) });
      if (r.mode === 'reel' && (r.facture || (r.reessais || []).length || (r.ecartes || []).length)) {
        const to = String(process.env.COMMISSION_EMAIL || '').trim();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { try { const m = mailEncaissement(r, estLive(process.env.STRIPE_SECRET_KEY)); const env = await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text, attachments: m.csv ? [{ name: m.fichier, content: Buffer.from(m.csv, 'utf8').toString('base64') }] : undefined }); r.mail = !!(env && env.sent); } catch (e) { r.mail = false; console.error('commission/encaisser e-mail', e.message); } }
      }
      // puis, sur le compte du prestataire : part nette virée à sa banque, réserve URSSAF gardée (et virée le 30)
      try {
        const v = await virer({ stripe2, simuler: !!(req.body && req.body.simuler) }); r.mesVirements = v;
        const to = String(process.env.COMMISSION_EMAIL || '').trim();
        if (v.mode === 'reel' && ((v.partNette || {}).virement || (v.urssaf || {}).virement) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) { const m = mailVirements(v, estLive(process.env.STRIPE_COMMISSION_KEY)); try { await mailer.send({ to, toName: 'Prestataire technique', subject: m.subject, html: m.html, text: m.text }); } catch (e) { console.error('commission/virements e-mail', e.message); } }
      } catch (e) { r.mesVirements = { ok: false, error: e.message }; console.error('commission/virements', e.message); }
      res.setHeader('Cache-Control', 'no-store'); res.status(r.ok === false ? 409 : 200).json(r);
    } catch (e) { console.error('commission/encaisser', e.message); res.status(502).json({ error: e.message }); }
  });

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

module.exports = { virer, jourUrssaf, couvert, mailVirements, encaisser, echu, ligneVirement, dejaPris, metaVirements, mailEncaissement, releveMail, calculer, semaine, semainePrecedente, minuitParis, mouvementsStripe, monter, TAUX, CLIENT };
