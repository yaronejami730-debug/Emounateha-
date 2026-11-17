// PIXEL META (3623623251140424) — consentement, bandeau, événement « Donate ».
// Serveur de dons neuf (port 3185, données jetables) + petit serveur du site www (fichiers de public/, port 3184), vrai navigateur.
// RIEN n'est jamais envoyé à Meta : toute requête vers facebook.* est interceptée et coupée par le test ; on regarde seulement si la page l'a DEMANDÉE.
// Règles vérifiées : pixel chargé seulement avec em_ok=2, jamais avant / en cas de refus / ancien accord (1) / en local ; bandeau pour fbclid ;
// « Donate » une seule fois par don, avec montant + devise + identifiant du paiement et rien d'autre ; la CSP du serveur de dons laisse passer Meta.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, '..', 'public');
const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer-core'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DON = 'http://127.0.0.1:3185', WWW = 'http://127.0.0.1:3184', PIXEL = '3623623251140424', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const www = http.createServer((q, r) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(SITE, u); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('{}'); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(3184, '127.0.0.1');
const site = http.createServer((q, r) => { r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3183, '127.0.0.1');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3185', SITE_URL: 'http://127.0.0.1:3183', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: 'essai-' + Date.now() }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let browser;
const fin = async () => { try { await browser.close(); } catch (e) {} try { process.kill(-srv.pid); } catch (e) { srv.kill(); } www.close(); site.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };

// ouvre une page : cookie de choix (em_ok), mode « vrai site » simulé (__emTest) ou non (local), paramètre fbclid, et enregistre ce que la page demande à Meta
async function ouvre(base, chemin, { em, emTest, fbclid, w = 390 } = {}) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); p.close = () => ctx.close(); const o = { fb: [], clarity: [], csp: [], err: [] };   // navigateur vierge à chaque page : aucun cookie hérité d'un essai précédent
  await p.setViewport({ width: w, height: 780, isMobile: w < 600, hasTouch: w < 600 });
  await p.setRequestInterception(true);
  p.on('request', r => { const u = r.url(); if (/facebook\.(net|com)/.test(u)) { o.fb.push(u); return r.abort(); } if (/clarity\.ms/.test(u)) { o.clarity.push(u); return r.abort(); } r.continue(); });
  p.on('pageerror', e => o.err.push(e.message));
  await p.evaluateOnNewDocument(t => { if (t) window.__emTest = true; window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.blockedURI + ' | ' + e.violatedDirective)); }, !!emTest);
  if (em !== undefined) await p.setCookie({ name: 'em_ok', value: String(em), url: base });
  await p.goto(base + chemin + (fbclid ? (chemin.includes('?') ? '&' : '?') + 'fbclid=IwAR_essai' : ''), { waitUntil: 'networkidle2' }); await wait(500);
  p._o = o; return p;
}
const etat = p => p.evaluate(() => ({ fbq: typeof window.fbq === 'function', queue: window.fbq && window.fbq.queue ? Array.from(window.fbq.queue, a => Array.from(a)) : [], banniere: !!document.getElementById('emck'), csp: window.__csp.filter(x => /facebook/.test(x)) }));
const aDemandeMeta = p => p._o.fb.some(u => /connect\.facebook\.net\/.*fbevents\.js/.test(u));

(async () => {
  for (let k = 0; k < 60; k++) { try { if ((await fetch(DON + '/api/config')).ok) break; } catch (e) {} await wait(250); }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  for (const [nom, base, chemin] of [['don.emounateha.fr', DON, '/'], ['www.emounateha.fr', WWW, '/']]) {
    T(nom + ' : le pixel n\'est chargé que sur accord');
    let p = await ouvre(base, chemin, { emTest: true }), e = await etat(p);
    ok(!aDemandeMeta(p) && !e.fbq && !e.banniere, 'aucun choix : pixel non chargé, pas de bandeau (visiteur ordinaire)', { fb: p._o.fb, e }); await p.close();
    p = await ouvre(base, chemin, { em: 0, emTest: true }); e = await etat(p);
    ok(!aDemandeMeta(p) && !e.fbq, 'refus (em_ok=0) : rien n\'est chargé', { fb: p._o.fb, e }); await p.close();
    p = await ouvre(base, chemin, { em: 1, emTest: true }); e = await etat(p);
    ok(!aDemandeMeta(p) && !e.fbq, 'ancien accord (em_ok=1, e-mail seulement) : pixel non chargé', { fb: p._o.fb, e }); await p.close();
    p = await ouvre(base, chemin, { em: 2 }); e = await etat(p);
    ok(!aDemandeMeta(p) && !e.fbq, 'accord mais en local / aperçu (pas le vrai site) : pixel non chargé', { fb: p._o.fb, e }); await p.close();
    p = await ouvre(base, chemin, { em: 2, emTest: true }); e = await etat(p);
    ok(aDemandeMeta(p) && e.fbq, 'accord (em_ok=2) sur le vrai site : le pixel est demandé à Meta', { fb: p._o.fb, e });
    ok(e.queue.some(a => a[0] === 'init' && a[1] === PIXEL) && e.queue.some(a => a[0] === 'track' && a[1] === 'PageView'), 'initialisé avec le bon pixel (' + PIXEL + ') et PageView', e.queue);
    ok(!e.csp.length && !p._o.err.length, 'aucune règle de sécurité (CSP) ni erreur JavaScript ne bloque le pixel', { csp: e.csp, err: p._o.err }); await p.close();

    T(nom + ' : bandeau pour les visiteurs venus d\'une publicité Meta (fbclid)');
    p = await ouvre(base, chemin, { emTest: true, fbclid: true }); e = await etat(p);
    ok(e.banniere && !aDemandeMeta(p) && !e.fbq, 'fbclid sans choix : le bandeau s\'affiche, rien n\'est chargé avant le choix', { fb: p._o.fb, e });
    const txt = await p.evaluate(() => (document.getElementById('emck') || {}).innerText || '');
    ok(/pixel Meta/i.test(txt) && !/Aucune publicité/i.test(txt) && /Aucune revente/i.test(txt), 'texte du bandeau : mentionne le pixel Meta, plus « Aucune publicité »', txt.slice(0, 300));
    await p.click('#emck button[data-v="1"]'); await wait(800); e = await etat(p);
    ok(aDemandeMeta(p) && e.fbq && e.queue.some(a => a[0] === 'init' && a[1] === PIXEL), 'clic « Accepter » : le pixel est chargé alors seulement', { fb: p._o.fb, e });
    ok(!(await p.evaluate(() => !!document.getElementById('emck'))) && (await p.cookies()).some(c => c.name === 'em_ok' && c.value === '2'), 'le choix est retenu (em_ok=2) et le bandeau disparaît'); await p.close();
    p = await ouvre(base, chemin, { emTest: true, fbclid: true });
    await p.click('#emck button[data-v="0"]'); await wait(800); e = await etat(p);
    ok(!aDemandeMeta(p) && !e.fbq && (await p.cookies()).some(c => c.name === 'em_ok' && c.value === '0'), 'clic « Refuser » : rien n\'est chargé, refus retenu (em_ok=0)', { fb: p._o.fb, e }); await p.close();
    p = await ouvre(base, chemin, { emTest: true }); e = await etat(p);
    ok(!e.banniere, 'sans fbclid ni e-mail : toujours pas de bandeau'); await p.close();
    p = await ouvre(base, chemin, { em: 2, emTest: true, fbclid: true }); e = await etat(p);
    ok(!e.banniere && aDemandeMeta(p), 'fbclid avec un choix déjà fait : pas de nouveau bandeau', e); await p.close();

    T(nom + ' : retrait de l\'accord');
    p = await ouvre(base, chemin, { em: 2, emTest: true });
    await p.setCookie({ name: '_fbp', value: 'fb.1.essai', url: base }, { name: '_fbc', value: 'fb.1.essai', url: base });
    await p.evaluate(() => window.emConsent.ouvrir()); await wait(300); await p.click('#emck button[data-v="0"]'); await wait(500); e = await etat(p);
    ok(e.queue.some(a => a[0] === 'consent' && a[1] === 'revoke'), 'refus après coup : le pixel reçoit « revoke »', e.queue);
    ok(!(await p.cookies()).some(c => c.name === '_fbp' || c.name === '_fbc'), 'cookies _fbp et _fbc effacés'); await p.close();
  }

  T('Événement « Donate » (page de don)');
  let p = await ouvre(DON, '/', { em: 2, emTest: true });
  await p.evaluate(() => { pixelDon('pi_3EssaiUn', 1850); pixelDon('pi_3EssaiUn', 1850); pixelDon('pi_3EssaiDeux', 1800); pixelDon('pas-un-paiement', 1800); pixelDon('pi_3EssaiTrois', 0); pixelDon('pi_3EssaiQuatre', undefined); });
  let e = await etat(p), dons = e.queue.filter(a => a[0] === 'track' && a[1] === 'Donate');
  ok(dons.length === 2, 'un seul événement par don (appel répété ignoré, identifiant invalide ou montant nul ignorés)', dons);
  ok(JSON.stringify(dons[0]) === JSON.stringify(['track', 'Donate', { value: 18.5, currency: 'EUR' }, { eventID: 'pi_3EssaiUn' }]), 'forme exacte : montant réel en euros, EUR, eventID = identifiant du paiement', dons[0]);
  ok(dons.every(a => Object.keys(a[2]).sort().join() === 'currency,value' && Object.keys(a[3]).join() === 'eventID'), 'rien d\'autre n\'est envoyé (ni nom, ni e-mail, ni adresse)', dons);
  await p.reload({ waitUntil: 'networkidle2' }); await wait(400);
  await p.evaluate(() => pixelDon('pi_3EssaiUn', 1850)); e = await etat(p);
  ok(e.queue.filter(a => a[0] === 'track' && a[1] === 'Donate').length === 0, 'retour/rechargement de la page (PayPal, Klarna) : le même don n\'est pas renvoyé', e.queue); await p.close();
  for (const [lib, opt] of [['refus', { em: 0, emTest: true }], ['aucun choix', { emTest: true }], ['ancien accord (1)', { em: 1, emTest: true }], ['accord mais en local', { em: 2 }]]) {
    p = await ouvre(DON, '/', opt); await p.evaluate(() => pixelDon('pi_3EssaiCinq', 1800)); e = await etat(p);
    ok(!e.queue.some(a => a[1] === 'Donate') && !aDemandeMeta(p), lib + ' : aucun événement « Donate », rien envoyé', e.queue); await p.close();
  }
  const src = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  ok(/pixelDon\(paymentIntent\.id, paymentIntent\.amount_received \|\| paymentIntent\.amount\);\s*renderRes/.test(src), 'branché sur Apple Pay / Google Pay (paiement abouti)');
  ok(/if \(paymentIntent\.status === 'succeeded'\) pixelDon\(paymentIntent\.id, paymentIntent\.amount_received \|\| paymentIntent\.amount\);/.test(src), 'branché sur la carte et les autres moyens, seulement si le paiement a abouti (pas « processing »)');
  ok(/if \(st === 'succeeded' && r && !r\.attente\) pixelDon\(id, r\.montant\)/.test(src), 'branché sur le retour PayPal / Klarna / 3D Secure réussi (montant réel vérifié par le serveur)');
  ok((src.match(/'track', 'Donate'/g) || []).length === 1 && !/fbq\([^)]*(email|prenom|nom|adresse|tel)/i.test(src), 'un seul endroit envoie « Donate », sans donnée personnelle');

  T('Sécurité (CSP) du serveur de dons');
  const h = (await fetch(DON + '/')).headers.get('content-security-policy') || '';
  ok(/script-src[^;]*connect\.facebook\.net/.test(h) && /connect-src[^;]*www\.facebook\.com/.test(h), 'la CSP autorise le script et les envois du pixel Meta', h.slice(0, 200));

  T('Fichiers du site');
  ok(fs.readFileSync(path.join(SITE, 'consentement.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'public', 'consentement.js'), 'utf8'), 'consentement.js identique sur www et sur don');
  const vs = new Set(); let nb = 0; const parcourir = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|^\./.test(f.name)) parcourir(q); } else if (f.name.endsWith('.html')) { const m = fs.readFileSync(q, 'utf8').match(/consentement\.js\?v=(\d+)/); if (m) { vs.add(m[1]); nb++; } } } };
  parcourir(SITE); parcourir(path.join(ROOT, 'public'));
  ok(nb >= 16 && vs.size === 1 && Number([...vs][0]) >= 4, 'toutes les pages (' + nb + ') chargent la même version de consentement.js (v=' + [...vs].join() + ')', [...vs]);
  const conf = fs.readFileSync(path.join(SITE, 'confidentialite', 'index.html'), 'utf8');
  ok(/pixel Meta/.test(conf) && /_fbp, _fbc/.test(conf) && /Meta Platforms Ireland/.test(conf) && !/aucune publicité/i.test(conf), 'page /confidentialite/ : pixel Meta, cookies et sous-traitant décrits, plus de « aucune publicité »');
  fin();
})().catch(e => { console.log('  ECHEC erreur du test', e.message); fail++; fin(); });
