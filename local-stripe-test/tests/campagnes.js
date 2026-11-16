// CAMPAGNES DE PARTICIPATION — serveur de dons neuf (port 3195, données jetables, Stripe TEST, mails simulés).
// Campagne à montant unique (Hanouka, 18 € ponctuel) et campagne mensuelle à deux montants (Club, 18 € ou 26 € par mois) :
// le montant et la fréquence sont imposés par le serveur, le compteur compte les personnes (jamais les euros, jamais deux fois le même abonné).
// Aucun vrai paiement, aucun vrai mail.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY)) { console.log('clé non test : arrêt'); process.exit(1); }
process.env.DATA_KEY = env.DATA_KEY;
const stripe = require(path.join(ROOT, 'node_modules', 'stripe'))(env.STRIPE_SECRET_KEY), vault = require(path.join(ROOT, 'vault.js'));
const B = 'http://127.0.0.1:3195', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const site = http.createServer((q, r) => { r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3188, '127.0.0.1');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3195', SITE_URL: 'http://127.0.0.1:3188', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: 'essai-' + Date.now() }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const fin = async () => { try { process.kill(-srv.pid); } catch (e) { srv.kill(); } site.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };
async function call(m, u, b) { const r = await fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', origin: B }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { st: r.status, j: ct.includes('json') ? await r.json() : null, t: ct.includes('html') ? await r.text() : '' }; }
const P = { type: 'particulier', prenom: 'Sarah', nom: 'Lévy', adresse: '8 avenue Félix Faure', cp: '69003', ville: 'Lyon', email: 'sarah.levy@exemple.com', tel: '0612345678', montant: '18', frequence: 'ponctuel', duree: 'infini', repartition: 'mois', envoyerEmail: true };
async function don(body) { const i = await call('POST', '/api/intent', body); if (i.st !== 200) return { i, f: null }; await stripe.paymentIntents.confirm(i.j.id, { payment_method: 'pm_card_visa', return_url: B + '/' }); return { i, id: i.j.id, f: await call('POST', '/api/finalize', { id: i.j.id }) }; }
const lire = () => JSON.parse(vault.readFile(path.join(dir, 'data.json')).toString('utf8'));
const CLUB = 'club-emounateha', HAN = 'campagne-hanouka', subs = [];
(async () => {
  for (let k = 0; k < 60; k++) { try { if ((await fetch(B + '/api/config')).ok) break; } catch (e) {} await wait(250); }

  T('Pages');
  let r = await call('GET', '/campagne/club'); ok(r.st === 200 && /data-besoin="[^"]*club-emounateha/.test(r.t) && /&quot;parts&quot;:\[1800,2600\]/.test(r.t) && /&quot;mensuel&quot;:true/.test(r.t), 'page /campagne/club : fiche avec les deux montants et le mensuel', r.st);
  r = await call('GET', '/campagne/hanouka'); ok(r.st === 200 && /&quot;parts&quot;:\[1800\]/.test(r.t) && /&quot;mensuel&quot;:false/.test(r.t), 'page /campagne/hanouka : un seul montant, ponctuel', r.st);
  r = await call('GET', '/campagne/inconnue'); ok(r.st !== 200 || !/data-besoin=/.test(r.t), 'adresse inconnue : pas de page de campagne', r.st);
  r = await call('GET', '/api/besoin/' + CLUB); ok(r.st === 200 && r.j.participants === 0 && r.j.collecte === undefined && r.j.campagne.mot === 'membre', 'compteur du club à 0, aucun montant publié', r.j);

  T('Club : 26 € par mois');
  let a = await don({ ...P, besoin: CLUB, montant: '26', frequence: 'ponctuel', afficherNom: true });   // la page triche sur la fréquence : le serveur impose le mensuel
  ok(a.i.st === 200 && a.i.j.montant === 2600 && a.i.j.mensuel === true, 'paiement créé : 26 €, mensuel (imposé par le serveur)', a.i);
  ok(a.f && a.f.st === 200, 'paiement test abouti, reçu créé', a.f);
  let rec = lire().receipts[a.id]; ok(rec && rec.montant === 2600 && rec.mensuel === true && rec.besoin === CLUB && /Club/.test(rec.affectation), 'reçu : 26 €, mensuel, rattaché au club', rec && { m: rec.montant, men: rec.mensuel, b: rec.besoin, a: rec.affectation });
  ok(rec && rec.impr && /mensuel/i.test(rec.impr.mode) && rec.impr.mensuel === true, 'fiche du reçu : don mensuel, 1re échéance', rec && rec.impr);
  { const pi = await stripe.paymentIntents.retrieve(a.id, { expand: ['invoice.subscription'] }); const sub = pi.invoice && pi.invoice.subscription;
    const s = sub && (typeof sub === 'string' ? await stripe.subscriptions.retrieve(sub) : sub); if (s) subs.push(s.id);
    ok(s && s.status === 'active' && s.items.data[0].price.unit_amount === 2600 && s.items.data[0].price.recurring.interval === 'month' && !s.cancel_at && s.metadata.besoin === CLUB, 'abonnement Stripe (test) : actif, 26 € chaque mois, sans date de fin', s && { st: s.status, m: s.items.data[0].price.unit_amount, fin: s.cancel_at }); }

  T('Club : 18 € par mois, et montants refusés');
  let b = await don({ ...P, email: 'david.cohen@exemple.com', prenom: 'David', nom: 'Cohen', besoin: CLUB, montant: '18' });
  ok(b.i.st === 200 && b.i.j.montant === 1800 && b.i.j.mensuel === true && b.f.st === 200, '18 € par mois : accepté', b.i);
  let e = await don({ ...P, email: 'ruth.amar@exemple.com', prenom: 'Ruth', nom: 'Amar', besoin: CLUB, montant: '50' });
  ok(e.i.st === 200 && e.i.j.montant === 5000 && e.i.j.mensuel === true && e.f.st === 200, '« Autre montant » : 50 € par mois accepté', e.i);
  let c = await call('POST', '/api/intent', { ...P, besoin: CLUB, montant: '36', duree: '12', repartition: 'total' }); ok(c.st === 200 && c.j.montant === 3600 && c.j.mensuel === true, '36 € « en 12 fois » : reste 36 € par mois sans limite (pas de répartition)', c.j);
  c = await call('POST', '/api/intent', { ...P, besoin: CLUB, montant: '0,50' }); ok(c.st === 200 && c.j.montant === 1800, 'moins de 1 € : ramené à 18 €', c.j);
  c = await call('POST', '/api/intent', { ...P, besoin: CLUB, montant: '9999999' }); ok(c.st === 400, 'montant démesuré : refusé', c.j);

  T('Compteur');
  r = await call('GET', '/api/besoin/' + CLUB);
  ok(r.j.participants === 3, 'trois membres comptés (les paiements non terminés ne comptent pas)', r.j.participants);
  ok(JSON.stringify(r.j.noms) === JSON.stringify(['Sarah LÉVY']), 'seul le nom de la personne qui l\'a demandé est affiché', r.j.noms);
  ok(!/2600|1800|5000|"montant"|collecte/.test(JSON.stringify(r.j).replace(/"parts?":[^,]*(,\d+\])?/g, '')), 'aucune somme dans la réponse publique (hors montants proposés)', r.j);
  // 2e mois : le prélèvement suivant crée un reçu, mais ne compte pas un membre de plus (reçu de webhook, sans rattachement au compteur)
  { const d = lire(); d.receipts['in_essai_mois2'] = { ...d.receipts[a.id], numero: 'ESSAI-M2', impr: { ...d.receipts[a.id].impr, echeance: 2 }, besoin: undefined, besoinNom: undefined }; vault.writeFile(path.join(dir, 'data.json'), Buffer.from(JSON.stringify(d)));
    await wait(300); r = await call('GET', '/api/besoin/' + CLUB); ok(r.j.participants === 3, '2e prélèvement du même abonné : toujours trois membres', r.j.participants); }

  T('Hanouka : inchangée');
  let h = await don({ ...P, besoin: HAN, montant: '500', frequence: 'mensuel' });
  ok(h.i.st === 200 && h.i.j.montant === 1800 && h.i.j.mensuel === false && h.f.st === 200, '18 € ponctuel imposé, quoi qu\'envoie la page', h.i);
  r = await call('GET', '/api/besoin/' + HAN); ok(r.j.participants === 1 && r.j.campagne.lumieres === true, 'un participant, objectif en huit lumières', r.j);
  r = await call('GET', '/api/besoin/' + CLUB); ok(r.j.participants === 3, 'le club ne bouge pas', r.j.participants);

  for (const s of subs) try { await stripe.subscriptions.cancel(s); } catch (e) {}   // ménage : abonnements de test arrêtés
  { const l = await stripe.subscriptions.search({ query: 'metadata["besoin"]:"' + CLUB + '" AND status:"active"', limit: 20 }).catch(() => ({ data: [] })); for (const s of l.data) if (Date.now() / 1000 - s.created < 900) try { await stripe.subscriptions.cancel(s.id); } catch (e) {} }
  if (fail) console.log(log.slice(-1500));
  await fin();
})().catch(async e => { console.error('ERREUR', e, log.slice(-1500)); await fin(); });
