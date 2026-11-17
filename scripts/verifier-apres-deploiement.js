#!/usr/bin/env node
/* CONTRÔLE DU SITE EN LIGNE — à lancer juste APRÈS chaque déploiement (voir DEPLOIEMENT.md).
   Ne paie rien et ne crée rien : il ouvre les vraies pages dans Chrome, clique sur les boutons de don et vérifie que le formulaire s'ouvre.
   Au moindre échec : code 1 → il faut revenir en arrière tout de suite (rollback). */
const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'local-stripe-test', 'node_modules', 'puppeteer-core'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 400)); };
const etat = p => p.evaluate(() => { const g = document.getElementById('go'), r = g && g.getBoundingClientRect(); return { accueil: document.body.classList.contains('camp-accueil'), goVisible: !!(r && r.height > 0), go: g ? g.textContent.trim() : '', montant: (document.getElementById('montant') || {}).value }; });
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const ouvre = async (url, w, h) => { const p = await b.newPage(); p._err = []; p.on('pageerror', e => p._err.push(e.message)); await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 }); await p.goto(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { waitUntil: 'networkidle2' }); return p; };
  for (const [nom, w, h] of [['téléphone', 390, 780], ['ordinateur', 1280, 800]]) {
    console.log('\n— ' + nom);
    for (const [lib, url, bouton, montant] of [['Club ’Haï', 'https://clubhai.emounateha.fr/', /^Rejoindre pour 18 €/, '18'], ['Club ’Haï (adresse du site de dons)', 'https://don.emounateha.fr/campagne/club', /^Rejoindre pour 18 €/, '18']]) {
      const p = await ouvre(url, w, h);
      const t = await p.$eval('.cp-pan .cp-go', x => x.textContent.trim()).catch(() => '');
      ok(bouton.test(t), lib + ' : bouton « ' + t + ' »');
      await p.evaluate(() => document.querySelector('.cp-pan .cp-go').click()); await wait(1500);
      const e = await etat(p);
      ok(!e.accueil && e.goVisible && e.montant === montant, lib + ' : le clic ouvre le formulaire de don', e);
      ok(await p.evaluate(() => !/Ils ont rejoint/i.test(document.body.innerText)), lib + ' : aucune liste « Ils ont rejoint le Club ’Haï » (même avec des membres)');
      ok(!p._err.length, lib + ' : aucune erreur JavaScript', p._err); await p.close();
    }
    const p = await ouvre('https://don.emounateha.fr/', w, h); const e = await etat(p);
    ok(e.goVisible && /Continuer/.test(e.go), 'page de don : bouton « Continuer » visible', e); ok(!p._err.length, 'page de don : aucune erreur JavaScript', p._err); await p.close();
  }
  console.log('\n— boutons du site');
  { const h = await (await fetch('https://www.emounateha.fr/?v=' + Date.now())).text(), c = await (await fetch('https://www.emounateha.fr/colis/?v=' + Date.now())).text();
    ok(/class="pillgold" href="https:\/\/clubhai\.emounateha\.fr\/"/.test(h) && !/api\/besoins-accueil/.test(h), 'accueil : bouton « Club ’Haï » présent, plus de boutons de cagnottes');
    ok(/class="plusbesoin"><a class="pillgold" href="https:\/\/don\.emounateha\.fr\/\?aff=besoin"/.test(c), 'colis : bouton « Là où il y en a le plus besoin » présent');
    const p = await ouvre('https://don.emounateha.fr/?aff=besoin', 390, 780); let v = null; for (let k = 0; k < 20 && !v; k++) { v = await p.evaluate(() => { const x = document.querySelector('input[name=affr]:checked'); return x && /besoin est le plus grand/i.test(x.value) ? x.value : null; }); if (!v) await wait(500); }   // la page coche le choix un instant après son chargement
    ok(v && /besoin est le plus grand/i.test(v), 'le lien du bouton ouvre le don « là où le besoin est le plus grand »', v); await p.close(); }
  console.log('\n— pixel Meta (aucune requête n\'est envoyée à Meta : elles sont coupées par ce contrôle)');
  for (const [lib, base] of [['www.emounateha.fr', 'https://www.emounateha.fr'], ['don.emounateha.fr', 'https://don.emounateha.fr']]) {
    const ctx = async (cookie, q) => { const c = await b.createBrowserContext(), p = await c.newPage(), fb = []; p._ctx = c; await p.setRequestInterception(true); p.on('request', r => { const u = r.url(); if (/facebook\.(net|com)/.test(u)) { fb.push(u); return r.abort(); } if (/clarity\.ms/.test(u)) return r.abort(); r.continue(); });
      if (cookie !== undefined) await p.setCookie({ name: 'em_ok', value: cookie, url: base }); await p.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
      await p.goto(base + '/' + (q || '') , { waitUntil: 'networkidle2' }); await wait(800); p._fb = fb; return p; };
    let p = await ctx(undefined); ok(!p._fb.length && await p.evaluate(() => typeof window.fbq === 'undefined' && !document.getElementById('emck')), lib + ' : visiteur sans choix : pixel non chargé, pas de bandeau', p._fb); await p._ctx.close();
    p = await ctx('0'); ok(!p._fb.length, lib + ' : refus : pixel non chargé', p._fb); await p._ctx.close();
    p = await ctx(undefined, '?fbclid=IwAR_controle'); ok(await p.evaluate(() => !!document.getElementById('emck')) && !p._fb.length, lib + ' : visiteur venu d\'une pub Meta (fbclid) : bandeau affiché, pixel pas encore chargé', p._fb);
    ok(await p.evaluate(() => /pixel Meta/.test(document.getElementById('emck').innerText) && !/Aucune publicité/i.test(document.getElementById('emck').innerText)), lib + ' : texte du bandeau à jour (pixel Meta, plus « Aucune publicité »)'); await p._ctx.close();
    p = await ctx('2'); ok(p._fb.some(u => /connect\.facebook\.net\/.*fbevents\.js/.test(u)) && await p.evaluate(() => typeof window.fbq === 'function' && Array.from(window.fbq.queue || [], a => Array.from(a)).some(a => a[0] === 'init' && a[1] === '3623623251140424')), lib + ' : accord : le pixel 3623623251140424 est demandé (et coupé par ce contrôle)', p._fb);
    ok(await p.evaluate(() => !(window.__csp && window.__csp.length)), lib + ' : aucune erreur de sécurité'); await p._ctx.close();
  }
  { const h = (await fetch('https://don.emounateha.fr/')).headers.get('content-security-policy') || ''; ok(/script-src[^;]*connect\.facebook\.net/.test(h) && /connect-src[^;]*www\.facebook\.com/.test(h), 'don : la CSP autorise le pixel Meta', h.slice(0, 160));
    const c = await (await fetch('https://www.emounateha.fr/confidentialite/?v=' + Date.now())).text(); ok(/pixel Meta/.test(c) && /_fbp, _fbc/.test(c) && !/aucune publicité/i.test(c), 'page confidentialité : pixel Meta décrit, plus de « aucune publicité »'); }
  console.log('\n— serveur de dons');
  const c = await (await fetch('https://don.emounateha.fr/api/config')).json().catch(() => null);
  ok(c && c.stripe === true && /^pk_/.test(c.publishableKey || ''), 'Stripe configuré (clé publique présente)', c && { stripe: c.stripe, live: c.live });
  const w = await fetch('https://don.emounateha.fr/webhook', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  ok(w.status === 400, 'webhook Stripe en ligne (refuse un appel sans signature)', w.status);
  const be = await (await fetch('https://clubhai.emounateha.fr/api/besoin/club-emounateha')).json().catch(() => null);
  ok(be && be.campagne && typeof be.participants === 'number', 'compteur du Club lisible', be && { p: be.participants });
  for (const u of ['https://www.emounateha.fr/', 'https://www.emounateha.fr/torah/', 'https://www.emounateha.fr/don-cerfa/']) { const r = await fetch(u, { redirect: 'follow' }); ok(r.status === 200, 'site : ' + u + ' répond', r.status); }
  await b.close(); console.log('\n' + pass + ' ok, ' + fail + ' échec');
  if (fail) console.log('\nSITE EN LIGNE CASSÉ : revenir à la version précédente tout de suite (voir DEPLOIEMENT.md, « Retour arrière »).');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ECHEC erreur du contrôle', e.message); process.exit(1); });
