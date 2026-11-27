// BOUTONS DU SITE QUI MÈNENT AUX DONS — pages de l'accueil et des colis (fichiers du site, aucun serveur, aucun paiement).
// 17 nov 2026 : l'accueil n'a plus de boutons de cagnottes (loyer, urgence…) mais un bouton « Club ’Haï » à gauche ; la page des colis a, au-dessus des carrés,
// un bouton « Là où il y en a le plus besoin » qui mène au don « là où le besoin est le plus grand ».
const fs = require('fs'), path = require('path'), puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer-core'));
const SITE = path.join(__dirname, '..', '..', 'public');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 400)); }; const T = t => console.log('\n— ' + t);
(async () => {
  const home = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), colis = fs.readFileSync(path.join(SITE, 'colis', 'index.html'), 'utf8');
  T('Musique : une page de partage par titre, avec sa pochette');
  { const PM = require(path.join(__dirname, '..', '..', 'scripts', 'pages-musique.js')), L = PM.attendues();
    ok(L.length >= 2 && L.every(x => fs.existsSync(x.fichier) && fs.readFileSync(x.fichier, 'utf8') === x.contenu), 'chaque titre a sa page /musique/<titre>/ à jour (sinon : node scripts/pages-musique.js)', L.map(x => x.p.id));
    ok(L.every(x => fs.existsSync(x.apercu) && x.contenu.includes('og:image" content="https://www.emounateha.fr/apercus/musique-' + x.p.id + '.jpg')), 'aperçu WhatsApp de chaque titre = sa pochette', L.map(x => x.p.id)); }
  T('Accueil');
  ok(/<a class="pillgold" href="https:\/\/clubhai\.emounateha\.fr\/"[^>]*>[^]*?Club ’Haï<\/span><\/a>/.test(home), 'bouton « Club ’Haï » vers clubhai.emounateha.fr');
  ok(!/api\/besoins-accueil/.test(home) && !/class="urgc"/.test(home.replace(/<style[^]*?<\/style>/g, '')), 'plus aucun bouton de cagnotte (loyer, urgence, retard) sur l\'accueil');
  ok(/\.pillgold\{[^}]*background:linear-gradient\(180deg,#f3e08f[^}]*#d0a848[^}]*animation:none/.test(home), 'or brillant du logo hébreu (dégradé), sans clignotement');
  ok(/@media\(min-width:801px\)\{\.urgl\.urgclub\{justify-content:center/.test(home), 'ordinateur : bouton Club ’Haï centré (à gauche sur téléphone)');
  T('Page des colis');
  ok(/<div class="plusbesoin"><a class="pillgold" href="https:\/\/don\.emounateha\.fr\/\?aff=besoin">Là où il y en a le plus besoin<\/a><\/div>\s*<div class="ctabs"/.test(colis), 'bouton « Là où il y en a le plus besoin » juste au-dessus des carrés, vers le don « là où le besoin est le plus grand »');
  ok((colis.match(/class="ctab[ "]/g) || []).length === 6, 'les 6 carrés de colis sont toujours là');
  T('En navigateur (téléphone et ordinateur)');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  for (const [nom, w, h] of [['téléphone', 390, 800], ['ordinateur', 1280, 800]]) {
    const p = await b.newPage(); const err = []; p.on('pageerror', e => err.push(e.message)); await p.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
    for (const [lib, f, sel] of [['accueil', path.join(SITE, 'index.html'), '#urgent .pillgold'], ['colis', path.join(SITE, 'colis', 'index.html'), '.plusbesoin .pillgold']]) {
      await p.setContent(fs.readFileSync(f, 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''), { waitUntil: 'domcontentloaded' });
      const r = await p.$eval(sel, a => { const q = a.getBoundingClientRect(), c = getComputedStyle(a); return { w: q.width | 0, h: q.height | 0, anim: c.animationName, bg: c.backgroundImage, vis: q.height > 0 && c.visibility !== 'hidden' }; }).catch(() => null);
      if (w >= 801 && lib === 'accueil') { const c = await p.evaluate(() => { const a = document.querySelector('#urgent .pillgold').getBoundingClientRect(); return Math.abs((a.left + a.right) / 2 - innerWidth / 2); }); ok(c < 3, 'ordinateur : le bouton Club ’Haï est bien au milieu de la page (écart ' + Math.round(c) + ' px)', c); }
      ok(r && r.vis && r.h >= 40 && r.anim === 'none' && /linear-gradient/.test(r.bg) && /243, 224, 143/.test(r.bg), nom + ' : bouton ' + lib + ' visible, assez grand pour le doigt, or brillant, sans animation', r);
    }
    ok(!err.length, nom + ' : aucune erreur JavaScript', err); await p.close();
  }
  await b.close(); console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  ECHEC erreur du test', e.message); process.exit(1); });
