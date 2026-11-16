// RATTRAPAGE DES PAIEMENTS PAYÉS SANS REÇU — serveur de dons neuf (port 3193, données jetables, Stripe TEST, mails simulés).
// Cas visé : PayPal / Klarna. Le donateur paie chez PayPal ou Klarna puis ferme la fenêtre sans revenir sur le site, et le webhook Stripe n'arrive pas :
// le paiement est encaissé mais resterait « en attente » (ni reçu CERFA, ni e-mail, ni compteur). Le passage /api/rattrapage (toutes les 15 min en ligne) doit le reprendre.
// Le mécanisme ne dépend pas du moyen de paiement : on le prouve ici avec une carte de test (PayPal et Klarna ne se confirment pas sans leur page).
// Aucun vrai paiement, aucun vrai mail.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY)) { console.log('clé non test : arrêt'); process.exit(1); }
process.env.DATA_KEY = env.DATA_KEY;
const stripe = require(path.join(ROOT, 'node_modules', 'stripe'))(env.STRIPE_SECRET_KEY), vault = require(path.join(ROOT, 'vault.js'));
const B = 'http://127.0.0.1:3193', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const site = http.createServer((q, r) => { r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3187, '127.0.0.1');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratt-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3193', SITE_URL: 'http://127.0.0.1:3187', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: 'essai-' + Date.now(), RATTRAPAGE_MIN_S: '0' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const subs = [];
const fin = async () => { for (const s of subs) try { await stripe.subscriptions.cancel(s); } catch (e) {} try { process.kill(-srv.pid); } catch (e) { srv.kill(); } site.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };
async function call(m, u, b) { const r = await fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', origin: B }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { st: r.status, j: ct.includes('json') ? await r.json() : null }; }
const P = { type: 'particulier', prenom: 'Sarah', nom: 'Lévy', adresse: '8 avenue Félix Faure', cp: '69003', ville: 'Lyon', email: 'sarah.levy@exemple.com', tel: '0612345678', montant: '12', frequence: 'ponctuel', duree: 'infini', repartition: 'mois', envoyerEmail: true };
const lire = () => JSON.parse(vault.readFile(path.join(dir, 'data.json')).toString('utf8'));
// le donateur a payé chez le prestataire mais n'est JAMAIS revenu sur le site : on confirme chez Stripe et on n'appelle PAS /api/finalize
async function payeSansRetour(body) { const i = await call('POST', '/api/intent', body); if (i.st !== 200) return { i }; await stripe.paymentIntents.confirm(i.j.id, { payment_method: 'pm_card_visa', return_url: B + '/' }); return { i, id: i.j.id }; }

(async () => {
  for (let k = 0; k < 60; k++) { try { if ((await fetch(B + '/api/config')).ok) break; } catch (e) {} await wait(250); }

  T('Paiements payés mais jamais revenus sur le site');
  const a = await payeSansRetour(P);
  ok(a.i.st === 200 && a.id, 'don de 12 € payé chez le prestataire, donateur non revenu', a.i);
  const b = await call('POST', '/api/intent', { ...P, montant: '14', email: 'abandon@exemple.com' });   // commencé, jamais payé
  ok(b.st === 200, 'don de 14 € commencé, jamais payé (abandon)', b);
  const c = await payeSansRetour({ ...P, montant: '18', email: 'ruth.amar@exemple.com', prenom: 'Ruth', nom: 'Amar', besoin: 'club-emounateha', frequence: 'mensuel' });
  ok(c.i.st === 200 && c.id, 'don du Club (18 € par mois) payé, donateur non revenu', c.i);
  if (c.id) { const pi = await stripe.paymentIntents.retrieve(c.id, { expand: ['invoice.subscription'] }); const sub = pi.invoice && pi.invoice.subscription; if (sub) subs.push(typeof sub === 'string' ? sub : sub.id); }
  await wait(500);
  let d = lire();
  ok(d.pending[a.id] && !d.receipts[a.id] && d.pending[c.id] && !d.receipts[c.id], 'avant : les paiements payés sont « en attente », sans reçu', { pending: Object.keys(d.pending).length, recus: Object.keys(d.receipts).length });
  let r = await call('GET', '/api/besoin/club-emounateha'); ok(r.j && r.j.participants === 0, 'avant : le compteur du Club est à 0', r.j && r.j.participants);

  T('Passage de rattrapage');
  r = await call('GET', '/api/rattrapage');
  ok(r.st === 200 && r.j.crees === 2, 'deux reçus créés (le don de 12 € et celui du Club)', r.j);
  ok(r.j.nonPayes === 1, 'le don abandonné (14 €) est laissé tel quel, sans reçu', r.j);
  ok(Object.values(r.j).every(v => typeof v === 'number' || typeof v === 'boolean'), 'la réponse ne contient que des nombres (aucune donnée personnelle)', r.j);
  d = lire();
  const ra = d.receipts[a.id], rc = d.receipts[c.id];
  ok(ra && ra.montant === 1200 && /^TEST-|^A20|\//.test(String(ra.numero)) && !d.pending[a.id], 'reçu du 12 € : créé, numéroté, plus « en attente »', ra && { n: ra.numero, m: ra.montant });
  ok(rc && rc.montant === 1800 && rc.mensuel === true && rc.besoin === 'club-emounateha', 'reçu du Club : 18 € mensuel, rattaché au Club', rc && { m: rc.montant, men: rc.mensuel, b: rc.besoin });
  ok(!!d.pending[(Object.keys(d.pending).find(k => k !== a.id && k !== c.id)) || ''], 'le don abandonné reste en attente (au cas où il serait payé plus tard)');
  r = await call('GET', '/api/besoin/club-emounateha'); ok(r.j && r.j.participants === 1, 'le compteur du Club compte le don retrouvé', r.j && r.j.participants);

  T('Aucun doublon');
  const avant = Object.keys(lire().receipts).length;
  r = await call('GET', '/api/rattrapage'); ok(r.st === 200 && r.j.crees === 0, 'deuxième passage : aucun nouveau reçu', r.j);
  r = await call('POST', '/api/finalize', { id: a.id }); ok(r.st === 200, 'le donateur revient enfin sur le site : même reçu, pas de doublon', r);
  ok(Object.keys(lire().receipts).length === avant, 'nombre de reçus inchangé (' + avant + ')', Object.keys(lire().receipts).length);
  fin();
})().catch(e => { console.log('  ECHEC erreur du test', e.message); fail++; fin(); });
