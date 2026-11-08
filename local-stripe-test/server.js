/* PAGE DE TEST LOCALE — Stripe (mode test) + reçu fiscal CERFA en PDF + email.
   Écoute uniquement sur 127.0.0.1 : inaccessible depuis Internet (pas dans le tunnel du site), liée à aucune page du site, non publiée. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer-core');
const { montantEnLettres } = require('./nombreEnLettres');
const vault = require('./vault');

// --- variables d'environnement (.env local, jamais publié) ---
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {}
vault.ensureKey(path.join(__dirname, '.env'));
const ASSO = JSON.parse(fs.readFileSync(path.join(__dirname, 'asso.config.json'), 'utf8'));
const PORT = Number(process.env.PORT || 3100);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREFIX = process.env.NUM_PREFIX || 'TEST';
const DATA = path.join(__dirname, 'data.json');
const RECUS = path.join(__dirname, 'recus');
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'cerfa.html');
fs.mkdirSync(RECUS, { recursive: true, mode: 0o700 });

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
if (stripe && !/^sk_test_/.test(process.env.STRIPE_SECRET_KEY)) { console.error('Clé Stripe non TEST : arrêt par sécurité.'); process.exit(1); }

// --- petit stockage local (numéros de reçu, dons en attente, reçus déjà générés) ---
const load = () => {
  if (!fs.existsSync(DATA)) return { counters: {}, pending: {}, receipts: {} };
  return JSON.parse(vault.readFile(DATA).toString('utf8'));      // fichier illisible ou modifié : on s'arrête plutôt que d'écraser les données
};
const save = d => vault.writeFile(DATA, JSON.stringify(d));       // data.json est chiffré (AES-256-GCM)
function nextNumero(annee) { const d = load(); d.counters[annee] = (d.counters[annee] || 0) + 1; save(d); return `${PREFIX}-${annee}-${String(d.counters[annee]).padStart(4, '0')}`; }

// --- validation ---
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function sirenValide(s) { s = String(s).replace(/\s/g, ''); if (!/^\d{9}$/.test(s)) return false; let sum = 0; for (let i = 0; i < 9; i++) { let d = +s[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; }
const mailer = require('./mailer');
const acc = require('./accounts')({ load, save, RECUS, clean, sirenValide, mailer });
const MODES = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire (Stripe, test)'];
const AFFECT = ['Là où le besoin est le plus grand', 'Colis de Chabbat et de fêtes', 'Un toit sur la tête (nuits d\'hôtel)', 'Soutien moral et financier', 'Réinsertion sociale', 'Vêtements et soins'];
const affectation = b => (AFFECT.includes(b.affectation) ? b.affectation : AFFECT[0]);
function validerDonateur(b) {
  const type = b.type === 'entreprise' ? 'entreprise' : 'particulier';
  const nom = type === 'entreprise' ? clean(b.raisonSociale, 120) : [clean(b.prenom, 60), clean(b.nom, 60).toUpperCase()].filter(Boolean).join(' ');
  if (type === 'particulier' && (!clean(b.prenom, 60) || !clean(b.nom, 60))) throw new Error('Prénom et nom requis');
  if (type === 'entreprise' && !nom) throw new Error('Raison sociale requise');
  const siren = String(b.siren || '').replace(/\s/g, '');
  if (type === 'entreprise' && !siren) throw new Error('SIREN requis pour un don professionnel');
  if (type === 'entreprise' && siren && !sirenValide(siren)) throw new Error('SIREN invalide (9 chiffres)');
  const rue = clean(b.adresse, 140), cp = clean(b.cp, 10), ville = clean(b.ville, 80);
  if (rue.length < 3 || !/^\d{5}$/.test(cp) || ville.length < 2) throw new Error('Adresse complète requise (rue, code postal à 5 chiffres, ville)');
  const email = clean(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Email invalide');
  const montant = Math.round(Number(String(b.montant).replace(',', '.')) * 100);
  if (!Number.isInteger(montant) || montant < 100 || montant > 10000000) throw new Error('Montant invalide (de 1 € à 100 000 €)');
  return { type, nom, siren: type === 'entreprise' ? siren : '', adresse: `${rue}, ${cp} ${ville}`, ville, email, montant, form: { prenom: clean(b.prenom, 60), nom: clean(b.nom, 60), raisonSociale: clean(b.raisonSociale, 120), siren, adresse: rue, cp, ville } };
}

// --- reçu : HTML -> PDF (Chrome) ---
const lieu = ASSO.lieuSignature || '';
function remplir(don, numero) {
  const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const ent = don.type === 'entreprise';
  const img = (f, mime) => `data:${mime};base64,${fs.readFileSync(path.join(__dirname, f)).toString('base64')}`;
  const logo = ASSO.logo && fs.existsSync(path.join(__dirname, ASSO.logo)) ? img(ASSO.logo, /\.png$/i.test(ASSO.logo) ? 'image/png' : 'image/jpeg') : '';
  const sigOk = ASSO.signatureImage && fs.existsSync(path.join(__dirname, ASSO.signatureImage));
  const sig = sigOk ? `<img src="${img(ASSO.signatureImage, /\.png$/i.test(ASSO.signatureImage) ? 'image/png' : 'image/jpeg')}" alt="signature"/>${ASSO.signataire ? `<div class="who2">${esc(ASSO.signataire)}</div>` : ''}`
                    : `<div style="height:16mm"></div><div class="who2">${esc(ASSO.signataire || 'Signé électroniquement')}</div>`;
  const ligne = (k, v) => `<div class="row"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
  const v = {
    numeroRecu: esc(numero),
    titreCerfa: ent ? "Reçu des dons et versements effectués par les entreprises au titre de l'article 238 bis du code général des impôts"
                    : 'Reçu des dons et versements effectués par les particuliers au titre des articles 200 et 978 du code général des impôts',
    assoLogo: logo, assoNom: esc(ASSO.nom.toUpperCase()), assoAdresse: esc(ASSO.adresse), assoSiren: esc(`${ASSO.siren.replace(/\s/g, '')} / ${ASSO.rna}`),
    assoObjet: esc(ASSO.objet), assoQualite: esc(ASSO.qualite || "Œuvre ou organisme d'intérêt général"),
    montantFigures: (don.montant / 100).toFixed(2).replace('.', ','), montantLettres: esc(montantEnLettres(don.montant)),
    donateurBloc: esc(don.nom) + '<br>' + esc(don.adresse.split(',')[0]) + '<br>' + esc(don.adresse.split(',').slice(1).join(',').trim()),
    donateurNom: esc(don.nom.toUpperCase()), donateurSiren: ent && don.siren ? ligne('Numéro SIREN', don.siren.replace(/(\d{3})(?=\d)/g, '$1 ')) : '', donateurAdresse: esc(don.adresse),
    check200: ent ? '' : '✔', check238: ent ? '✔' : '', check978: '',
    modePaiement: esc(don.mode.replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne')), dateSignature: fmt(Date.now()),
    assoForme: esc(ASSO.forme || ''), assoSiret: esc(ASSO.siret || ''), assoContact: esc(`${ASSO.email} · ${ASSO.telephone}`), assoNomMin: esc(ASSO.nom), assoEmail: esc(ASSO.email), conservation: esc(ASSO.conservation || '6 ans'),
    dateVersement: fmt(don.dateDon), periodicite: don.mensuel ? `Don mensuel (un reçu pour chaque prélèvement) — échéance n°${don.echeance || 1}` : 'Don ponctuel',
    modeEsp: /Esp[eè]ces/i.test(don.mode) ? '✔' : '', modeChq: /Ch[eè]que/i.test(don.mode) ? '✔' : '', modeVir: /Esp[eè]ces|Ch[eè]que/i.test(don.mode) ? '' : '✔',
    blocSignature: sig, piedPage: esc(`Reçu fiscal généré par ${ASSO.nom} · ${ASSO.email} · ${ASSO.telephone}`), testDisplay: process.env.NO_TEST_BANNER ? 'display:none' : ''
  };
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8'); for (const [k, val] of Object.entries(v)) html = html.split(`{{${k}}}`).join(val); return html;
}
let browserP = null;
const browser = () => browserP || (browserP = puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] }));
let pdfActifs = 0; const pdfAttente = [];                          // au plus 3 PDF fabriqués en même temps (évite de saturer l'ordinateur)
const pdfPlace = () => pdfActifs < 3 ? (pdfActifs++, Promise.resolve()) : new Promise(r => pdfAttente.push(r));
const pdfLibere = () => { const n = pdfAttente.shift(); if (n) n(); else pdfActifs--; };
async function pdf(html, file) {
  await pdfPlace();
  try { return await pdf1(html, file); } finally { pdfLibere(); }
}
async function pdf1(html, file) {
  const b = await browser(), page = await b.newPage();
  try { await page.setContent(html, { waitUntil: 'load' }); vault.writeFile(file, Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))); } finally { await page.close(); }
}

// --- email : vrai envoi si SMTP configuré, sinon fichier .eml (ouvrable dans Mail) ---
async function envoyer({ to, numero, pdfFile, nom, affectation: aff, mensuel, don }) {
  if (don && !mailer.isFake(to)) {     // vraie adresse : email Brevo (modèle unique pour tous les dons), reçu en pièce jointe
    const m = await mailer.donEmail({ prenom: don.type === 'entreprise' ? '' : (don.form && don.form.prenom) || '', montant: don.montant, dateDon: don.dateDon, affectation: don.affectation, mode: don.mode.replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne'), numero, mensuel: don.mensuel, echeance: don.echeance,
      spaceUrl: process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/espace/' : '', test: PREFIX === 'TEST' });
    if (m) { const r = await mailer.send({ to, toName: nom, subject: m.subject, html: m.html, text: m.text, attachments: [{ name: `Recu-fiscal-${numero}.pdf`, content: vault.readFile(pdfFile).toString('base64') }] }); if (r.sent) return { sent: true, messageId: r.messageId, brevo: true }; }
  }
  const subject = `[TEST] Votre reçu fiscal ${numero} — ${ASSO.nom}`;
  const text = `Bonjour ${nom},\n\nMerci pour votre don à ${ASSO.nom}. Vous trouverez ci-joint votre reçu fiscal ${numero}.${aff ? `\nAffectation de votre don : ${aff}.` : ''}${mensuel ? '\nVotre don est mensuel : un reçu vous sera adressé pour chaque prélèvement.' : ''}\n\n(Message de TEST : aucun argent réel, reçu sans valeur fiscale.)\n\nCordialement,\n${ASSO.nom}\n${ASSO.telephone} · ${ASSO.email}`;
  const attachments = [{ filename: `Recu-fiscal-${numero}.pdf`, content: vault.readFile(pdfFile), contentType: 'application/pdf' }];
  const from = process.env.MAIL_FROM || `${ASSO.nom} <${ASSO.email}>`;
  if (process.env.SMTP_HOST) {
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    const info = await t.sendMail({ from, to, subject, text, attachments });
    return { sent: true, messageId: info.messageId };
  }
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await t.sendMail({ from, to, subject, text, attachments });
  const eml = path.basename(pdfFile).replace(/\.pdf$/, '.eml');
  vault.writeFile(path.join(RECUS, eml), info.message);
  return { sent: false, eml: '/recus/' + eml, note: "SMTP non configuré : email enregistré en fichier .eml (double-clic pour l'ouvrir dans Mail)" };
}

async function fabriquer(don, { envoyerEmail }) {
  const annee = new Date(don.dateDon).getFullYear();
  const numero = nextNumero(annee);
  const file = path.join(RECUS, `recu_${numero}_${crypto.randomBytes(3).toString('hex')}.pdf`);
  await pdf(remplir(don, numero), file);
  const out = { numero, pdf: '/recus/' + path.basename(file), file: path.basename(file), montant: don.montant, mode: don.mode, donorEmail: String(don.email || '').toLowerCase(), dateDon: don.dateDon, type: don.type, nom: don.nom, affectation: don.affectation, mensuel: !!don.mensuel, echeance: don.echeance, form: don.form };
  out.email = envoyerEmail ? await envoyer({ to: don.email, numero, pdfFile: file, nom: don.nom, affectation: don.affectation, mensuel: don.mensuel, don }).catch(e => ({ error: e.message })) : { skipped: true };
  return out;
}

// chiffre ce qui était resté en clair (data.json, PDF, .eml)
try { vault.setAllowPlain(true); const n = vault.migrateDir(RECUS); if (fs.existsSync(DATA)) save(load()); vault.setAllowPlain(false); if (n) console.log(`[sécurité] ${n} fichier(s) existant(s) chiffré(s)`); } catch (e) { console.error('[sécurité] migration impossible :', e.message); process.exit(1); }

// --- serveur ---
const app = express();
app.disable('x-powered-by');
// --- accès : l'ordinateur local a tous les droits ; via le tunnel HTTPS (*.trycloudflare.com) seule la page de don est ouverte ---
const hits = new Map();
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && !req.headers['cf-connecting-ip']) return next();          // ordinateur local
  if (!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(host)) return res.status(403).type('text').send('Hôte non autorisé');   // rien d'autre n'entre
  if (req.path.startsWith('/backoffice') || req.path === '/api/recu') return res.status(403).type('text').send("Réservé à l'ordinateur local");
  if (req.method === 'POST') {                                                                                           // limite : 30 envois / 10 min / visiteur
    const ip = String(req.headers['cf-connecting-ip'] || req.ip), now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 600000);
    if (arr.length >= 30) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' });
    arr.push(now); hits.set(ip, arr);
  }
  next();
});
// --- en-têtes de sécurité (navigateur) ---
const STRIPE_H = 'https://*.stripe.com https://*.stripe.network https://*.stripecdn.com https://*.hcaptcha.com https://hcaptcha.com';
const CSP = ["default-src 'self'", `script-src 'self' 'unsafe-inline' ${STRIPE_H} https://pay.google.com`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:", `connect-src 'self' ${STRIPE_H} https://fonts.googleapis.com https://data.geopf.fr https://www.hebcal.com https://pay.google.com`, `frame-src ${STRIPE_H} https://pay.google.com`,
  "media-src 'self' https:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (/https/i.test(String(req.headers['x-forwarded-proto'] || ''))) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
// --- une page d'un autre site ne peut rien envoyer (anti-CSRF) : toute requête qui modifie quelque chose doit venir de ce site ---
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path === '/webhook') return next();   // le webhook est protégé par la signature Stripe
  const o = req.headers.origin; if (!o) return next();
  try { if (new URL(o).host === req.headers.host) return next(); } catch (e) {}
  res.status(403).json({ error: 'Origine non autorisée' });
});
app.use((req, res, next) => { if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('/'))) res.setHeader('Cache-Control', 'no-store');
  if (req.headers['cf-connecting-ip'] && (req.path === '/' || req.path.startsWith('/api/'))) console.log('[tunnel]', new Date().toISOString().slice(11, 19), req.method, req.path, '|', String(req.headers['user-agent'] || '').replace(/\(([^)]*)\)/, (m, g) => '(' + g.slice(0, 40) + ')').slice(0, 110)); next(); });
// --- webhook Stripe : la signature est vérifiée ; sans elle rien n'est traité ---
app.post('/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; if (!stripe || !secret) return res.status(503).send('Webhook non configuré');
  let ev; try { ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret); } catch (e) { console.log('[webhook] signature invalide'); return res.status(400).send('Signature invalide'); }
  try {
    if (ev.type === 'payment_intent.succeeded') {
      const id = ev.data.object.id, d = load();
      if (d.pending[id] || d.receipts[id]) { const r = await receiptForPayment(id); console.log('[webhook]', ev.type, id, '->', r.numero, r.deja ? '(déjà créé)' : '(créé par le webhook)'); }
      else console.log('[webhook]', ev.type, id, '-> ignoré (paiement qui ne vient pas de cette page)');
    } else if (ev.type === 'invoice.paid' && ev.data.object.billing_reason === 'subscription_cycle') {
      const inv = ev.data.object, d = load();                      // don mensuel : un reçu à chaque prélèvement (2e échéance et suivantes)
      if (d.receipts[inv.id]) console.log('[webhook] invoice.paid', inv.id, '(déjà créé)');
      else {
        const subId = inv.subscription || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription);
        if (!subId) throw new Error('abonnement introuvable sur la facture ' + inv.id);
        const sub = await stripe.subscriptions.retrieve(subId), cu = await stripe.customers.retrieve(inv.customer), m = sub.metadata || {}, ad = cu.address || {};
        const n = (await stripe.invoices.list({ subscription: sub.id, limit: 100 })).data.filter(i => i.status === 'paid').length;
        const out = await fabriquer({ type: m.type === 'entreprise' ? 'entreprise' : 'particulier', nom: cu.name, siren: m.siren || '', adresse: `${ad.line1 || ''}, ${ad.postal_code || ''} ${ad.city || ''}`, email: cu.email, montant: inv.amount_paid, mensuel: true, echeance: n,
          mode: 'Carte bancaire (Stripe, test) — don mensuel, échéance n°' + n, dateDon: new Date((inv.status_transitions.paid_at || inv.created) * 1000).toISOString(), affectation: m.affectation }, { envoyerEmail: m.envoi === '1' });
        out.affectation = m.affectation; out.mensuel = true; const d2 = load(); d2.receipts[inv.id] = out; save(d2);
        console.log('[webhook] invoice.paid', inv.id, '-> reçu', out.numero, '(mensualité n°' + n + ')');
      }
    } else console.log('[webhook]', ev.type, '(non traité)');
    res.json({ received: true });
  } catch (e) { console.error('[webhook] erreur', e.message); res.status(500).send('erreur'); }   // Stripe réessaiera plus tard
});
app.use(express.json({ limit: '50kb' }));
acc.mount(app);                                   // /api/auth/*, /api/me*, /recus/:fichier (liens signés)
// fichier de vérification Apple Pay (Apple le réclame à la racine du domaine, dans .well-known)
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'apple-pay', 'apple-developer-merchantid-domain-association')));
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
app.get('/api/config', (req, res) => res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', stripe: !!stripe, asso: { nom: ASSO.nom }, smtp: !!process.env.SMTP_HOST, modes: MODES.slice(0, 3), affectations: AFFECT }));

// 1) paiement : don ponctuel (PaymentIntent) ou mensuel (abonnement Stripe) sur le compte Stripe de test
// recherche d'entreprise par SIRET / SIREN (API publique recherche-entreprises.api.gouv.fr, sans clé)
const tcase = t => String(t || '').toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
app.get('/api/siret', async (req, res) => {
  try {
    const q = String(req.query.q || '').replace(/\s/g, '');
    if (!/^(\d{9}|\d{14})$/.test(q)) return res.status(400).json({ error: 'Saisissez 9 chiffres (SIREN) ou 14 chiffres (SIRET).' });
    const r = await fetch('https://recherche-entreprises.api.gouv.fr/search?per_page=1&q=' + q, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('service indisponible');
    const x = ((await r.json()).results || [])[0];
    if (!x || (q.length === 9 ? x.siren !== q : !String(x.siege && x.siege.siret) .startsWith(q.slice(0, 9)))) return res.status(404).json({ error: 'Aucune entreprise trouvée pour ce numéro.' });
    const e = (q.length === 14 && (x.matching_etablissements || []).find(m => m.siret === q)) || x.siege || {};
    const rue = [e.numero_voie, e.indice_repetition, e.type_voie, e.libelle_voie].filter(Boolean).join(' ') || String(e.adresse || '').replace(/\s*\d{5}.*$/, '');
    if (!(x.nom_raison_sociale || x.nom_complet)) return res.status(404).json({ error: 'Entreprise non diffusible : remplissez les champs à la main.' });
    res.json({ siren: x.siren, siret: e.siret || '', nom: tcase(x.nom_raison_sociale || x.nom_complet), adresse: tcase(rue), cp: e.code_postal || '', ville: tcase(e.libelle_commune || '') });
  } catch (e) { res.status(502).json({ error: 'Recherche impossible pour le moment. Remplissez les champs à la main.' }); }
});

app.post('/api/intent', async (req, res) => {
  try {
    if (!stripe) throw new Error('Stripe non configuré (.env)');
    const sess = acc.getSession(req), don = validerDonateur(req.body);
    if (sess) don.email = sess.email;                       // connecté : le reçu est rattaché au compte
    const mensuel = req.body.frequence === 'mensuel', aff = affectation(req.body);
    const meta = { type: don.type, donateur: don.nom.slice(0, 100), ville: don.ville.slice(0, 60), affectation: aff.slice(0, 80), frequence: mensuel ? 'mensuel' : 'ponctuel' };
    let id, clientSecret, subscription = null;
    if (mensuel) {
      const cust = await stripe.customers.create({ email: don.email, name: don.nom, address: { line1: don.adresse.split(',')[0], postal_code: (don.adresse.match(/\b\d{5}\b/) || [''])[0], city: don.ville, country: 'FR' }, metadata: meta });
      const sub = await stripe.subscriptions.create({ customer: cust.id, payment_behavior: 'default_incomplete', payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
        items: [{ price_data: { currency: 'eur', unit_amount: don.montant, recurring: { interval: 'month' }, product: (await stripe.products.create({ name: `Don mensuel ${ASSO.nom} (TEST)` })).id } }],
        metadata: { ...meta, siren: don.siren || '', envoi: req.body.envoyerEmail ? '1' : '0' }, expand: ['latest_invoice.payment_intent'] });
      const pi = sub.latest_invoice.payment_intent; id = pi.id; clientSecret = pi.client_secret; subscription = sub.id;
    } else {
      const pi = await stripe.paymentIntents.create({ amount: don.montant, currency: 'eur', payment_method_types: ['card'], description: `Don ${ASSO.nom} (TEST)`, metadata: meta });
      id = pi.id; clientSecret = pi.client_secret;
    }
    const d = load(); for (const [k, v] of Object.entries(d.pending)) if (Date.now() - (v.at || 0) > 3 * 86400000) delete d.pending[k];   // paiements jamais terminés : effacés après 3 jours
    d.pending[id] = { ...don, envoyerEmail: !!req.body.envoyerEmail, affectation: aff, mensuel, subscription, owner: sess ? sess.email : null, saveProfile: !!(sess && req.body.saveProfile), at: Date.now() }; save(d);
    res.json({ clientSecret, id, montant: don.montant, mensuel });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// 2) après paiement : le navigateur OU le webhook Stripe déclenchent la création du reçu ; on vérifie toujours auprès de Stripe, et une seule fois par paiement
const inflight = new Map();
async function receiptForPayment(id) {
  const d0 = load(); if (d0.receipts[id]) return { ...d0.receipts[id], deja: true };
  if (inflight.has(id)) return inflight.get(id);                 // deux demandes en même temps : la 2e attend la 1re
  const job = (async () => {
    const d = load(); if (d.receipts[id]) return { ...d.receipts[id], deja: true };
    const p = d.pending[id]; if (!p) throw new Error('Paiement inconnu de cette page');
    const pi = await stripe.paymentIntents.retrieve(id);
    if (pi.status !== 'succeeded') throw new Error(`Paiement non abouti (statut : ${pi.status})`);
    if (pi.amount !== p.montant) throw new Error('Montant incohérent');
    const out = await fabriquer({ ...p, echeance: 1, mode: p.mensuel ? 'Carte bancaire (Stripe, test) — don mensuel, 1re échéance' : MODES[3], dateDon: new Date(pi.created * 1000).toISOString() }, { envoyerEmail: p.envoyerEmail });
    out.affectation = p.affectation; out.mensuel = !!p.mensuel;
    const d2 = load(); d2.receipts[id] = out; delete d2.pending[id]; save(d2);
    if (p.owner && p.saveProfile) acc.saveProfileFromForm(p.owner, p.type, p.form);   // « enregistrer mes informations »
    return out;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job); return job;
}
app.post('/api/finalize', async (req, res) => {
  try {
    if (!stripe) throw new Error('Stripe non configuré');
    const id = String(req.body.id || ''); if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new Error('Paiement inconnu');
    res.json(acc.publicReceipt(await receiptForPayment(id)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// 3) reçu SANS paiement (virement, chèque, espèces déjà reçus)
app.post('/api/recu', async (req, res) => {
  try {
    const don = validerDonateur(req.body);
    const mode = MODES.slice(0, 3).includes(req.body.mode) ? req.body.mode : null; if (!mode) throw new Error('Mode de versement invalide');
    const dt = new Date(String(req.body.dateDon) + 'T12:00:00'); if (isNaN(dt) || dt > new Date()) throw new Error('Date du don invalide (pas dans le futur)');
    if (dt.getFullYear() < new Date().getFullYear() - 1) throw new Error('Date trop ancienne pour cette page de test');
    res.json(acc.publicReceipt(await fabriquer({ ...don, mode, dateDon: dt.toISOString(), affectation: affectation(req.body) }, { envoyerEmail: !!req.body.envoyerEmail })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// (les PDF ne sont plus servis publiquement : voir accounts.js, liens signés ou propriétaire connecté)
const SITE_PUBLIC = path.join(__dirname, '..', 'public');   // css, scripts et images du vrai site
const SITE = 'http://127.0.0.1:3000';                       // serveur du site local (bandeau Hanouka, date du jour…)
app.get(['/holidays.json', '/diffusion.json', '/api/zmanim', '/api/parasha', '/api/colis-videos', '/api/action-videos'], async (req, res) => {
  try { const r = await fetch(SITE + req.originalUrl); res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(Buffer.from(await r.arrayBuffer())); }
  catch (e) { res.status(502).json({ error: 'Serveur du site local (port 3000) indisponible' }); }
});
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use(express.static(SITE_PUBLIC, { index: false, dotfiles: 'deny' }));
app.listen(PORT, '127.0.0.1', () => console.log(`Test Stripe + CERFA → http://127.0.0.1:${PORT}  (stripe: ${stripe ? 'test OK' : 'non configuré'}, email: ${process.env.SMTP_HOST ? 'SMTP' : 'fichier .eml'})`));
