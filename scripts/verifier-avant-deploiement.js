#!/usr/bin/env node
/* PORTE DE DÉPLOIEMENT — à lancer AVANT tout déploiement (voir DEPLOIEMENT.md).
   Lance toute la batterie de tests des paiements (serveurs jetables, Stripe TEST, aucun vrai paiement, aucun vrai mail).
   Si TOUT passe et que l'arbre git est propre, écrit le laissez-passer `.deploiement-verifie` (commit + date).
   Au moindre échec ou doute : pas de laissez-passer, code de sortie 1, on ne déploie pas. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const RACINE = path.join(__dirname, '..'), TESTS = path.join(RACINE, 'local-stripe-test', 'tests'), PASS = path.join(RACINE, '.deploiement-verifie');
const git = a => spawnSync('git', a, { cwd: RACINE, encoding: 'utf8' }).stdout.trim();
try { fs.unlinkSync(PASS); } catch (e) {}                       // l'ancien laissez-passer ne vaut plus rien
const problemes = [];
/* libère les ports des serveurs JETABLES des tests (3188 à 3199) : un test laisse parfois son serveur allumé et bloque le suivant.
   On ne tue que `node server.js` lancé avec MAIL_SIMULATE=1 et un dossier de données temporaire (jamais un vrai serveur). */
function libererPorts() {
  const l = spawnSync('lsof', ['-nP', '-iTCP:3188-3199', '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  for (const pid of new Set(l)) { const e = spawnSync('ps', ['eww', '-p', pid], { encoding: 'utf8' }).stdout; if (/MAIL_SIMULATE=1/.test(e) && /DATA_DIR=\/(var\/folders|tmp|private)/.test(e)) { try { process.kill(Number(pid)); } catch (x) {} } }
}
libererPorts();
const sale = git(['status', '--porcelain']);
if (sale) problemes.push('arbre git non propre (fichiers modifiés ou non suivis) : committer d\'abord, on déploie exactement ce qui est testé :\n' + sale.split('\n').slice(0, 12).map(l => '     ' + l).join('\n'));
if (!fs.existsSync(path.join(RACINE, 'local-stripe-test', '.env'))) problemes.push('local-stripe-test/.env absent : impossible de lancer les tests Stripe TEST');
const fichiers = fs.readdirSync(TESTS).filter(f => f.endsWith('.js')).sort();
console.log('Porte de déploiement : ' + fichiers.length + ' fichiers de tests\n');
let total = 0, echecs = 0;
for (const f of fichiers) {
  libererPorts();
  const t0 = Date.now(), r = spawnSync('node', [path.join(TESTS, f)], { cwd: path.join(RACINE, 'local-stripe-test'), encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const sortie = (r.stdout || '') + (r.stderr || ''), nbEchecs = (sortie.match(/^\s*ECHEC/gm) || []).length, nbOk = (sortie.match(/^\s*ok\s/gm) || []).length;
  const bon = r.status === 0 && nbEchecs === 0 && nbOk > 0;
  total += nbOk + nbEchecs; echecs += nbEchecs;
  console.log((bon ? ' PASSE ' : ' ÉCHEC ') + f.padEnd(28) + nbOk + ' ok, ' + nbEchecs + ' échec  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!bon) { problemes.push(f + ' : ' + (nbOk === 0 ? 'aucun contrôle exécuté (le test ne tourne pas : c\'est un échec)' : r.status !== 0 && !nbEchecs ? 'sortie anormale (code ' + r.status + ')' : nbEchecs + ' contrôle(s) en échec')); console.log(sortie.split('\n').filter(l => /ECHEC|Error|erreur/i.test(l)).slice(0, 10).map(l => '       ' + l.trim()).join('\n')); }
}
libererPorts();
console.log('\n' + total + ' contrôles, ' + echecs + ' en échec');
if (problemes.length) { console.log('\nDÉPLOIEMENT INTERDIT :'); problemes.forEach(p => console.log(' - ' + p)); process.exit(1); }
fs.writeFileSync(PASS, JSON.stringify({ commit: git(['rev-parse', 'HEAD']), date: new Date().toISOString(), controles: total }) + '\n');
console.log('\nTout passe. Laissez-passer écrit (.deploiement-verifie, commit ' + git(['rev-parse', '--short', 'HEAD']) + '). Il reste à déployer, puis à lancer scripts/verifier-apres-deploiement.js.');
