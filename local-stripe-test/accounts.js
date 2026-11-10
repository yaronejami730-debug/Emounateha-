/* Espace donateur : connexion par code à 6 chiffres (sans mot de passe), profils particulier / professionnel,
   liste des reçus par année, téléchargement protégé des PDF.
   Données dans data.json : users, sessions, otps, urlSecret (jamais commité). */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vault = require('./vault');

module.exports = function create({ load, save, RECUS, clean, sirenValide, mailer }) {
  const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 160);
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const ipOf = req => String(req.headers['cf-connecting-ip'] || req.ip || '');
  const isLocal = req => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') && !req.headers['cf-connecting-ip'];
  const SESSION_DAYS = 180, OTP_MIN = 10, OTP_TRIES = 5;

  // ---------- liens signés pour les PDF ----------
  function secret() { const d = load(); if (!d.urlSecret) { d.urlSecret = crypto.randomBytes(32).toString('hex'); save(d); } return d.urlSecret; }
  const sig = (file, exp) => crypto.createHmac('sha256', secret()).update(file + '.' + exp).digest('hex').slice(0, 32);
  function signUrl(file, ttl = 3600) { const f = path.basename(file), e = Math.floor(Date.now() / 1000) + ttl; return `${process.env.BASE_PATH || ''}/recus/${f}?e=${e}&s=${sig(f, e)}`; }
  function publicReceipt(out) {   // les liens renvoyés au navigateur expirent ; le PDF n'est jamais public
    const o = { ...out }; if (o.pdf) o.pdf = signUrl(o.pdf);
    if (o.email && o.email.eml) o.email = { ...o.email, eml: signUrl(o.email.eml) };
    delete o.donorEmail; delete o.file; delete o.form; delete o.vuPar; delete o.proche; delete o.accordAt; delete o.corrections; return o;
  }

  // ---------- sessions ----------
  function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
  function getSession(req) {
    const t = cookies(req).don_sid; if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
    const d = load(), s = (d.sessions || {})[sha(t)]; if (!s || s.exp < Date.now()) return null;
    return { email: s.email, hash: sha(t) };
  }
  function setCookie(req, res, value, maxAgeSec) {
    const https = /https/i.test(String(req.headers['x-forwarded-proto'] || '')) || req.secure;
    res.setHeader('Set-Cookie', `don_sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${https ? '; Secure' : ''}`);
  }
  function requireUser(req, res) { const s = getSession(req); if (!s) { res.status(401).json({ error: 'Non connecté' }); return null; } return s; }
  // contrôle d'origine : une page d'un autre site ne peut pas agir au nom du donateur
  function sameOrigin(req, res) { const o = req.headers.origin; if (o) { try { const h = new URL(o).host; if (h !== req.headers.host && !('don.emounateha.fr,www.emounateha.fr,emounateha.fr,' + (process.env.ALLOWED_ORIGIN_HOSTS || '')).split(',').map(x => x.trim()).includes(h)) { res.status(403).json({ error: 'Origine non autorisée' }); return false; } } catch (e) { res.status(403).json({ error: 'Origine non autorisée' }); return false; } } return true; }

  // ---------- profils ----------
  // Un compte = un numéro (id) + un email maître + le titulaire (profil « particulier »). Dans le compte : des sociétés (pros) et des proches
  // (autres particuliers au nom desquels le titulaire fait un don). Le reçu est toujours envoyé à l'email maître.
  // Comparaison « à l'identique » : on ignore seulement majuscules, espaces en trop et l'écriture du numéro (+33 6… = 06…). Toute autre différence compte.
  const normTxt = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normTel = t => String(t || '').replace(/[^\d+]/g, '').replace(/^(\+33|0033)/, '0').replace(/\D/g, '');
  function cleanTel(t) { const s = clean(t, 24); if (!s) return ''; const n = normTel(s); if (n.length < 8 || n.length > 15) throw new Error('Numéro de téléphone invalide'); return s; }
  const idt = (p, email) => [normTxt(p.prenom), normTxt(p.nom), normTxt(p.adresse), normTxt(p.cp), normTxt(p.ville), normTel(p.tel), normEmail(email)].join('|');
  const CHAMPS = ['prenom', 'nom', 'adresse', 'cp', 'ville', 'tel'];
  function ensureUser(d, email) {
    d.users = d.users || {}; const u = d.users[email] || (d.users[email] = { email, createdAt: Date.now(), profiles: {} });
    if (!u.id) u.id = 'C' + crypto.randomBytes(4).toString('hex').toUpperCase(); u.profiles = u.profiles || {}; return u;
  }
  const prochesDe = u => ((u && u.profiles && u.profiles.proches) || []);
  function procheDe(email, id) { const u = (load().users || {})[email]; return prochesDe(u).find(p => p.id === id && !p.supprime) || null; }
  function cleanProche(b) {
    const p = cleanProfile('particulier', b), email = normEmail(b.email);
    if (!emailOk(email)) throw new Error("Email de la personne requis (c'est lui qui permet de relier le reçu à son espace)");
    return { ...p, email };
  }
  // Lien permanent : un proche identique en tout point au titulaire d'un autre compte (dont l'email est prouvé par le code de connexion)
  // est relié à ce compte. Les reçus faits avec ces mêmes informations deviennent visibles dans l'espace de cette personne.
  function relier(d) {
    let ch = false;
    for (const u of Object.values(d.users || {})) for (const p of prochesDe(u)) {
      if (!p.lien && !p.supprime && p.email !== u.email) {
        const v = (d.users || {})[p.email], t = v && v.verifiedAt && v.profiles && v.profiles.particulier;
        if (t && !(v.refus || []).includes(u.email) && idt(t, v.email) === idt(p, p.email)) { p.lien = v.email; p.lieAt = Date.now(); p.partage = false; ch = true; }
      }
      if (p.lien) for (const r of Object.values(d.receipts || {})) if (r.proche === p.id && r.donorEmail === u.email && !r.vuPar && r.form && idt(r.form, r.form.emailProfil) === idt(p, p.email)) { r.vuPar = p.lien; ch = true; }
    }
    return ch;
  }
  // la personne reliée modifie ses informations : le profil suit chez ceux qui donnent en son nom (les reçus déjà émis ne changent pas)
  function propager(d, email) {
    const t = (d.users || {})[email] && d.users[email].profiles && d.users[email].profiles.particulier; if (!t) return;
    for (const u of Object.values(d.users || {})) for (const p of prochesDe(u)) if (p.lien === email && p.partage) for (const k of CHAMPS) p[k] = t[k] || '';
  }
  // liens vus par la personne : qui fait des dons en son nom ; elle peut accepter la mise à jour automatique, ou couper le lien pour de bon
  function liensOf(email) { const d = load(), out = []; for (const u of Object.values(d.users || {})) for (const p of prochesDe(u)) if (p.lien === email && !p.supprime) out.push({ id: p.id, par: titulaire(u), partage: !!p.partage }); return out; }
  function couper(d, vEmail, uEmail) {
    const v = ensureUser(d, vEmail), numeros = []; v.refus = v.refus || []; if (!v.refus.includes(uEmail)) v.refus.push(uEmail);
    for (const p of prochesDe((d.users || {})[uEmail])) if (p.lien === vEmail) { p.lien = null; p.partage = false; p.refuseAt = Date.now(); }
    for (const x of Object.values(d.receipts || {})) if (x.vuPar === vEmail && x.donorEmail === uEmail) { delete x.vuPar; numeros.push(x.numero); }
    return numeros;
  }
  async function alerteRefus(vEmail, uEmail, numeros) {
    try { await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: 'Alerte reçu fiscal : « Ce n\'est pas moi »' + (numeros.length ? ' (' + numeros.join(', ') + ')' : ''), text: `${vEmail} déclare ne pas avoir donné son accord pour qu'un reçu fiscal soit établi à son nom par le compte ${uEmail}.${numeros.length ? '\nReçu(s) concerné(s) : ' + numeros.join(', ') + '.' : ''}\nLe lien entre les deux comptes est coupé. À vérifier avec le donateur.`, html: `<p><b>${escH(vEmail)}</b> déclare ne pas avoir donné son accord pour qu'un reçu fiscal soit établi à son nom par le compte <b>${escH(uEmail)}</b>.</p>${numeros.length ? '<p>Reçu(s) concerné(s) : <b>' + numeros.join(', ') + '</b>.</p>' : ''}<p>Le lien entre les deux comptes est coupé. À vérifier avec le donateur.</p>` }); } catch (e) { console.error('[alerte] refus non envoyé', e.message); }
    console.log('[proche] lien refusé par la personne', numeros.join(','));
  }
  // lien permanent : une adresse ou un téléphone corrigés ne le coupent pas ; un autre nom ou un autre email, si (le lien est alors réévalué)
  const memePersonne = (a, b) => normTxt(a.prenom) === normTxt(b.prenom) && normTxt(a.nom) === normTxt(b.nom) && normEmail(a.email) === normEmail(b.email);
  const titulaire = u => { const t = u && u.profiles && u.profiles.particulier; return t ? (t.prenom + ' ' + String(t.nom || '').slice(0, 1).toUpperCase() + '.') : 'un proche'; };
  function cleanProfile(kind, b) {
    const rue = clean(b.adresse, 140), cp = clean(b.cp, 10), ville = clean(b.ville, 80);
    if (rue.length < 3 || !/^\d{5}$/.test(cp) || ville.length < 2) throw new Error('Adresse complète requise (rue, code postal à 5 chiffres, ville)');
    if (kind === 'particulier') {
      const prenom = clean(b.prenom, 60), nom = clean(b.nom, 60); if (!prenom || !nom) throw new Error('Prénom et nom requis');
      return { prenom, nom, adresse: rue, cp, ville, tel: cleanTel(b.tel) };
    }
    const rs = clean(b.raisonSociale, 120), siren = String(b.siren || '').replace(/\s/g, ''); if (!rs) throw new Error('Raison sociale requise');
    if (siren && !sirenValide(siren)) throw new Error('SIREN invalide (9 chiffres)');
    return { raisonSociale: rs, siren, adresse: rue, cp, ville };
  }
  const kindOf = t => (t === 'entreprise' || t === 'pro') ? 'pro' : 'particulier';
  // plusieurs sociétés par compte : profiles.pros (liste, une par SIREN) ; profiles.pro = la dernière utilisée
  const cleSoc = p => String(p.siren || '').replace(/\s/g, '') || String(p.raisonSociale || '').trim().toLowerCase();
  function poserProfil(u, k, p) {
    u.profiles = u.profiles || {};
    if (k === 'pro') { const l = (u.profiles.pros || (u.profiles.pro ? [u.profiles.pro] : [])).filter(x => cleSoc(x) !== cleSoc(p)); l.unshift(p); u.profiles.pros = l.slice(0, 20); }
    u.profiles[k] = p; u.last = k;
  }
  const profilsVus = pr => { pr = pr || {}; const o = pr.pro && !pr.pros ? { ...pr, pros: [pr.pro] } : { ...pr };
    o.proches = (pr.proches || []).filter(p => !p.supprime).map(p => ({ id: p.id, prenom: p.prenom, nom: p.nom, adresse: p.adresse, cp: p.cp, ville: p.ville, tel: p.tel || '', email: p.email, lie: !!(p.lien && p.partage) })); return o; };
  function saveProfileFromForm(email, type, form) {   // appelée après un don, si le donateur l'a demandé
    try {
      const k = kindOf(type); form = { ...(form || {}) }; try { cleanTel(form.tel); } catch (e) { form.tel = ''; }   // un téléphone mal écrit n'empêche pas d'enregistrer le profil
      const p = cleanProfile(k, form), d = load(); const u = (d.users || {})[email]; if (!u) return false;
      if (k === 'particulier' && !p.tel && u.profiles && u.profiles.particulier && u.profiles.particulier.tel) p.tel = u.profiles.particulier.tel;   // un don sans téléphone n'efface pas celui du profil
      poserProfil(u, k, p); if (k === 'particulier') propager(d, email); relier(d); save(d); return true;
    } catch (e) { return false; }
  }
  // correction d'un reçu par le donateur : seulement pendant l'année du don, 3 fois au plus
  const ANNEE = () => Number(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 4));
  function nonCorrigeable(r) {
    if (Number(new Date(r.dateDon).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 4)) !== ANNEE()) return "Ce reçu ne peut plus être corrigé en ligne (l'année du don est terminée). Contactez l'association.";
    if ((r.corrections || []).length >= 3) return "Ce reçu a déjà été corrigé 3 fois. Contactez l'association.";
    return '';
  }
  const poignee = id => crypto.createHmac('sha256', secret()).update('offert|' + id).digest('hex').slice(0, 24);
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function offertsOf(email) {   // reçus faits au nom de cette personne par un autre compte (lien permanent)
    const d = load();
    return Object.entries(d.receipts || {}).filter(([, r]) => r.vuPar === email && r.file).map(([id, r]) => ({ id: poignee(id), numero: r.numero, date: r.dateDon, year: new Date(r.dateDon).getFullYear(), montant: r.montant, affectation: r.affectation || '', nom: r.nom, par: titulaire((d.users || {})[r.donorEmail]), pdf: signUrl(r.file, 900) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  function receiptsOf(email) {
    const d = load(), u = (d.users || {})[email];
    // reçus en ligne ET reçus saisis à la main dans le CRM (virement, chèque, espèces) : tous ceux établis à cette adresse e-mail
    return [...Object.entries(d.receipts || {}), ...Object.entries(d.manuels || {}).map(([id, r]) => [id, { ...r, manuel: true }])].filter(([, r]) => r.donorEmail === email && r.file).map(([id, r]) => ({ id, manuel: !!r.manuel, form: r.form ? { prenom: r.form.prenom || '', nom: r.form.nom || '', raisonSociale: r.form.raisonSociale || '', siren: r.form.siren || '', adresse: r.form.adresse || '', cp: r.form.cp || '', ville: r.form.ville || '', tel: r.form.tel || '', email: r.form.emailProfil || '' } : null, proche: r.proche ? (() => { const p = prochesDe(u).find(x => x.id === r.proche); return { supprime: !p || !!p.supprime, lie: !!(p && p.lien && p.partage) }; })() : null, remplace: r.remplace || '', corrigeable: !!r.form && !r.manuel && !nonCorrigeable(r), numero: r.numero, date: r.dateDon, year: new Date(r.dateDon).getFullYear(), montant: r.montant, affectation: r.affectation || '', mode: r.mode, type: r.type, nom: r.nom, mensuel: !!r.mensuel, echeance: r.echeance || null, pdf: signUrl(r.file, 900) }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function mount(app) {
    const reqLog = new Map(), ipLog = new Map();
    const recent = (m, k, win) => { const now = Date.now(), a = (m.get(k) || []).filter(t => now - t < win); m.set(k, a); return a; };

    app.post('/api/auth/request', async (req, res) => {
      try {
        if (!sameOrigin(req, res)) return;
        const email = normEmail(req.body.email); if (!emailOk(email)) return res.status(400).json({ error: 'Adresse email invalide' });
        const a = recent(reqLog, email, OTP_MIN * 60000), b = recent(ipLog, ipOf(req), OTP_MIN * 60000);
        if (a.length >= 3 || b.length >= 10) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans quelques minutes.' });
        a.push(Date.now()); b.push(Date.now());
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'), salt = crypto.randomBytes(8).toString('hex');
        const d = load(); d.otps = d.otps || {}; d.otps[email] = { hash: sha(salt + code), salt, exp: Date.now() + OTP_MIN * 60000, tries: 0 }; save(d);
        let sent = { simulated: true };
        const m = await mailer.otpEmail(email, code);
        if (m) sent = await mailer.send({ to: email, subject: m.subject, html: m.html, text: m.text });
        if (sent.simulated) console.log('[connexion] email non envoyé (' + (sent.reason || 'test') + ')' + (process.env.DEV_SHOW_CODE === '1' ? ' · code ' + code : ''));
        // même réponse que l'adresse existe ou non : on ne révèle rien sur les comptes
        res.json({ ok: true, ...(process.env.DEV_SHOW_CODE === '1' && isLocal(req) ? { devCode: code } : {}) });
      } catch (e) { console.error('[connexion]', e.message); res.status(502).json({ error: "Impossible d'envoyer le code pour le moment. Réessayez dans un instant." }); }
    });

    app.post('/api/auth/verify', (req, res) => {
      if (!sameOrigin(req, res)) return;
      const email = normEmail(req.body.email), code = String(req.body.code || '').replace(/\D/g, '');
      const d = load(), o = (d.otps || {})[email];
      if (!o || o.exp < Date.now()) return res.status(400).json({ error: 'Code expiré. Demandez un nouveau code.' });
      if (o.tries >= OTP_TRIES) { delete d.otps[email]; save(d); return res.status(429).json({ error: 'Trop d\'essais. Demandez un nouveau code.' }); }
      if (code.length !== 6 || !safeEq(sha(o.salt + code), o.hash)) { o.tries++; save(d); return res.status(400).json({ error: 'Code incorrect' + (OTP_TRIES - o.tries > 0 ? ` (${OTP_TRIES - o.tries} essai${OTP_TRIES - o.tries > 1 ? 's' : ''} restant${OTP_TRIES - o.tries > 1 ? 's' : ''})` : '') }); }
      delete d.otps[email];                                                  // le code ne sert qu'une fois
      ensureUser(d, email);
      d.users[email].verifiedAt = Date.now();
      // à la première connexion, le profil est repris du dernier don fait avec cette adresse
      if (!Object.keys(d.users[email].profiles).length) { const last = Object.values(d.receipts || {}).filter(r => r.donorEmail === email && r.form).pop(); if (last) { try { const k = kindOf(last.type); d.users[email].profiles[k] = cleanProfile(k, last.form); d.users[email].last = k; } catch (e) {} } }
      const token = crypto.randomBytes(32).toString('hex'); d.sessions = d.sessions || {};
      for (const [k, s] of Object.entries(d.sessions)) if (s.exp < Date.now()) delete d.sessions[k];
      d.sessions[sha(token)] = { email, createdAt: Date.now(), exp: Date.now() + SESSION_DAYS * 86400000 }; relier(d); save(d);
      setCookie(req, res, token, SESSION_DAYS * 86400);
      res.json({ ok: true, email, id: d.users[email].id, profiles: profilsVus(d.users[email].profiles), last: d.users[email].last || null });
    });

    app.post('/api/auth/logout', (req, res) => {
      if (!sameOrigin(req, res)) return;
      const s = getSession(req); if (s) { const d = load(); delete d.sessions[s.hash]; save(d); }
      setCookie(req, res, '', 0); res.json({ ok: true });
    });

    app.get('/api/me', (req, res) => {
      const s = requireUser(req, res); if (!s) return;
      try {   // connexion gardée : la session est prolongée à chaque visite (au plus une fois par semaine), pour que le donateur reste connecté
        const t = cookies(req).don_sid, d = load(), ss = (d.sessions || {})[s.hash];
        if (ss && ss.exp - Date.now() < (SESSION_DAYS - 7) * 86400000) { ss.exp = Date.now() + SESSION_DAYS * 86400000; save(d); setCookie(req, res, t, SESSION_DAYS * 86400); }
      } catch (e) { /* la session reste valable */ }
      { const d = load(); if (!(d.users || {})[s.email] || !d.users[s.email].id) { ensureUser(d, s.email); save(d); } }   // anciens comptes : numéro de compte attribué
      const u = (load().users || {})[s.email] || { profiles: {} };
      res.json({ email: s.email, id: u.id || '', profiles: profilsVus(u.profiles), last: u.last || null });
    });
    app.put('/api/me/profile', (req, res) => {
      try {
        if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
        const k = kindOf(req.body.kind), p = cleanProfile(k, req.body.data || {}), d = load();
        poserProfil(ensureUser(d, s.email), k, p); if (k === 'particulier') propager(d, s.email); relier(d); save(d);
        res.json({ ok: true, profiles: profilsVus(d.users[s.email].profiles) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    // proches : créer / modifier (case d'accord obligatoire à la création et si le nom change), supprimer
    app.put('/api/me/proche', (req, res) => {
      try {
        if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
        const p = cleanProche(req.body.data || {}), d = load(), u = ensureUser(d, s.email), l = u.profiles.proches = u.profiles.proches || [];
        const id = String(req.body.id || ''), cur = id ? l.find(x => x.id === id && !x.supprime) : null;
        if (id && !cur) throw new Error('Profil introuvable. Rechargez la page.');
        if (cur && cur.lien && cur.partage) throw new Error('Ce profil est relié à l\'espace de la personne : ses informations se mettent à jour toutes seules.');
        if (l.some(x => !x.supprime && x !== cur && idt(x, x.email) === idt(p, p.email))) throw new Error('Ce profil existe déjà dans votre compte.');
        const nomChange = !cur || normTxt(cur.prenom) !== normTxt(p.prenom) || normTxt(cur.nom) !== normTxt(p.nom);
        if (nomChange && req.body.accord !== true) throw new Error("Cochez la case : la personne doit être d'accord pour qu'un reçu fiscal soit établi à son nom.");
        let out;
        if (cur) { if (!memePersonne(cur, p)) { cur.lien = null; cur.partage = false; } Object.assign(cur, p); if (nomChange) cur.accordAt = Date.now(); cur.modifAt = Date.now(); out = cur; }   // le lien est réévalué juste après (relier)
        else { if (l.filter(x => !x.supprime).length >= 30) throw new Error('30 profils au maximum.'); out = { id: 'P' + crypto.randomBytes(6).toString('hex'), ...p, accordAt: Date.now(), createdAt: Date.now() }; l.push(out); }
        relier(d); save(d);
        res.json({ ok: true, id: out.id, profiles: profilsVus(u.profiles) });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.delete('/api/me/proche/:id', (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const d = load(), u = ensureUser(d, s.email), p = prochesDe(u).find(x => x.id === String(req.params.id));
      if (p) { p.supprime = true; p.supprimeAt = Date.now(); save(d); }   // les reçus déjà faits restent (et restent visibles de la personne reliée)
      res.json({ ok: true, profiles: profilsVus(u.profiles) });
    });
    // « Ce n'est pas moi » : la personne reliée coupe le lien ; elle ne voit plus ces reçus, l'association est alertée
    app.post('/api/me/offerts/:id/refuser', async (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const d = load(), h = String(req.params.id), r = (Object.entries(d.receipts || {}).find(([id, x]) => x.vuPar === s.email && poignee(id) === h) || [])[1];
      if (!r) return res.status(404).json({ error: 'Reçu introuvable' });
      const numeros = couper(d, s.email, r.donorEmail); save(d);
      await alerteRefus(s.email, r.donorEmail, numeros);
      res.json({ ok: true });
    });
    // liens : accepter / arrêter la mise à jour automatique de ses informations, ou couper le lien (même sans reçu)
    const lienDe = (d, email, pid) => { for (const u of Object.values(d.users || {})) { const p = prochesDe(u).find(x => x.id === pid && x.lien === email && !x.supprime); if (p) return { u, p }; } return null; };
    app.post('/api/me/liens/:pid/partage', (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const d = load(), l = lienDe(d, s.email, String(req.params.pid)); if (!l) return res.status(404).json({ error: 'Lien introuvable' });
      l.p.partage = req.body.on === true; if (l.p.partage) propager(d, s.email); relier(d); save(d);
      res.json({ ok: true, partage: l.p.partage });
    });
    app.post('/api/me/liens/:pid/refuser', async (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const d = load(), l = lienDe(d, s.email, String(req.params.pid)); if (!l) return res.status(404).json({ error: 'Lien introuvable' });
      const numeros = couper(d, s.email, l.u.email); save(d);
      await alerteRefus(s.email, l.u.email, numeros);
      res.json({ ok: true });
    });
    app.delete('/api/me/profile/:kind', (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const k = kindOf(req.params.kind), d = load(), u = d.users[s.email]; u.profiles = u.profiles || {};
      if (k === 'pro' && req.query.cle) { const l = (u.profiles.pros || (u.profiles.pro ? [u.profiles.pro] : [])).filter(x => cleSoc(x) !== String(req.query.cle)); u.profiles.pros = l; if (l.length) u.profiles.pro = l[0]; else { delete u.profiles.pro; delete u.profiles.pros; } }
      else { delete u.profiles[k]; if (k === 'pro') delete u.profiles.pros; }
      if (u.last === k && !u.profiles[k]) u.last = u.profiles.particulier ? 'particulier' : (u.profiles.pro ? 'pro' : null); save(d);
      res.json({ ok: true, profiles: profilsVus(u.profiles) });
    });
    app.get('/api/me/receipts', (req, res) => {
      const s = requireUser(req, res); if (!s) return;
      const list = receiptsOf(s.email), years = {};
      list.forEach(r => { const y = years[r.year] = years[r.year] || { year: r.year, total: 0, count: 0 }; y.total += r.montant; y.count++; });
      res.json({ email: s.email, receipts: list, offerts: offertsOf(s.email), liens: liensOf(s.email), years: Object.values(years).sort((a, b) => b.year - a.year) });
    });

    // PDF / email : lien signé (valable un temps limité) OU propriétaire connecté
    app.get('/recus/:file', (req, res) => {
      const f = req.params.file; if (!/^recu_[A-Za-z0-9_.-]+\.(pdf|eml)$/.test(f)) return res.status(404).end();
      const p = path.join(RECUS, f); if (!fs.existsSync(p)) return res.status(404).end();
      const base = f.replace(/\.eml$/, '.pdf'), dd = load();
      if ([...Object.values(dd.receipts || {}), ...Object.values(dd.manuels || {})].some(r => (r.corrections || []).some(c => c.file === base))) return res.status(403).type('text').send('Ce reçu a été annulé et remplacé. Retrouvez le nouveau reçu dans votre espace donateur.');
      const e = Number(req.query.e), s = String(req.query.s || ''); let ok = e > Date.now() / 1000 && safeEq(s, sig(f, e));
      if (!ok) { const ses = getSession(req); if (ses) ok = Object.values(dd.receipts || {}).some(r => r.file === base && (r.donorEmail === ses.email || (r.vuPar === ses.email && !f.endsWith('.eml')))) || Object.values(dd.manuels || {}).some(r => r.file === base && r.donorEmail === ses.email); }
      if (!ok) return res.status(403).type('text').send('Lien expiré ou non autorisé. Reconnectez-vous à votre espace donateur.');
      let buf; try { buf = vault.readFile(p); } catch (e) { console.error('[recus] fichier illisible', f); return res.status(500).end(); }
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Disposition', 'inline'); if (f.endsWith('.eml')) res.type('message/rfc822'); else res.type('application/pdf'); res.send(buf);
    });
  }
  return { memePersonne, liensOf, mount, getSession, publicReceipt, signUrl, saveProfileFromForm, kindOf, cleanProfile, cleanProche, procheDe, prochesDe, relier, propager, poserProfil, ensureUser, nonCorrigeable, idt, normTxt };
};
