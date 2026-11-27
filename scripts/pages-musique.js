// Pages de partage de chaque titre : www.emounateha.fr/musique/<titre>/
// Copie de public/musique/index.html, avec l'aperçu (WhatsApp, Facebook…) du titre : son nom et SA pochette.
// La page ouvre ce titre (le script de la page lit l'adresse). Les titres viennent de la liste PISTES de la page.
// Usage : node scripts/pages-musique.js            → écrit les pages
//         node scripts/pages-musique.js --verifier → vérifie qu'elles sont à jour (sortie 1 sinon)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'public', 'musique'), SITE = 'https://www.emounateha.fr';

function pistes(html) {
  const bloc = (html.match(/const PISTES=\[([\s\S]*?)\];/) || [])[1] || '';
  return [...bloc.matchAll(/\{id:'([a-z0-9-]+)',t:'([^']+)',court:'([^']+)',src:'[^']+',img:'([^']+)'\}/g)].map(m => ({ id: m[1], t: m[2], court: m[3], img: m[4] }));
}
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function pageDe(html, p) {
  const url = SITE + '/musique/' + p.id + '/', titre = p.court + ' · Émounatéha', desc = 'Écoute « ' + p.t + ' », un titre d\'Émounatéha.';
  const image = SITE + '/apercus/musique-' + p.id + '.jpg?v=1';
  const meta = (re, v) => { const avant = html; html = html.replace(re, (m, a) => a + attr(v) + '"'); if (html === avant) throw new Error('balise introuvable : ' + re); };
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + attr(titre) + '</title>');
  meta(/(<meta name="description" content=")[^"]*"/, desc);
  meta(/(<link rel="canonical" href=")[^"]*"/, url);
  meta(/(<meta property="og:url" content=")[^"]*"/, url);
  meta(/(<meta property="og:title" content=")[^"]*"/, titre);
  meta(/(<meta property="og:description" content=")[^"]*"/, desc);
  meta(/(<meta property="og:image" content=")[^"]*"/, image);
  meta(/(<meta property="og:image:alt" content=")[^"]*"/, 'Pochette de ' + p.t + ', Émounatéha');
  meta(/(<meta name="twitter:title" content=")[^"]*"/, titre);
  meta(/(<meta name="twitter:description" content=")[^"]*"/, desc);
  meta(/(<meta name="twitter:image" content=")[^"]*"/, image);
  return '<!-- Page générée par scripts/pages-musique.js à partir de public/musique/index.html : ne pas modifier à la main. -->\n' + html;
}

function attendues() {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), L = pistes(html);
  if (!L.length) throw new Error('aucun titre trouvé dans la liste PISTES de public/musique/index.html');
  return L.map(p => ({ p, fichier: path.join(DIR, p.id, 'index.html'), contenu: pageDe(html, p), apercu: path.join(DIR, '..', 'apercus', 'musique-' + p.id + '.jpg') }));
}

if (require.main === module) {
  const verifier = process.argv.includes('--verifier'), pbs = [];
  for (const x of attendues()) {
    if (!fs.existsSync(x.apercu)) pbs.push('aperçu manquant : public/apercus/musique-' + x.p.id + '.jpg (pochette 1200 × 1200)');
    const actuel = fs.existsSync(x.fichier) ? fs.readFileSync(x.fichier, 'utf8') : null;
    if (actuel === x.contenu) continue;
    if (verifier) pbs.push('page pas à jour : public/musique/' + x.p.id + '/index.html (lancer node scripts/pages-musique.js)');
    else { fs.mkdirSync(path.dirname(x.fichier), { recursive: true }); fs.writeFileSync(x.fichier, x.contenu); console.log('écrit : public/musique/' + x.p.id + '/index.html'); }
  }
  if (pbs.length) { console.log(pbs.join('\n')); process.exit(1); }
  if (verifier) console.log('pages des titres à jour');
}
module.exports = { pistes, pageDe, attendues };
