// BOUTONS DES PAGES DE DON — serveur de dons neuf (port 3194, données jetables, Stripe TEST, mails simulés), vrai navigateur (Chrome).
// Vérifie ce qu'un donateur fait vraiment : cliquer sur « Rejoindre » / « Participer » / « Continuer » doit ouvrir le formulaire de don.
// Panne du 17 nov 2026 : le bouton du Club ne faisait rien (le passage page d'accueil -> formulaire avait été supprimé par erreur).
// Aucun vrai paiement, aucun vrai mail.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer-core'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = '3194', B = 'http://127.0.0.1:' + PORT, wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boutons-'));
// Faux site (port 3188) qui sert le calendrier des fêtes : Hanouka toujours dans 11 jours, comme en ligne quand la fête approche
// (règle de Yarone : Hanouka s'affiche sur les dons quand elle arrive). Avant, rien ne servait ce port et le relevé changeait selon ce qui y traînait (23 nov 2026).
const jourDans = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const site = require('http').createServer((q, r) => { if (q.url.startsWith('/holidays.json')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify([{ date: jourDans(11), title: 'Hanoukah', hebrew: 'חנוכה' }])); } r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3188, '127.0.0.1');
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT, SITE_URL: 'http://127.0.0.1:3188', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: 'essai-' + Date.now() }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let browser;
const MAJ = process.argv.includes('--maj'), REF = path.join(__dirname, 'boutons-reference.json');   // --maj : réécrit le relevé de référence (à ne faire qu'après accord de Yarone, voir DEPLOIEMENT.md)
const fin = async () => { try { site.close(); } catch (e) {} try { await browser.close(); } catch (e) {} try { process.kill(-srv.pid); } catch (e) { srv.kill(); } try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };

// état de la page : le formulaire de don est-il ouvert, que dit son bouton, quel montant porte-t-il ?
const etat = p => p.evaluate(() => { const g = document.getElementById('go'), r = g && g.getBoundingClientRect(); return { accueil: document.body.classList.contains('camp-accueil'), goVisible: !!(r && r.height > 0 && getComputedStyle(g).visibility !== 'hidden'), go: g ? g.textContent.trim() : '', montant: (document.getElementById('montant') || {}).value }; });
// relevé de TOUS les boutons, liens d'action et champs de la page : un bouton ajouté, retiré, renommé ou déplacé change le relevé
const releve = p => p.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a.cp-retour, a.dn-btn, a[data-go]')].filter(x => !x.closest('script') && x.type !== 'hidden').map(x => x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (x.name ? '[' + x.name + (x.type === 'radio' || x.type === 'checkbox' ? '=' + x.value : '') + ']' : '') + (x.hasAttribute('data-go') ? '{data-go}' : '') + '|' + (x.tagName === 'INPUT' ? x.type : (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60))).sort());
const RELEVES = {};
async function page(url, w, h) { const p = await browser.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 }); await p.goto(url, { waitUntil: 'networkidle2' }); p._err = err; return p; }

(async () => {
  for (let k = 0; k < 60; k++) { try { if ((await fetch(B + '/api/config')).ok) break; } catch (e) {} await wait(250); }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  for (const [nom, w, h] of [['téléphone', 390, 780], ['ordinateur', 1280, 800]]) {
    T('Club ’Haï, ' + nom);
    let p = await page(B + '/campagne/club', w, h);
    let e = await etat(p);
    if (w < 600) RELEVES['club : accueil'] = await releve(p);
    ok(await p.evaluate(() => !document.getElementById('cpWall') && !/Ils ont rejoint/i.test(document.body.innerText)), 'Club : aucune liste « Ils ont rejoint le Club ’Haï » (supprimée à la demande de Yarone)');
    ok(e.accueil && !e.goVisible, 'à l’ouverture : page d’accueil du Club, formulaire fermé', e);
    const bt = await p.$$eval('.cp-go', l => l.map(x => x.textContent.trim()));
    ok(bt.length >= 1 && bt.every(t => /^Rejoindre pour 18 € par mois$/.test(t)), 'bouton « Rejoindre pour 18 € par mois »', bt);
    await p.evaluate(() => document.querySelector('.cp-pan .cp-go').click()); await wait(1200);
    e = await etat(p);
    if (w < 600) RELEVES['club : formulaire de don'] = await releve(p);
    ok(!e.accueil && e.goVisible && e.montant === '18', 'clic sur « Rejoindre » : le formulaire s’ouvre avec 18 €', e);
    ok(await p.evaluate(() => !!document.getElementById('bsNom')), 'case « Afficher mon nom parmi les membres » présente');
    ok(await p.evaluate(() => [...document.querySelectorAll('input[name=prenom],input#prenom,input[name=nom]')].length > 0), 'champs du donateur (prénom, nom) présents');
    ok(!p._err.length, 'aucune erreur JavaScript', p._err);
    await p.close();

    p = await page(B + '/campagne/club', w, h);
    await p.evaluate(() => { const r = document.querySelectorAll('input[name=cpPart]')[1]; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(300);
    ok(await p.evaluate(() => /Rejoindre pour 26 € par mois/.test(document.querySelector('.cp-pan .cp-go').textContent)), 'choix de 26 € : le bouton affiche 26 €');
    await p.type('#cpLibreIn', '50'); await wait(300);
    ok(await p.evaluate(() => /Rejoindre pour 50 € par mois/.test(document.querySelector('.cp-pan .cp-go').textContent)), 'montant libre 50 € : le bouton affiche 50 €');
    await p.evaluate(() => document.querySelector('.cp-pan .cp-go').click()); await wait(1200);
    e = await etat(p);
    ok(!e.accueil && e.goVisible && e.montant === '50', 'montant libre : le formulaire s’ouvre avec 50 €', e);
    await p.close();

    p = await page(B + '/campagne/club', w, h);
    await p.type('#cpLibreIn', '0'); await wait(200);
    await p.evaluate(() => document.querySelector('.cp-pan .cp-go').click()); await wait(800);
    e = await etat(p);
    ok(e.accueil && !e.goVisible, 'montant libre invalide (0 €) : le formulaire reste fermé, pas de paiement', e);
    await p.close();

    T('Hanouka, ' + nom);
    p = await page(B + '/campagne/hanouka', w, h);
    await p.evaluate(() => document.querySelector('.cp-pan .cp-go').click()); await wait(1200);
    e = await etat(p);
    if (w < 600) RELEVES['hanouka : formulaire de don'] = await releve(p);
    ok(!e.accueil && e.goVisible && e.montant === '18', 'clic sur « Participer » : le formulaire s’ouvre avec 18 €', e);
    ok(!p._err.length, 'aucune erreur JavaScript', p._err);
    await p.close();

    T('Page de don ordinaire, ' + nom);
    p = await page(B + '/', w, h);
    e = await etat(p);
    if (w < 600) RELEVES['don général : étape 1'] = await releve(p);
    ok(!e.accueil && e.goVisible && /Continuer/.test(e.go), 'bouton « Continuer » visible', e);
    ok(await p.evaluate(() => document.querySelectorAll('#amts button, #amts label, .dn-chip, [data-amt]').length > 0), 'montants proposés');
    ok(!p._err.length, 'aucune erreur JavaScript', p._err);
    await p.close();
  }
  T('Lien « Là où il y en a le plus besoin » (page des colis)');
  { const p = await page(B + '/?aff=besoin', 390, 780); let r = null; for (let k = 0; k < 20 && !(r && /besoin est le plus grand/i.test(r)); k++) { r = await p.evaluate(() => { const c = document.querySelector('input[name=affr]:checked'); return c ? c.value : null; }); if (!(r && /besoin est le plus grand/i.test(r))) await wait(500); }   // la page coche le choix un instant après son chargement
    ok(r && /besoin est le plus grand/i.test(r), 'le don s\'ouvre avec « là où le besoin est le plus grand » déjà choisi', r); ok(!p._err.length, 'aucune erreur JavaScript', p._err); await p.close(); }

  T('Relevé de référence des boutons et champs (un changement ferme la porte)');
  if (MAJ) { fs.writeFileSync(REF, JSON.stringify(RELEVES, null, 1) + '\n'); console.log('  relevé de référence réécrit : ' + Object.keys(RELEVES).length + ' pages'); }
  else {
    let ref = null; try { ref = JSON.parse(fs.readFileSync(REF, 'utf8')); } catch (e) {}
    ok(!!ref, 'fichier tests/boutons-reference.json présent');
    for (const k of Object.keys(RELEVES)) {
      const a = ref && ref[k], b = RELEVES[k], retires = a ? a.filter(x => !b.includes(x)) : ['(page absente du relevé)'], ajoutes = a ? b.filter(x => !a.includes(x)) : [];
      ok(a && !retires.length && !ajoutes.length, k + ' : mêmes boutons et champs que la référence (' + b.length + ')', { RETIRES: retires, AJOUTES: ajoutes });
    }
    ok(ref && Object.keys(ref).every(k => RELEVES[k]), 'aucune page de la référence n’a disparu');
  }
  fin();
})().catch(e => { console.log('  ECHEC erreur du test', e.message); fail++; fin(); });
