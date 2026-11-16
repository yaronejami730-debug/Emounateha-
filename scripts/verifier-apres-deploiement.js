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
      ok(!p._err.length, lib + ' : aucune erreur JavaScript', p._err); await p.close();
    }
    const p = await ouvre('https://don.emounateha.fr/', w, h); const e = await etat(p);
    ok(e.goVisible && /Continuer/.test(e.go), 'page de don : bouton « Continuer » visible', e); ok(!p._err.length, 'page de don : aucune erreur JavaScript', p._err); await p.close();
  }
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
