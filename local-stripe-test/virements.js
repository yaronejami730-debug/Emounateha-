// Virements de Stripe vers la banque de l'association : un e-mail à l'administrateur à chaque virement.
// LECTURE SEULE sur le compte Stripe : aucun virement n'est créé, modifié ni annulé ici ; on lit ceux que Stripe fait de lui-même.
//
// Le serveur du site appelle ce point d'entrée toutes les heures. Chaque virement donne lieu à un seul e-mail au moment où Stripe le lance
// (montant, date d'arrivée prévue, banque, nombre de dons regroupés), et à un second seulement si la banque le refuse.
// À la mise en service, les virements déjà existants sont notés comme vus, sans e-mail : on ne prévient que pour les suivants.

const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const jour = t => new Date(t * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ECHEC = new Set(['failed', 'canceled']);

// Ce que le virement regroupe, d'après les mouvements de solde que Stripe y rattache (montants réels, en centimes)
function contenu(mouvements) {
  let dons = 0, brut = 0, frais = 0, rembourse = 0, autres = 0;
  for (const m of mouvements || []) {
    if (m.type === 'payout') continue;
    const a = Math.round(Number(m.amount) || 0), f = Math.round(Number(m.fee) || 0);
    if (m.type === 'charge' || m.type === 'payment') { dons++; brut += a; frais += f; }
    else if (/refund|reversal/.test(String(m.type))) { rembourse += a; frais += f; }
    else { autres += a - f; }
  }
  return { dons, brut, frais, rembourse, autres, net: brut - frais + rembourse + autres };
}

function mailVirement(p, c, { echec = false, test = false } = {}) {
  const b = p.destination && typeof p.destination === 'object' ? p.destination : null;
  const banque = b ? [b.bank_name, b.last4 ? '···· ' + b.last4 : ''].filter(Boolean).join(' ') : '';
  const L = [];
  if (echec) L.push(['Virement refusé', eur(p.amount)], ['Motif indiqué par Stripe', p.failure_message || p.failure_code || 'non précisé']);
  else L.push(['Montant viré sur le compte bancaire', eur(p.amount)], ['Arrivée prévue', jour(p.arrival_date)]);
  if (banque) L.push(['Compte', banque]);
  L.push(['Lancé par Stripe le', jour(p.created)]);
  const D = [];
  if (c && c.dons && !echec) {
    D.push(['Dons regroupés dans ce virement', String(c.dons)], ['Total des dons', eur(c.brut)], ['− Frais bancaires Stripe', '− ' + eur(c.frais)]);
    if (c.rembourse) D.push(['− Dons remboursés', '− ' + eur(-c.rembourse)]);
    if (c.autres) D.push(['Autres mouvements', (c.autres < 0 ? '− ' : '+ ') + eur(Math.abs(c.autres))]);
    if (c.net !== p.amount) D.push(['Écart avec le montant viré', eur(p.amount - c.net) + ' (solde reporté ou mouvement hors dons)']);
  }
  const subject = (test ? '[TEST] ' : '') + (echec ? 'Virement Stripe REFUSÉ : ' + eur(p.amount) : 'Virement Stripe vers la banque : ' + eur(p.amount) + ', arrivée ' + new Date(p.arrival_date * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }));
  const intro = echec ? "Stripe n'a pas pu verser cette somme sur le compte bancaire de l'association. L'argent reste sur le compte Stripe ; vérifiez le RIB dans Stripe." : "Stripe vient de lancer un virement vers le compte bancaire de l'association.";
  const text = intro + '\n\n' + L.concat(D).map(x => x[0] + ' : ' + x[1]).join('\n') + '\n\nRéférence Stripe : ' + p.id + (test ? '\nCompte Stripe de TEST : ce ne sont pas de vrais dons.' : '');
  const tab = R => '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + R.map((x, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;${i === 0 ? 'font-weight:bold;' : ''}">${esc(x[0])}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;${i === 0 ? 'font-weight:bold;font-size:17px;color:' + (echec ? '#b91c1c' : '#1f6a72') + ';' : ''}">${esc(x[1])}</td></tr>`).join('') + '</table>';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px"><h2 style="color:${echec ? '#b91c1c' : '#1f6a72'};margin:0 0 6px">${echec ? 'Virement refusé' : 'Virement vers la banque'}</h2><p style="margin:0 0 14px;color:#4b5563">${esc(intro)}</p>${tab(L)}${D.length ? '<p style="margin:18px 0 4px;font-weight:bold">Ce que contient ce virement</p>' + tab(D).replace(/font-weight:bold;font-size:17px;color:#1f6a72;/, '').replace('font-weight:bold;', '') : ''}<p style="margin:14px 0 0;font-size:12px;color:#6b7280">Référence Stripe : ${esc(p.id)}. Montants lus dans Stripe, sans estimation.${test ? ' <b>Compte Stripe de TEST.</b>' : ''}</p></div>`;
  return { subject, text, html };
}

function monter(app, { stripe, adminOk, mailer, load, save }) {
  app.post('/api/admin/virements/verifier', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const test = !/^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), d = load(), etat = d.virements || null;
      const liste = (await stripe.payouts.list({ limit: 30, expand: ['data.destination'] })).data || [];
      if (!etat) {   // mise en service : on part de maintenant, sans e-mail pour le passé
        const d2 = load(); d2.virements = { depuis: new Date().toISOString(), vus: Object.fromEntries(liste.map(p => [p.id, ECHEC.has(p.status) ? 'echec' : 'vu'])) }; save(d2);
        return res.json({ ok: true, miseEnService: true, dejaExistants: liste.length, envoyes: 0 });
      }
      const vus = { ...(etat.vus || {}) }, envoyes = [], erreurs = [];
      for (const p of liste.slice().reverse()) {   // du plus ancien au plus récent
        const echec = ECHEC.has(p.status), avant = vus[p.id];
        if (p.currency && String(p.currency).toLowerCase() !== 'eur') { vus[p.id] = avant || 'vu'; continue; }
        if (avant === 'echec' || (avant === 'vu' && !echec)) continue;
        if (!avant && p.amount <= 0 && !echec) { vus[p.id] = 'vu'; continue; }   // régularisation négative : pas un virement reçu
        try {
          let c = null; if (!echec) { const mv = []; for await (const m of stripe.balanceTransactions.list({ payout: p.id, limit: 100 })) { mv.push(m); if (mv.length > 5000) break; } c = contenu(mv); }
          const m = mailVirement(p, c, { echec, test });
          const env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: m.subject, html: m.html, text: m.text });
          vus[p.id] = echec ? 'echec' : 'vu'; envoyes.push({ id: p.id, montant: p.amount, echec, mail: env && env.sent !== undefined ? env.sent : true });
        } catch (e) { erreurs.push(p.id + ' : ' + e.message); }   // pas noté comme vu : nouvel essai à la prochaine vérification
      }
      const garde = Object.fromEntries(Object.entries(vus).slice(-400));
      const d3 = load(); d3.virements = { ...(d3.virements || etat), vus: garde, verifieLe: new Date().toISOString() }; save(d3);
      if (erreurs.length) console.error('virements', erreurs.join(' | '));
      res.json({ ok: true, envoyes: envoyes.length, detail: envoyes, erreurs });
    } catch (e) { console.error('virements', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { contenu, mailVirement, monter };
