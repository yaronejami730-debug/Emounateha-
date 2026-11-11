// Mini-cagnottes « besoin » : ce que chaque cagnotte a réellement rapporté, d'après Stripe.
// LECTURE SEULE sur le compte Stripe : aucun paiement, aucun virement, rien n'est écrit. Sert au CRM pour afficher la somme à reverser.
//
// Pour chaque cagnotte : dons encaissés (brut), frais Stripe réels (ceux du mouvement de solde, pas une estimation), remboursements,
// net = brut − frais − remboursements. Les dons sont retrouvés par l'étiquette « besoin » posée sur chaque paiement au moment du don.

const SLUG = /^[a-z0-9-]{1,40}$/;

// Calcul pur, à partir des paiements Stripe d'une cagnotte (montants en centimes)
function resumer(paiements) {
  let dons = 0, brut = 0, frais = 0, rembourse = 0, incomplets = 0, litiges = 0;
  for (const pi of paiements || []) {
    if (!pi || pi.status !== 'succeeded') continue;
    if (pi.currency && String(pi.currency).toLowerCase() !== 'eur') { incomplets++; continue; }
    const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const bt = ch && ch.balance_transaction && typeof ch.balance_transaction === 'object' ? ch.balance_transaction : null;
    dons++; brut += Math.round(Number(pi.amount_received != null ? pi.amount_received : pi.amount) || 0);
    if (bt) frais += Math.round(Number(bt.fee) || 0); else incomplets++;   // frais pas encore connus de Stripe : signalé, jamais inventé
    if (ch) { rembourse += Math.round(Number(ch.amount_refunded) || 0); if (ch.disputed) litiges++; }
  }
  return { dons, brut, frais, rembourse, net: brut - frais - rembourse, incomplets, litiges };
}

async function paiementsDe(stripe, slug) {
  const out = [];
  for await (const pi of stripe.paymentIntents.search({ query: `metadata['besoin']:'${slug}' AND status:'succeeded'`, limit: 100, expand: ['data.latest_charge.balance_transaction'] })) {
    if (pi.metadata && pi.metadata.besoin === slug) out.push(pi);   // la recherche Stripe est approchée : on revérifie l'étiquette exacte
    if (out.length > 5000) throw new Error('trop de paiements pour cette cagnotte');
  }
  return out;
}

function monter(app, { stripe, adminOk }) {
  const cache = new Map();
  // Réservé au serveur du site (requête signée) : GET /api/admin/cagnottes?slugs=a,b,c
  app.get('/api/admin/cagnottes', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const slugs = [...new Set(String(req.query.slugs || '').split(',').map(s => s.trim()).filter(s => SLUG.test(s)))].slice(0, 200), par = {};
      for (const s of slugs) {
        const c = cache.get(s);
        if (c && Date.now() - c.at < 60000) { par[s] = c.v; continue; }
        const v = resumer(await paiementsDe(stripe, s));
        if (cache.size > 500) cache.clear();
        cache.set(s, { at: Date.now(), v }); par[s] = v;
      }
      res.setHeader('Cache-Control', 'no-store'); res.json({ par });
    } catch (e) { console.error('cagnottes', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { resumer, paiementsDe, monter };
