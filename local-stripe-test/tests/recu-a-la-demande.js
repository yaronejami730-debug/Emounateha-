// REÇUS REFABRIQUÉS À LA DEMANDE — serveur de dons neuf (port 3196, données jetables, Stripe TEST, mails simulés).
// Le PDF n'est plus conservé : on vérifie qu'un reçu redemandé ressort avec exactement le même contenu (texte et image de la page),
// même des années plus tard, même après une correction, et que les reçus d'avant ce système (sans fiche) ne sont pas cassés.
// Aucun vrai paiement, aucun vrai mail.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), crypto = require('crypto'), { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
if (!/^sk_test_/.test(env.STRIPE_SECRET_KEY)) { console.log('clé non test : arrêt'); process.exit(1); }
process.env.DATA_KEY = env.DATA_KEY;
const stripe = require(path.join(ROOT, 'node_modules', 'stripe'))(env.STRIPE_SECRET_KEY), vault = require(path.join(ROOT, 'vault.js'));
const B = 'http://127.0.0.1:3196', wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  ECHEC', m, c ? '' : JSON.stringify(x === undefined ? null : x).slice(0, 500)); }; const T = t => console.log('\n— ' + t);
const site = http.createServer((q, r) => { r.writeHead(404, { 'content-type': 'application/json' }); r.end('{}'); }).listen(3189, '127.0.0.1');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recus-')), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recus-cmp-')), SECRET = 'essai-' + Date.now();
// horloge décalable : quand le fichier « plus-tard » existe, le serveur croit être 3 ans plus tard
const FLAG = path.join(tmp, 'plus-tard'), PRE = path.join(tmp, 'horloge.js'), DEC = 3 * 365 * 864e5;
fs.writeFileSync(PRE, `const fs=require('fs'),R=Date,F=${JSON.stringify(FLAG)},d=()=>fs.existsSync(F)?${DEC}:0;class D extends R{constructor(...a){if(a.length===0)super(R.now()+d());else super(...a)}static now(){return R.now()+d()}}global.Date=D;`);
const V99 = path.join(ROOT, 'templates', 'cerfa-v99.html'), A99 = path.join(ROOT, 'templates', 'asso-v99.json');
const srv = spawn('node', ['--require', PRE, 'server.js'], { cwd: ROOT, env: { ...process.env, PORT: '3196', SITE_URL: 'http://127.0.0.1:3189', DATA_DIR: dir, MAIL_SIMULATE: '1', CERFA_SECRET: SECRET }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const fin = async () => { try { process.kill(-srv.pid); } catch (e) { srv.kill(); }   // tout le groupe : « node » peut être un lanceur qui laisse le vrai serveur en vie
  site.close(); for (const f of [V99, A99]) try { fs.unlinkSync(f); } catch (e) {} for (const x of [dir, tmp]) try { fs.rmSync(x, { recursive: true, force: true }); } catch (e) {} console.log('\n' + pass + ' ok, ' + fail + ' échec'); process.exit(fail ? 1 : 0); };
async function call(m, u, b, h = {}) { const r = await fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', origin: B, ...h }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { st: r.status, j: ct.includes('json') ? await r.json() : null }; }
const sig = (m, p, dec = 0) => { const ts = Date.now() + dec, k = crypto.createHash('sha256').update('emounateha-cerfa|' + SECRET).digest(); return { 'x-cerfa-ts': String(ts), 'x-cerfa-sig': crypto.createHmac('sha256', k).update(ts + '|' + m + '|' + p).digest('hex') }; };
const P = { type: 'particulier', prenom: 'Sarah', nom: 'Lévy', adresse: '8 avenue Félix Faure', cp: '69003', ville: 'Lyon', email: 'sarah.levy@exemple.com', tel: '0612345678', montant: '52', frequence: 'ponctuel', duree: 'infini', repartition: 'mois', envoyerEmail: true };
const E = { ...P, type: 'entreprise', raisonSociale: 'Boulangerie Benhamou SAS', siren: '732829320', prenom: '', nom: '', email: 'compta@benhamou.exemple.com', montant: '300' };
async function don(body) { const i = await call('POST', '/api/intent', body); if (i.st !== 200) return { i, f: null }; await stripe.paymentIntents.confirm(i.j.id, { payment_method: 'pm_card_visa', return_url: B + '/' }); return { i, id: i.j.id, f: await call('POST', '/api/finalize', { id: i.j.id }) }; }
const DATA = path.join(dir, 'data.json'), lire = () => JSON.parse(vault.readFile(DATA).toString('utf8')), ecrire = d => vault.writeFile(DATA, Buffer.from(JSON.stringify(d)));
const disque = f => path.join(dir, 'recus', f), efface = f => { try { fs.unlinkSync(disque(f)); } catch (e) {} };
const pdfAdmin = async (f, dec = 0) => { const r = await fetch(B + '/api/admin/pdf?f=' + encodeURIComponent(f), { headers: sig('GET', '/api/admin/pdf', dec) }); return { st: r.status, b: Buffer.from(await r.arrayBuffer()) }; };
const pdfLien = async u => { const r = await fetch(B + u); return { st: r.status, b: Buffer.from(await r.arrayBuffer()) }; };
let n = 0; const texte = b => { const f = path.join(tmp, 'p' + (++n) + '.pdf'); fs.writeFileSync(f, b); return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); };
const image = b => { const f = path.join(tmp, 'i' + (++n) + '.pdf'), g = f.replace(/pdf$/, 'png'); fs.writeFileSync(f, b); execFileSync('sips', ['-s', 'format', 'png', '-Z', '1700', f, '--out', g], { stdio: 'ignore' }); return g; };
const memeImage = (a, b) => execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image, ImageChops\na=Image.open(sys.argv[1]).convert("RGB"); b=Image.open(sys.argv[2]).convert("RGB")\nprint("pareil" if a.size==b.size and ImageChops.difference(a,b).getbbox() is None else "different")', image(a), image(b)], { encoding: 'utf8' }).trim() === 'pareil';
const refab = () => (log.match(/refabriqué à la demande/g) || []).length;
const estPdf = x => x.st === 200 && x.b.slice(0, 5).toString() === '%PDF-' && x.b.length > 50000;

(async () => {
  for (let k = 0; k < 50; k++) { try { await fetch(B + '/api/config'); break; } catch (e) { await wait(300); } }

  T('1. Don d\'un particulier : la fiche du reçu est enregistrée');
  const d1 = await don(P), r1 = d1.f && d1.f.j; let D = lire(), R1 = D.receipts[d1.id];
  ok(r1 && r1.numero && R1 && R1.file, 'don payé (carte de test), reçu ' + (r1 && r1.numero), [d1.i, r1]);
  ok(R1.impr && R1.impr.v === 1 && R1.impr.nom === R1.nom && /8 avenue Félix Faure, 69003 Lyon/.test(R1.impr.adresse) && R1.impr.montant === 5200 && R1.impr.signe === R1.creeLe && R1.impr.dateDon === R1.dateDon, 'fiche : modèle n° 1, nom, adresse, montant, date du don, date de signature', R1.impr);
  const o1 = await pdfLien(r1.pdf), t1 = texte(o1.b);
  ok(estPdf(o1) && t1.includes(r1.numero) && /52,00/.test(t1) && /L[ÉE]VY/i.test(t1), 'PDF d\'origine téléchargé (' + Math.round(o1.b.length / 1024) + ' Ko) : numéro, montant et nom lisibles');
  ok(o1.b.length < 400000, 'le reçu utilise bien le logo allégé (moins de 400 Ko)', o1.b.length);
  ok(/^[0-9a-f]{64}$/.test(R1.sha || '') && R1.sha === crypto.createHash('sha256').update(o1.b).digest('hex'), 'empreinte enregistrée = empreinte du PDF remis au donateur');

  T('2. Le PDF a disparu du disque : il est refabriqué, identique');
  efface(R1.file); let k0 = refab();
  const o2 = await pdfLien(r1.pdf), t2 = texte(o2.b);
  ok(estPdf(o2) && refab() === k0 + 1, 'reçu redemandé par son lien : refabriqué (' + Math.round(o2.b.length / 1024) + ' Ko)', [o2.st, o2.b.length]);
  ok(t2 === t1, 'même texte, mot pour mot', [t1.slice(0, 200), t2.slice(0, 200)]);
  ok(memeImage(o1.b, o2.b), 'même page, point pour point (logo, signature, mise en page)');
  k0 = refab(); const o2b = await pdfLien(r1.pdf); ok(estPdf(o2b) && refab() === k0, 'demandé une 2e fois : servi tel quel, pas refabriqué de nouveau');
  efface(R1.file); k0 = refab(); const duo = await Promise.all([pdfLien(r1.pdf), pdfLien(r1.pdf), pdfAdmin(R1.file)]);
  ok(duo.every(estPdf) && refab() - k0 >= 1, 'trois demandes en même temps : toutes servies', duo.map(x => [x.st, x.b.length]));
  const sans = await fetch(B + r1.pdf.split('?')[0]); ok([401, 403].includes(sans.status), 'sans lien signé ni connexion : toujours refusé (' + sans.status + '), rien n\'est fabriqué', sans.status);
  efface(R1.file); k0 = refab(); const sans2 = await fetch(B + r1.pdf.split('?')[0]); ok([401, 403].includes(sans2.status) && refab() === k0 && !fs.existsSync(disque(R1.file)), 'refus aussi quand le PDF manque : aucune fabrication pour un inconnu');

  T('3. Trois ans plus tard');
  efface(R1.file); fs.writeFileSync(FLAG, '1'); const o3 = await pdfAdmin(R1.file, DEC); fs.unlinkSync(FLAG);
  const t3 = estPdf(o3) ? texte(o3.b) : '';
  ok(estPdf(o3) && t3 === t1, 'reçu redemandé 3 ans après : même texte, la date de signature reste celle du jour du don', [o3.st, t3.slice(-300)]);
  ok(estPdf(o3) && memeImage(o1.b, o3.b), 'et même page, point pour point');

  T('4. Renvoi par e-mail depuis le CRM');
  efface(R1.file); const rv = await call('POST', '/api/admin/renvoyer', { ref: d1.id }, sig('POST', '/api/admin/renvoyer'));
  // ici aucun vrai envoi : le serveur range le mail (avec sa pièce jointe) dans un fichier .eml et le dit ; en ligne, c'est Brevo qui l'envoie
  const eml = disque(R1.file.replace(/\.pdf$/, '.eml')), mail = fs.existsSync(eml) ? vault.readFile(eml).toString('utf8') : '';
  ok((rv.st === 200 || /\.eml/.test((rv.j || {}).error || '')) && fs.existsSync(disque(R1.file)), 'PDF absent : refabriqué au moment du renvoi', rv);
  ok(/application\/pdf/.test(mail) && mail.includes('Recu-fiscal-' + r1.numero) && mail.length > 100000, 'le mail préparé contient bien le PDF en pièce jointe (' + Math.round(mail.length / 1024) + ' Ko)', mail.slice(0, 300));
  ok((lire().receipts[d1.id].mails || []).some(m => m.par === 'crm' && m.to === P.email), 'le renvoi est noté dans la fiche du reçu');

  T('5. Société');
  const d5 = await don(E), r5 = d5.f && d5.f.j; D = lire(); const R5 = D.receipts[d5.id];
  const o5 = await pdfLien(r5.pdf), t5 = texte(o5.b); efface(R5.file); const o5b = await pdfLien(r5.pdf);
  ok(estPdf(o5) && /732 829 320/.test(t5) && /238 bis/.test(t5) && R5.impr.siren === '732829320', 'reçu de société : SIREN et article 238 bis imprimés, SIREN dans la fiche', [o5.st, R5.impr]);
  ok(estPdf(o5b) && texte(o5b.b) === t5 && memeImage(o5.b, o5b.b), 'refabriqué : même texte, même page');

  T('6. Reçu corrigé par le donateur (annule et remplace)');
  const tok = crypto.randomBytes(32).toString('hex'); D = lire(); D.sessions = D.sessions || {}; D.sessions[crypto.createHash('sha256').update(tok).digest('hex')] = { email: P.email, exp: Date.now() + 3600e3 }; ecrire(D);
  const co = await call('POST', '/api/me/receipts/' + d1.id + '/corriger', { data: { prenom: 'Sarah', nom: 'Lévy', adresse: '12 rue de la République', cp: '69002', ville: 'Lyon', tel: '0612345678' } }, { cookie: 'don_sid=' + tok });
  D = lire(); const C = D.receipts[d1.id], vieux = (C.corrections || [])[0];
  ok(co.st === 200 && co.j.ok && C.numero !== r1.numero && C.remplace === r1.numero && C.impr.remplace === r1.numero && /12 rue de la République/.test(C.impr.adresse), 'correction faite : nouveau reçu ' + C.numero + ', sa fiche porte la nouvelle adresse et « remplace ' + r1.numero + ' »', [co, C.impr]);
  ok(vieux && vieux.file === R1.file && vieux.impr && /8 avenue Félix Faure/.test(vieux.impr.adresse) && vieux.sha === R1.sha, 'l\'ancien reçu garde sa propre fiche (ancienne adresse) et son empreinte', vieux);
  const n1 = await pdfAdmin(C.file), tn = texte(n1.b); efface(C.file); const n2 = await pdfAdmin(C.file);
  ok(estPdf(n1) && /Annule et remplace/.test(tn) && tn.includes(r1.numero) && /12 rue de la République/i.test(tn) && C.sha === crypto.createHash('sha256').update(n1.b).digest('hex'), 'nouveau reçu : mention « Annule et remplace », nouvelle adresse');
  ok(estPdf(n2) && texte(n2.b) === tn && memeImage(n1.b, n2.b), 'nouveau reçu refabriqué : même texte, même page');
  efface(R1.file); const a1 = await pdfAdmin(R1.file), ta = estPdf(a1) ? texte(a1.b) : '';
  ok(estPdf(a1) && ta === t1, 'ancien reçu (annulé) redemandé depuis le CRM : ressort tel qu\'il était, ancienne adresse, sans la mention', [a1.st, ta.slice(0, 200)]);
  const ad = await fetch(B + '/recus/' + R1.file, { headers: { cookie: 'don_sid=' + tok } }); ok(ad.status === 403, 'le donateur, lui, ne peut plus ouvrir le reçu annulé (' + ad.status + ')');
  const nd = await fetch(B + '/recus/' + C.file, { headers: { cookie: 'don_sid=' + tok } }); ok(nd.status === 200, 'il ouvre le nouveau depuis son espace, connecté (' + nd.status + ')');

  T('7. Modèle de reçu changé plus tard : un ancien reçu garde son modèle');
  fs.writeFileSync(V99, fs.readFileSync(path.join(ROOT, 'templates', 'cerfa.html'), 'utf8').replace('</body>', '<p>MODELE-DEPOQUE</p></body>')); fs.writeFileSync(A99, JSON.stringify({ adresse: '1 ancienne adresse, 75001 Paris' }));
  D = lire(); D.receipts[d5.id].impr.v = 99; ecrire(D); efface(R5.file); const m1 = await pdfAdmin(R5.file), tm = estPdf(m1) ? texte(m1.b) : '';
  ok(estPdf(m1) && /MODELE-DEPOQUE/.test(tm) && /1 ancienne adresse/.test(tm) && /732 829 320/.test(tm), 'reçu marqué d\'un autre modèle : refait avec le dessin et l\'adresse d\'association de ce modèle-là', [m1.st, tm.slice(-200)]);
  efface(C.file); const m2 = await pdfAdmin(C.file); ok(estPdf(m2) && !/MODELE-DEPOQUE/.test(texte(m2.b)), 'les reçus du modèle courant ne sont pas touchés');
  fs.unlinkSync(V99); fs.unlinkSync(A99);

  T('8. Reçus d\'avant ce système (sans fiche)');
  const d8 = await don({ ...P, email: 'ancien.donateur@exemple.com', montant: '20' }), r8 = d8.f.j; D = lire(); const f8 = D.receipts[d8.id].file; delete D.receipts[d8.id].impr; delete D.receipts[d8.id].sha; ecrire(D);
  const l1 = await pdfLien(r8.pdf); ok(estPdf(l1), 'PDF présent : servi comme avant');
  efface(f8); const l2 = await pdfLien(r8.pdf), l3 = await pdfAdmin(f8);
  ok(l2.st === 404 && l3.st === 404, 'PDF absent et pas de fiche : « introuvable » proprement (' + l2.st + ', ' + l3.st + '), pas de plantage ni de faux reçu');
  const inc = await pdfAdmin('recu_INCONNU-2026-9999_abcdef.pdf'); ok(inc.st === 404, 'nom de fichier inconnu : introuvable (' + inc.st + ')');
  const cfg = await call('GET', '/api/config'); ok(cfg.st === 200, 'le serveur répond toujours normalement après tout ça');
  await fin();
})().catch(async e => { console.log('ERREUR', e); console.log(log.slice(-1500)); fail++; await fin(); });
