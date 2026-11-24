// E-MAIL D'EXCUSES quand l'association refait un reçu manuel (« Refaire le CERFA » dans le CRM).
// Le module d'e-mail est copié dans un dossier jetable avec des réglages factices : aucune lecture de la base, aucun envoi.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = '/Users/yarone/Emounateha/local-stripe-test';
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 400)); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-excuses-'));
fs.writeFileSync(path.join(dir, 'mailer.js'), fs.readFileSync(path.join(ROOT, 'mailer.js'), 'utf8').replace('async function settings() {', "async function settings() { return { orgName: 'Émounatéha', publicUrl: 'https://www.emounateha.fr' };"));
module.paths.unshift(path.join(ROOT, 'node_modules'), path.join(ROOT, '..', 'node_modules'));
process.env.NODE_PATH = [path.join(ROOT, 'node_modules'), path.join(ROOT, '..', 'node_modules')].join(path.delimiter); require('module').Module._initPaths();
const m = require(path.join(dir, 'mailer.js'));
const plat = h => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const base = { prenom: 'Jacob', montant: 260000, dateDon: '2026-11-23T11:00:00.000Z', mode: 'Virement bancaire', numero: 'A2026/0042' };
  console.log('\n— Reçu refait par l\'association');
  const a = await m.donEmail({ ...base, remplace: 'A2026/0040', excuses: true }), h = plat(a.html);
  ok(/Annulation de votre reçu fiscal n° A2026\/0040/.test(a.subject) && a.subject.includes('nouveau reçu n° A2026/0042'), 'objet : annulation de l\'ancien numéro et nouveau numéro', a.subject);
  ok(h.includes('Toutes nos excuses') && h.includes('Nous vous prions de bien vouloir nous excuser'), 'e-mail d\'excuses');
  ok(h.includes('A2026/0040') && h.includes('Ce reçu est annulé') && h.includes('caduques'), 'l\'ancien reçu est déclaré annulé et ses informations caduques');
  ok(h.includes('A2026/0042') && h.includes('23 novembre 2026') && h.includes('Virement bancaire'), 'informations du nouveau reçu : numéro, date du don, mode');
  ok(/excuser/.test(a.text) && a.text.includes('A2026/0040') && a.text.includes('23 novembre 2026'), 'version texte : excuses, ancien numéro, date du don', a.text);
  console.log('\n— Les autres e-mails ne changent pas');
  const b = await m.donEmail(base);
  ok(/^Merci pour votre don/.test(b.subject) && !plat(b.html).includes('Ce reçu est annulé'), 'don normal : e-mail de remerciement, sans excuses', b.subject);
  const c = await m.donEmail({ ...base, remplace: 'A2026/0040' });
  ok(/^Votre reçu fiscal corrigé/.test(c.subject) && !plat(c.html).includes('Nous vous prions'), 'correction faite par le donateur : e-mail « reçu corrigé » habituel', c.subject);
})().catch(e => { fail++; console.log('ERREUR', e.stack); }).finally(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); });
