// MOYENS DE PAIEMENT — serveur de dons neuf (port 3196, données jetables, Stripe TEST, mails simulés).
// Carte, PayPal, Klarna et prélèvement SEPA, en don ponctuel et en don mensuel (Club). Le prélèvement SEPA met quelques jours :
// pas de reçu tant que la banque n'a pas versé, puis reçu créé par le webhook et envoyé par email.
// Aucun vrai paiement, aucun vrai mail.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY)) { console.log('clé non test : arrêt'); process.exit(1); }
process.env.DATA_KEY = env.DATA_KEY;
const stripe = require(path.join(ROOT, 'node_modules', 'stripe'))(env.STRIPE_SECRET_KEY), vault = require(path.join(ROOT, 'vault.js'));
const B = 'http://127.0.0.1:3196', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const site = http.createServer((q, r) => { r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3189, '127.0.0.1');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moy-'));
const srv = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3196', SITE_URL: 'http://127.0.0.1:3189', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: 'essai-' + Date.now(), STRIPE_WEBHOOK_SECRET: 'whsec_essai_local' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const fin = async () => { try { process.kill(-srv.pid); } catch (e) { srv.kill(); } site.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };
async function call(m, u, b) { const r = await fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', origin: B }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { st: r.status, j: ct.includes('json') ? await r.json() : null, t: ct.includes('html') ? await r.text() : '' }; }
const P = { type: 'particulier', prenom: 'Sarah', nom: 'Lévy', adresse: '8 avenue Félix Faure', cp: '69003', ville: 'Lyon', email: 'sarah.levy@exemple.com', tel: '0612345678', montant: '18', frequence: 'ponctuel', duree: 'infini', repartition: 'mois', envoyerEmail: true };
const lire = () => JSON.parse(vault.readFile(path.join(dir, 'data.json')).toString('utf8'));
const CLUB = 'club-emounateha', subs = [];
const IBAN_OK = 'AT611904300234573201', IBAN_KO = 'AT861904300235473202';
const sepa = (id, iban, p) => stripe.paymentIntents.confirm(id, { payment_method_data: { type: 'sepa_debit', sepa_debit: { iban }, billing_details: { name: p.prenom + ' ' + p.nom, email: p.email } }, mandate_data: { customer_acceptance: { type: 'online', online: { ip_address: '127.0.0.1', user_agent: 'essai' } } }, return_url: B + '/' });
const attendre = async (id, vus) => { for (let k = 0; k < 90; k++) { const pi = await stripe.paymentIntents.retrieve(id); if (vus.includes(pi.status)) return pi.status; await wait(2000); } return 'trop long'; };
const hook = (type, id) => { const payload = JSON.stringify({ id: 'evt_essai_' + Date.now(), object: 'event', type, data: { object: { id, object: 'payment_intent' } } }); return fetch(B + '/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_essai_local' }) }, body: payload }); };
(async () => {
  for (let k = 0; k < 60; k++) { try { if ((await fetch(B + '/api/config')).ok) break; } catch (e) {} await wait(250); }

  T('Don ponctuel : moyens proposés');
  let i = await call('POST', '/api/intent', { ...P, montant: '52' }); let pi = await stripe.paymentIntents.retrieve(i.j.id);
  ok(i.st === 200 && ['card', 'paypal', 'klarna', 'sepa_debit'].every(t => pi.payment_method_types.includes(t)), 'carte (Apple Pay / Google Pay), PayPal, Klarna et prélèvement SEPA proposés', pi.payment_method_types);

  T('Don ponctuel par prélèvement SEPA');
  pi = await sepa(i.j.id, IBAN_OK, P); ok(pi.status === 'processing', 'mandat accepté : prélèvement en cours à la banque', pi.status);
  let f = await call('POST', '/api/finalize', { id: i.j.id });
  ok(f.st === 200 && f.j.attente === true && f.j.montant === 5200 && /SEPA/.test(f.j.moyen) && !f.j.numero, 'la page annonce le prélèvement, sans reçu fiscal pour l\'instant', f.j);
  ok(!lire().receipts[i.j.id] && lire().pending[i.j.id].attente > 0, 'aucun reçu créé tant que la banque n\'a pas versé', Object.keys(lire().receipts));
  ok(await attendre(i.j.id, ['succeeded']) === 'succeeded', 'la banque verse le don (Stripe test)');
  let w = await hook('payment_intent.succeeded', i.j.id); let rec = lire().receipts[i.j.id];
  ok(w.status === 200 && rec && rec.montant === 5200 && /SEPA/.test(rec.mode) && rec.impr && /SEPA/.test(JSON.stringify(rec.impr)), 'à la réception : reçu créé par le webhook, mention « Prélèvement SEPA »', rec && { m: rec.montant, mode: rec.mode });
  ok(rec && rec.email && !rec.email.skipped && rec.email.to === P.email, 'le reçu part par email (simulé), même si la case n\'était pas cochée', rec && rec.email);
  f = await call('POST', '/api/finalize', { id: i.j.id }); ok(f.st === 200 && f.j.numero === rec.numero, 'la page redemandée ensuite donne le même reçu (pas de doublon)', f.j && f.j.numero);

  T('Prélèvement refusé par la banque');
  let k = await call('POST', '/api/intent', { ...P, email: 'david.cohen@exemple.com', prenom: 'David', nom: 'Cohen', montant: '30' });
  await sepa(k.j.id, IBAN_KO, { ...P, prenom: 'David', nom: 'Cohen', email: 'david.cohen@exemple.com' }); f = await call('POST', '/api/finalize', { id: k.j.id });
  ok(f.j && f.j.attente === true, 'd\'abord annoncé comme en cours', f.j);
  ok(await attendre(k.j.id, ['requires_payment_method', 'canceled']) !== 'trop long', 'la banque refuse (Stripe test)');
  w = await hook('payment_intent.payment_failed', k.j.id);
  ok(w.status === 200 && !lire().receipts[k.j.id] && !lire().pending[k.j.id], 'refus : aucun reçu, le don en attente est retiré', Object.keys(lire().pending));
  f = await call('POST', '/api/finalize', { id: k.j.id }); ok(f.st === 400, 'la page ne peut plus obtenir de reçu pour ce paiement', f.j);

  T('Club (don mensuel) : moyens proposés et prélèvement SEPA');
  let c = await call('POST', '/api/intent', { ...P, email: 'ruth.amar@exemple.com', prenom: 'Ruth', nom: 'Amar', besoin: CLUB, montant: '26' }); pi = await stripe.paymentIntents.retrieve(c.j.id, { expand: ['invoice.subscription'] });
  ok(c.st === 200 && c.j.mensuel === true && ['card', 'paypal', 'klarna', 'sepa_debit'].every(t => pi.payment_method_types.includes(t)), 'don mensuel : carte, PayPal, Klarna et prélèvement SEPA proposés', pi.payment_method_types);
  const subId = pi.invoice && (typeof pi.invoice.subscription === 'string' ? pi.invoice.subscription : pi.invoice.subscription && pi.invoice.subscription.id); if (subId) subs.push(subId);
  await sepa(c.j.id, IBAN_OK, { ...P, prenom: 'Ruth', nom: 'Amar', email: 'ruth.amar@exemple.com' }); f = await call('POST', '/api/finalize', { id: c.j.id });
  ok(f.j && f.j.attente === true && f.j.mensuel === true && f.j.montant === 2600, 'mandat accepté : 26 € par mois, en cours à la banque', f.j);
  let r = await call('GET', '/api/besoin/' + CLUB); ok(r.j.participants === 0, 'pas encore compté comme membre', r.j.participants);
  ok(await attendre(c.j.id, ['succeeded']) === 'succeeded', 'la banque verse la 1re échéance (Stripe test)');
  await hook('payment_intent.succeeded', c.j.id); rec = lire().receipts[c.j.id];
  ok(rec && rec.mensuel === true && rec.montant === 2600 && /SEPA/.test(rec.mode) && rec.besoin === CLUB, 'reçu de la 1re échéance : 26 €, mensuel, prélèvement SEPA, rattaché au club', rec && { mode: rec.mode, b: rec.besoin });
  r = await call('GET', '/api/besoin/' + CLUB); ok(r.j.participants === 1, 'compté comme membre une fois le don reçu', r.j.participants);
  { const s = await stripe.subscriptions.retrieve(subId, { expand: ['default_payment_method'] }); ok(s.status === 'active' && !s.cancel_at && s.default_payment_method && s.default_payment_method.type === 'sepa_debit', 'abonnement Stripe (test) actif, prélevé chaque mois sur le compte bancaire', { st: s.status, pm: s.default_payment_method && s.default_payment_method.type }); }

  T('Carte : inchangé');
  let a = await call('POST', '/api/intent', { ...P, email: 'lea.b@exemple.com', montant: '18' }); await stripe.paymentIntents.confirm(a.j.id, { payment_method: 'pm_card_visa', return_url: B + '/' }); f = await call('POST', '/api/finalize', { id: a.j.id });
  ok(f.st === 200 && f.j.numero && !f.j.attente && /Carte/.test(lire().receipts[a.j.id].mode), 'don par carte : reçu immédiat, comme avant', f.j && f.j.numero);

  for (const s of subs) try { await stripe.subscriptions.cancel(s); } catch (e) {}
  if (fail) console.log(log.slice(-1500));
  await fin();
})().catch(async e => { console.error('ERREUR', e, log.slice(-1500)); await fin(); });
