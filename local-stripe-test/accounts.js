/* Espace donateur : connexion par code à 6 chiffres (sans mot de passe), profils particulier / professionnel,
   liste des reçus par année, téléchargement protégé des PDF.
   Données dans data.json : users, sessions, otps, urlSecret (jamais commité). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function create({ load, save, RECUS, clean, sirenValide, mailer }) {
  const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
  const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 160);
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const ipOf = req => String(req.headers['cf-connecting-ip'] || req.ip || '');
  const isLocal = req => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') && !req.headers['cf-connecting-ip'];
  const SESSION_DAYS = 30, OTP_MIN = 10, OTP_TRIES = 5;

  // ---------- liens signés pour les PDF ----------
  function secret() { const d = load(); if (!d.urlSecret) { d.urlSecret = crypto.randomBytes(32).toString('hex'); save(d); } return d.urlSecret; }
  const sig = (file, exp) => crypto.createHmac('sha256', secret()).update(file + '.' + exp).digest('hex').slice(0, 32);
  function signUrl(file, ttl = 3600) { const f = path.basename(file), e = Math.floor(Date.now() / 1000) + ttl; return `/recus/${f}?e=${e}&s=${sig(f, e)}`; }
  function publicReceipt(out) {   // les liens renvoyés au navigateur expirent ; le PDF n'est jamais public
    const o = { ...out }; if (o.pdf) o.pdf = signUrl(o.pdf);
    if (o.email && o.email.eml) o.email = { ...o.email, eml: signUrl(o.email.eml) };
    delete o.donorEmail; delete o.file; return o;
  }

  // ---------- sessions ----------
  function cookies(req) { const o = {}; String(req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
  function getSession(req) {
    const t = cookies(req).sid; if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
    const d = load(), s = (d.sessions || {})[sha(t)]; if (!s || s.exp < Date.now()) return null;
    return { email: s.email, hash: sha(t) };
  }
  function setCookie(req, res, value, maxAgeSec) {
    const https = /https/i.test(String(req.headers['x-forwarded-proto'] || '')) || req.secure;
    res.setHeader('Set-Cookie', `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${https ? '; Secure' : ''}`);
  }
  function requireUser(req, res) { const s = getSession(req); if (!s) { res.status(401).json({ error: 'Non connecté' }); return null; } return s; }
  // contrôle d'origine : une page d'un autre site ne peut pas agir au nom du donateur
  function sameOrigin(req, res) { const o = req.headers.origin; if (o) { try { if (new URL(o).host !== req.headers.host) { res.status(403).json({ error: 'Origine non autorisée' }); return false; } } catch (e) { res.status(403).json({ error: 'Origine non autorisée' }); return false; } } return true; }

  // ---------- profils ----------
  function cleanProfile(kind, b) {
    const rue = clean(b.adresse, 140), cp = clean(b.cp, 10), ville = clean(b.ville, 80);
    if (rue.length < 3 || !/^\d{5}$/.test(cp) || ville.length < 2) throw new Error('Adresse complète requise (rue, code postal à 5 chiffres, ville)');
    if (kind === 'particulier') {
      const prenom = clean(b.prenom, 60), nom = clean(b.nom, 60); if (!prenom || !nom) throw new Error('Prénom et nom requis');
      return { prenom, nom, adresse: rue, cp, ville };
    }
    const rs = clean(b.raisonSociale, 120), siren = String(b.siren || '').replace(/\s/g, ''); if (!rs) throw new Error('Raison sociale requise');
    if (siren && !sirenValide(siren)) throw new Error('SIREN invalide (9 chiffres)');
    return { raisonSociale: rs, siren, adresse: rue, cp, ville };
  }
  const kindOf = t => (t === 'entreprise' || t === 'pro') ? 'pro' : 'particulier';
  function saveProfileFromForm(email, type, form) {   // appelée après un don, si le donateur l'a demandé
    try {
      const k = kindOf(type), p = cleanProfile(k, form || {}), d = load(); const u = (d.users || {})[email]; if (!u) return false;
      u.profiles = u.profiles || {}; u.profiles[k] = p; u.last = k; save(d); return true;
    } catch (e) { return false; }
  }
  function receiptsOf(email) {
    const d = load();
    return Object.entries(d.receipts || {}).filter(([, r]) => r.donorEmail === email && r.file).map(([id, r]) => ({ id, numero: r.numero, date: r.dateDon, year: new Date(r.dateDon).getFullYear(), montant: r.montant, affectation: r.affectation || '', mode: r.mode, type: r.type, nom: r.nom, mensuel: !!r.mensuel, echeance: r.echeance || null, pdf: signUrl(r.file, 900) }))
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
      d.users = d.users || {}; if (!d.users[email]) d.users[email] = { email, createdAt: Date.now(), profiles: {} };
      d.users[email].verifiedAt = Date.now();
      // à la première connexion, le profil est repris du dernier don fait avec cette adresse
      if (!Object.keys(d.users[email].profiles).length) { const last = Object.values(d.receipts || {}).filter(r => r.donorEmail === email && r.form).pop(); if (last) { try { const k = kindOf(last.type); d.users[email].profiles[k] = cleanProfile(k, last.form); d.users[email].last = k; } catch (e) {} } }
      const token = crypto.randomBytes(32).toString('hex'); d.sessions = d.sessions || {};
      for (const [k, s] of Object.entries(d.sessions)) if (s.exp < Date.now()) delete d.sessions[k];
      d.sessions[sha(token)] = { email, createdAt: Date.now(), exp: Date.now() + SESSION_DAYS * 86400000 }; save(d);
      setCookie(req, res, token, SESSION_DAYS * 86400);
      res.json({ ok: true, email, profiles: d.users[email].profiles, last: d.users[email].last || null });
    });

    app.post('/api/auth/logout', (req, res) => {
      if (!sameOrigin(req, res)) return;
      const s = getSession(req); if (s) { const d = load(); delete d.sessions[s.hash]; save(d); }
      setCookie(req, res, '', 0); res.json({ ok: true });
    });

    app.get('/api/me', (req, res) => {
      const s = requireUser(req, res); if (!s) return;
      const u = (load().users || {})[s.email] || { profiles: {} };
      res.json({ email: s.email, profiles: u.profiles || {}, last: u.last || null });
    });
    app.put('/api/me/profile', (req, res) => {
      try {
        if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
        const k = kindOf(req.body.kind), p = cleanProfile(k, req.body.data || {}), d = load();
        d.users[s.email].profiles = d.users[s.email].profiles || {}; d.users[s.email].profiles[k] = p; d.users[s.email].last = k; save(d);
        res.json({ ok: true, profiles: d.users[s.email].profiles });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.delete('/api/me/profile/:kind', (req, res) => {
      if (!sameOrigin(req, res)) return; const s = requireUser(req, res); if (!s) return;
      const k = kindOf(req.params.kind), d = load(), u = d.users[s.email]; if (u.profiles) delete u.profiles[k]; if (u.last === k) u.last = Object.keys(u.profiles || {})[0] || null; save(d);
      res.json({ ok: true, profiles: u.profiles || {} });
    });
    app.get('/api/me/receipts', (req, res) => {
      const s = requireUser(req, res); if (!s) return;
      const list = receiptsOf(s.email), years = {};
      list.forEach(r => { const y = years[r.year] = years[r.year] || { year: r.year, total: 0, count: 0 }; y.total += r.montant; y.count++; });
      res.json({ email: s.email, receipts: list, years: Object.values(years).sort((a, b) => b.year - a.year) });
    });

    // PDF / email : lien signé (valable un temps limité) OU propriétaire connecté
    app.get('/recus/:file', (req, res) => {
      const f = req.params.file; if (!/^recu_[A-Za-z0-9_.-]+\.(pdf|eml)$/.test(f)) return res.status(404).end();
      const p = path.join(RECUS, f); if (!fs.existsSync(p)) return res.status(404).end();
      const e = Number(req.query.e), s = String(req.query.s || ''); let ok = e > Date.now() / 1000 && safeEq(s, sig(f, e));
      if (!ok) { const ses = getSession(req); if (ses) { const base = f.replace(/\.eml$/, '.pdf'); ok = Object.values(load().receipts || {}).some(r => r.file === base && r.donorEmail === ses.email); } }
      if (!ok) return res.status(403).type('text').send('Lien expiré ou non autorisé. Reconnectez-vous à votre espace donateur.');
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Content-Disposition', 'inline'); if (f.endsWith('.eml')) res.type('message/rfc822'); else res.type('application/pdf'); res.sendFile(p);
    });
  }
  return { mount, getSession, publicReceipt, signUrl, saveProfileFromForm, kindOf, cleanProfile };
};
