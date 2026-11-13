// Dons mensuels dont le prélèvement a échoué (carte refusée, expirée, provision insuffisante).
// LECTURE SEULE sur le compte Stripe : ce module ne relance aucun paiement lui-même. C'est Stripe qui retente le prélèvement,
// selon le calendrier réglé dans Stripe (Facturation → Recouvrement → Nouvelles tentatives). Ici, on prévient :
//   - le donateur, à chaque nouvel échec, 4 fois au plus pour une même échéance (ton bienveillant, lien pour changer de carte, lien pour arrêter) ;
//   - l'administrateur, une fois, au 4e échec d'une même échéance.
// Le serveur du site appelle ce point d'entrée toutes les heures. À la mise en service, les échecs déjà en cours sont notés sans e-mail.
//
// SEULE ÉCRITURE dans Stripe, demandée par Yarone le 11 nov. 2026 : l'arrêt d'un don mensuel qui n'aboutit plus.
// Un don mensuel est arrêté (abonnement annulé, échéances impayées annulées, plus aucune tentative sur la carte) quand
//   - ses échéances impayées cumulent ECHECS_ANNULATION tentatives sans succès (20 par défaut), ou
//   - sa plus ancienne échéance impayée a plus de ECHECS_JOURS jours (60 par défaut) : cas où Stripe ne retente plus.
// Le donateur et l'administrateur en sont prévenus. Rien d'autre n'est modifié : aucun paiement n'est relancé par ce module.

const MAX_DONATEUR = 4;
const entier = (v, def, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
const MAX_TENTATIVES = () => entier(process.env.ECHECS_ANNULATION, 20, 1, 200), MAX_JOURS = () => entier(process.env.ECHECS_JOURS, 60, 1, 730);
const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(',00', '') + ' €';
const P = { timeZone: 'Europe/Paris' };
const jour = t => new Date(t * 1000).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...P });
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const subDe = inv => inv.subscription && typeof inv.subscription === 'object' ? inv.subscription.id : inv.subscription || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription) || null;

// Message au donateur. etape = 1 à 4 (numéro du rappel pour cette échéance).
function texteDonateur(d) {
  const m = eur(d.montant), k = d.etape, dernier = k >= MAX_DONATEUR;
  const titre = k === 1 ? 'Votre don mensuel n\'a pas pu être prélevé' : dernier ? 'Dernier rappel pour votre don mensuel' : 'Votre don mensuel est toujours en attente';
  const intro = k === 1
    ? `Le prélèvement de votre don mensuel de ${m} n'a pas abouti. Cela arrive : carte expirée ou remplacée, plafond atteint, provision insuffisante ce jour-là.`
    : dernier
      ? `Le prélèvement de votre don mensuel de ${m} n'a toujours pas abouti. C'est notre dernier message à ce sujet pour cette échéance.`
      : `Le prélèvement de votre don mensuel de ${m} n'a pas abouti lors de la nouvelle tentative.`;
  const suite = d.prochain ? `Vous n'avez rien à faire si c'est passager : une nouvelle tentative aura lieu automatiquement le ${jour(d.prochain)}.` : `Aucune nouvelle tentative automatique n'est prévue pour cette échéance : vous pouvez la régler avec le bouton ci-dessous si vous le souhaitez.`;
  const carte = 'Si votre carte a changé, vous pouvez régler cette échéance avec une autre carte en un instant.';
  const libre = 'Votre don reste entièrement libre : vous pouvez l\'arrêter ou le reprendre à tout moment depuis votre espace donateur, sans justification.';
  const subject = (d.test ? '[TEST] ' : '') + (k === 1 ? `Votre don mensuel de ${m} n'a pas pu être prélevé` : dernier ? `Dernier rappel : votre don mensuel de ${m}` : `Rappel : votre don mensuel de ${m} est en attente`);
  return { titre, intro, suite, carte, libre, subject, m };
}
async function mailDonateur(mailer, d) {
  const s = await mailer.settings(); if (!s) return null;
  const t = texteDonateur(d), color = '#1f6a72', accent = '#c4a24a', f = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;";
  const bouton = (href, txt, plein) => `<table role="presentation" align="center" style="margin:${plein ? '22px' : '10px'} auto 4px;"><tr><td style="${plein ? 'background:' + accent + ';' : 'border:1.5px solid ' + color + ';'}border-radius:999px;"><a href="${esc(href)}" style="display:inline-block;padding:${plein ? '12px 28px' : '9px 22px'};font-size:${plein ? 15 : 13}px;font-weight:bold;color:${plein ? '#1b2b2d' : color};text-decoration:none;${f}">${txt}</a></td></tr></table>`;
  const inner = `<h1 style="margin:0 0 14px;${f}font-weight:bold;font-size:21px;line-height:1.3;color:${color};text-align:center;">${esc(t.titre)}</h1>
  <p style="margin:0 0 12px;${f}font-size:15px;line-height:1.6;color:#22383b;">Bonjour${d.nom ? ' ' + esc(d.nom) : ''},</p>
  <p style="margin:0 0 12px;${f}font-size:15px;line-height:1.6;color:#22383b;">${esc(t.intro)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;margin:0 0 14px;"><tr><td style="padding:12px 18px;${f}font-size:14px;line-height:1.6;color:#14272a;"><b>${esc(t.m)} par mois</b>${d.affectation ? ' · ' + esc(d.affectation) : ''}<br><span style="color:#51666a;">${esc(t.suite)}</span></td></tr></table>
  <p style="margin:0 0 4px;${f}font-size:14.5px;line-height:1.6;color:#22383b;">${esc(t.carte)}</p>
  ${d.payer ? bouton(d.payer, 'Régler avec une autre carte', true) : ''}
  <p style="margin:18px 0 4px;${f}font-size:13.5px;line-height:1.6;color:#51666a;text-align:center;">${esc(t.libre)}</p>
  ${d.espace ? bouton(d.espace, 'Gérer ou arrêter mon don mensuel', false) : ''}
  <p style="margin:20px 0 0;${f}font-size:14px;line-height:1.6;color:#22383b;text-align:center;">Merci de tout cœur pour votre soutien.</p>`;
  return { subject: t.subject,
    html: mailer.shell(s, inner, { preheader: t.intro, testBanner: !!d.test }).replace('{{pied}}', `Vous recevez cet email car vous avez mis en place un don mensuel à ${esc(s.orgName)}. Rappel ${d.etape} sur ${MAX_DONATEUR} au plus pour cette échéance.`),
    text: `Bonjour${d.nom ? ' ' + d.nom : ''},\n\n${t.intro}\n\n${t.m} par mois${d.affectation ? ' · ' + d.affectation : ''}\n${t.suite}\n\n${t.carte}${d.payer ? '\nRégler avec une autre carte : ' + d.payer : ''}\n\n${t.libre}${d.espace ? '\nGérer ou arrêter mon don mensuel : ' + d.espace : ''}\n\nMerci de tout cœur pour votre soutien.\n${s.orgName}` };
}
function mailAdmin(d) {
  const L = [`Le don mensuel de ${d.nom || 'un donateur'} (${d.email}) n'a pas pu être prélevé : ${d.tentatives} tentatives sans succès pour l'échéance de ${eur(d.montant)}${d.affectation ? ' (' + d.affectation + ')' : ''}.`,
    `Le donateur a été prévenu ${d.rappels} fois par e-mail, avec un lien pour changer de carte.`,
    d.prochain ? `Stripe fera une nouvelle tentative le ${jour(d.prochain)}.` : `Stripe ne prévoit plus de nouvelle tentative pour cette échéance. La prochaine échéance sera tentée normalement le mois suivant. Si rien ne passe, le don mensuel sera arrêté automatiquement (${MAX_TENTATIVES()} tentatives sans succès, ou ${MAX_JOURS()} jours d'impayé) et vous en serez prévenu.`,
    `Si vous connaissez ce donateur, un appel est souvent plus efficace qu'un e-mail. Aucune action n'est obligatoire.`,
    `Référence Stripe : ${d.ref}`];
  return { subject: (d.test ? '[TEST] ' : '') + `Don mensuel en échec : ${d.nom || d.email}, ${eur(d.montant)} (${d.tentatives} tentatives)`, text: L.join('\n\n'), html: '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px;font-size:14.5px;line-height:1.55">' + L.map((l, i) => `<p style="margin:0 0 12px${i === L.length - 1 ? ';font-size:12px;color:#6b7280' : ''}">${esc(l)}</p>`).join('') + '</div>' };
}

async function mailArret(mailer, d) {   // au donateur : son don mensuel est arrêté, sans reproche, avec le moyen de le reprendre
  const s = await mailer.settings(); if (!s) return null;
  const m = eur(d.montant), color = '#1f6a72', accent = '#c4a24a', f = "font-family:Inter,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;";
  const P1 = `Le prélèvement de votre don mensuel de ${m} n'aboutissant plus depuis plusieurs semaines, nous l'avons arrêté. Plus aucune tentative ne sera faite sur votre carte, et vous ne devez rien.`;
  const P2 = 'Merci pour tout ce que votre soutien a déjà permis. Si vous souhaitez reprendre un don, mensuel ou ponctuel, vous pouvez le faire quand vous voulez.';
  const inner = `<h1 style="margin:0 0 14px;${f}font-weight:bold;font-size:21px;line-height:1.3;color:${color};text-align:center;">Votre don mensuel est arrêté</h1>
  <p style="margin:0 0 12px;${f}font-size:15px;line-height:1.6;color:#22383b;">Bonjour${d.nom ? ' ' + esc(d.nom) : ''},</p>
  <p style="margin:0 0 12px;${f}font-size:15px;line-height:1.6;color:#22383b;">${esc(P1)}</p>
  <p style="margin:0 0 6px;${f}font-size:15px;line-height:1.6;color:#22383b;">${esc(P2)}</p>
  ${d.don ? `<table role="presentation" align="center" style="margin:20px auto 4px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${esc(d.don)}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#1b2b2d;text-decoration:none;${f}">Reprendre un don</a></td></tr></table>` : ''}`;
  return { subject: (d.test ? '[TEST] ' : '') + `Votre don mensuel de ${m} est arrêté`,
    html: mailer.shell(s, inner, { preheader: P1, testBanner: !!d.test }).replace('{{pied}}', `Vous recevez cet email car vous aviez mis en place un don mensuel à ${esc(s.orgName)}. C'est le dernier message à ce sujet.`),
    text: `Bonjour${d.nom ? ' ' + d.nom : ''},\n\n${P1}\n\n${P2}${d.don ? '\nReprendre un don : ' + d.don : ''}\n\n${s.orgName}` };
}
function mailAdminArret(d) {
  const L = [`Le don mensuel de ${d.nom || 'un donateur'} (${d.email || 'sans e-mail'}), ${eur(d.montant)} par mois${d.affectation ? ' (' + d.affectation + ')' : ''}, a été arrêté automatiquement.`,
    `Motif : ${d.motif}.`, `${d.factures} échéance(s) impayée(s) annulée(s). Plus aucune tentative ne sera faite sur la carte. Le donateur a été prévenu par e-mail et peut refaire un don quand il veut.`, `Référence Stripe : ${d.ref}`];
  return { subject: (d.test ? '[TEST] ' : '') + `Don mensuel arrêté : ${d.nom || d.email || 'donateur'}, ${eur(d.montant)} par mois`, text: L.join('\n\n'), html: '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px;font-size:14.5px;line-height:1.55">' + L.map((l, i) => `<p style="margin:0 0 12px${i === L.length - 1 ? ';font-size:12px;color:#6b7280' : ''}">${esc(l)}</p>`).join('') + '</div>' };
}

function monter(app, { stripe, adminOk, mailer, load, save }) {
  app.post('/api/admin/echecs/verifier', async (req, res) => {
    if (!adminOk(req, res)) return;
    if (!stripe) return res.status(503).json({ error: 'Stripe non configuré' });
    try {
      const test = !/^sk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), espace = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/espace/' : '';
      const ouvertes = []; for await (const inv of stripe.invoices.list({ status: 'open', limit: 100, expand: ['data.customer'] })) { if ((inv.attempt_count || 0) >= 1 && inv.billing_reason === 'subscription_cycle') ouvertes.push(inv); if (ouvertes.length > 500) break; }
      const tronque = ouvertes.length > 500;   // liste incomplète : on ne retire alors personne du suivi
      const d = load(), avant = d.echecs || null, etat = {}, subs = new Map(), envois = [], erreurs = [], parSub = {}, arretes = [], illisibles = new Set();
      const parti = env => !!(env && env.sent === true);   // un e-mail « simulé » ou non configuré n'est pas un e-mail envoyé : on ne note rien, on réessaiera
      for (const inv of ouvertes) {
        const sid = subDe(inv); if (!sid) continue;
        if (!subs.has(sid)) subs.set(sid, await stripe.subscriptions.retrieve(sid).catch(e => { illisibles.add(sid); erreurs.push(sid + ' (lecture) : ' + e.message); return null; }));
        if (illisibles.has(sid)) { if (avant && avant[inv.id]) etat[inv.id] = avant[inv.id]; continue; }   // Stripe muet un instant : le suivi est gardé tel quel (sinon les rappels repartiraient de zéro)
        const sub = subs.get(sid), md = (sub && sub.metadata) || {}; if (!sub || md.frequence !== 'mensuel') continue;   // seulement les dons mensuels créés par cette page
        (parSub[sid] = parSub[sid] || []).push(inv);
        const cu = inv.customer && typeof inv.customer === 'object' ? inv.customer : null, email = cu && !cu.deleted ? String(cu.email || '').trim() : '';
        const st = { ...(avant && avant[inv.id] ? avant[inv.id] : { tentatives: 0, donateur: 0, admin: false, depuis: new Date().toISOString() }) };
        if (!avant) { etat[inv.id] = { tentatives: inv.attempt_count, donateur: 0, admin: inv.attempt_count >= MAX_DONATEUR, depuis: new Date().toISOString() }; continue; }   // mise en service : pas d'e-mail pour le passé
        const base = { nom: cu && cu.name ? String(cu.name).slice(0, 80) : '', email, montant: inv.amount_remaining != null ? inv.amount_remaining : inv.amount_due, affectation: md.affectation || '', prochain: inv.next_payment_attempt || null, test };
        try {
          if (inv.attempt_count > st.tentatives && st.donateur < MAX_DONATEUR && email) {
            const m = await mailDonateur(mailer, { ...base, etape: st.donateur + 1, payer: inv.hosted_invoice_url || '', espace });
            const env = m ? await mailer.send({ to: email, toName: base.nom, subject: m.subject, html: m.html, text: m.text }) : null;
            if (!parti(env)) throw new Error('rappel non envoyé (' + ((env && env.reason) || 'e-mail indisponible') + ')');   // la tentative n'est pas notée : nouvel essai à la prochaine vérification
            st.donateur++; envois.push({ facture: inv.id, a: 'donateur', rappel: st.donateur });
          }
          st.tentatives = Math.max(st.tentatives, inv.attempt_count);
          if (inv.attempt_count >= MAX_DONATEUR && !st.admin) {
            const m = mailAdmin({ ...base, tentatives: inv.attempt_count, rappels: st.donateur, ref: inv.id });
            const env = await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: m.subject, html: m.html, text: m.text });
            if (parti(env)) { st.admin = true; envois.push({ facture: inv.id, a: 'administrateur' }); } else erreurs.push(inv.id + ' : alerte administrateur non envoyée');
          }
        } catch (e) { erreurs.push(inv.id + ' : ' + e.message); }
        etat[inv.id] = { ...st, vuLe: new Date().toISOString() };
      }
      // Arrêt des dons mensuels qui n'aboutissent plus. Garde-fous, tous obligatoires :
      //  - jamais à la mise en service ;
      //  - seulement si Stripe lui-même considère le don en retard (past_due / unpaid) : un don qui a repris n'est jamais arrêté pour une vieille échéance ;
      //  - seulement si le donateur a reçu au moins un rappel lors d'une vérification PRÉCÉDENTE, et que l'échéance est suivie depuis 3 jours au moins ;
      //  - seulement si l'envoi d'e-mails fonctionne (le donateur et l'administrateur doivent pouvoir être prévenus).
      if (avant) for (const [sid, invs] of Object.entries(parSub)) {
        const sub = subs.get(sid); if (!sub || !['past_due', 'unpaid'].includes(sub.status)) continue;
        const prevenu = invs.some(i => avant[i.id] && avant[i.id].donateur >= 1 && Date.now() - Date.parse(avant[i.id].depuis || 0) >= 3 * 86400000);
        if (!prevenu) continue;
        const total = invs.reduce((t, i) => t + (i.attempt_count || 0), 0), age = Math.floor((Date.now() / 1000 - Math.min(...invs.map(i => i.created || Date.now() / 1000))) / 86400);
        const motif = total >= MAX_TENTATIVES() ? `${total} tentatives de prélèvement sans succès` : age >= MAX_JOURS() ? `échéance impayée depuis ${age} jours` : '';
        if (!motif) continue;
        if (!(await mailer.settings())) { erreurs.push(sid + ' : arrêt reporté, envoi d\'e-mails indisponible'); continue; }
        try {
          await stripe.subscriptions.cancel(sid);
          let annulees = 0; for (const i of invs) { try { await stripe.invoices.voidInvoice(i.id); annulees++; } catch (e) { erreurs.push(i.id + ' (annulation de l\'échéance) : ' + e.message); } delete etat[i.id]; }
          const inv = invs[0], cu = inv.customer && typeof inv.customer === 'object' && !inv.customer.deleted ? inv.customer : null, email = cu ? String(cu.email || '').trim() : '', it = (sub.items && sub.items.data && sub.items.data[0]) || {};
          const info = { nom: cu && cu.name ? String(cu.name).slice(0, 80) : '', email, montant: it.price && it.price.unit_amount ? it.price.unit_amount : inv.amount_due, affectation: (sub.metadata || {}).affectation || '', test };
          arretes.push({ abonnement: sid, motif, echeances: annulees });
          try { if (email) { const m = await mailArret(mailer, { ...info, don: process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/' : '' }); if (m) await mailer.send({ to: email, toName: info.nom, subject: m.subject, html: m.html, text: m.text }); }
            const a = mailAdminArret({ ...info, motif, factures: annulees, ref: sid }); await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: a.subject, html: a.html, text: a.text }); }
          catch (e) { erreurs.push(sid + ' (e-mail d\'arrêt) : ' + e.message); }
        } catch (e) { erreurs.push(sid + ' (arrêt) : ' + e.message); }
      }
      const d2 = load(), nouv = tronque ? { ...(avant || {}), ...etat } : etat;
      if (JSON.stringify(d2.echecs || null) !== JSON.stringify(nouv)) { d2.echecs = nouv; save(d2); }   // enregistré seulement si quelque chose a changé   // on ne garde que les échéances encore impayées : une échéance réglée ou annulée sort de la liste
      if (erreurs.length) console.error('echecs', erreurs.join(' | '));
      if (arretes.length) console.log('echecs : dons mensuels arrêtés', JSON.stringify(arretes));
      res.json({ ok: true, miseEnService: !avant, enEchec: Object.keys(etat).length, envois: envois.length, arretes, detail: envois, erreurs });
    } catch (e) { console.error('echecs', e.message); res.status(502).json({ error: 'Lecture Stripe impossible : ' + e.message }); }
  });
}

module.exports = { texteDonateur, mailDonateur, mailAdmin, mailArret, mailAdminArret, monter, MAX_DONATEUR };
