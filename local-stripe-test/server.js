/* PAGE DE TEST LOCALE — Stripe (mode test) + reçu fiscal CERFA en PDF + email.
   Écoute uniquement sur 127.0.0.1 : inaccessible depuis Internet (pas dans le tunnel du site), liée à aucune page du site, non publiée. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const loadPuppeteer = () => import('puppeteer-core').then(m => m.default || m);   // module ESM : chargé à la demande (Vercel refuse require)
const { montantEnLettres } = require('./nombreEnLettres');
const vault = require('./vault');

// --- variables d'environnement (.env local, jamais publié) ---
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) {}
if (process.env.NODE_ENV === 'production' && !/^[0-9a-f]{64}$/i.test(process.env.DATA_KEY || '')) { console.error('DATA_KEY (64 caractères hexadécimaux) obligatoire en production : arrêt.'); process.exit(1); }
vault.ensureKey(path.join(__dirname, '.env'));
const ASSO = JSON.parse(fs.readFileSync(path.join(__dirname, 'asso.config.json'), 'utf8'));
const PORT = Number(process.env.PORT || 3100);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LIVE = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || '');   // vrais paiements
const PREFIX = process.env.NUM_PREFIX !== undefined ? process.env.NUM_PREFIX : (LIVE ? '' : 'TEST');
const T = LIVE ? '' : ' (TEST)';
const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/don' : __dirname);           // en ligne : disque persistant (/data)
fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA = path.join(DATA_DIR, 'data.json');
const RECUS = path.join(DATA_DIR, 'recus');
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'cerfa.html');
fs.mkdirSync(RECUS, { recursive: true, mode: 0o700 });

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
if (stripe && LIVE && !process.env.VERCEL) { console.error('Clé Stripe LIVE sur l\'ordinateur local : arrêt par sécurité (vrais paiements seulement en ligne).'); process.exit(1); }

// --- petit stockage local (numéros de reçu, dons en attente, reçus déjà générés) ---
const load = () => {
  if (!fs.existsSync(DATA)) return { counters: {}, pending: {}, receipts: {} };
  return JSON.parse(vault.readFile(DATA).toString('utf8'));      // fichier illisible ou modifié : on s'arrête plutôt que d'écraser les données
};
const save = d => vault.writeFile(DATA, JSON.stringify(d));       // data.json est chiffré (AES-256-GCM)
// numéros des vrais reçus : suite de la numérotation de l'association (A2026/00351 = dernier reçu fait avant ce site)
const DEPART = { 2026: 351 };
function nextNumero(annee) { // les reçus TEST gardent leur propre compteur
  const d = load();
  if (PREFIX === 'TEST') { d.counters[annee] = (d.counters[annee] || 0) + 1; save(d); return `TEST-${annee}-${String(d.counters[annee]).padStart(4, '0')}`; }
  const k = 'reel-' + annee; d.counters[k] = Math.max(d.counters[k] || 0, DEPART[annee] || 0) + 1; save(d);
  return `${PREFIX || 'A'}${annee}/${String(d.counters[k]).padStart(5, '0')}`;
}
const nomFichier = n => String(n).replace(/[^A-Za-z0-9-]+/g, '-');

// --- validation ---
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function sirenValide(s) { s = String(s).replace(/\s/g, ''); if (!/^\d{9}$/.test(s)) return false; let sum = 0; for (let i = 0; i < 9; i++) { let d = +s[i]; if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; }
const mailer = require('./mailer');
const acc = require('./accounts')({ load, save, RECUS, clean, sirenValide, mailer });
const MODES = ['Virement bancaire', 'Chèque', 'Espèces', 'Carte bancaire (Stripe, test)'];
// --- À quoi affecter le don ---
// Les fêtes s'ouvrent AVANT leur date (« avant » = nombre de jours) et se ferment à la fête (Hanouka : à la fin des 8 jours).
// Les dates viennent du calendrier du site (holidays.json). Pour régler un délai : changer « avant » ci-dessous.
const FETES_FILE = path.join(__dirname, 'fetes.config.json');   // modifiable à la main : délais, actions de chaque fête, montants proposés
let fetesCache = { m: 0, list: [] };
function fetesConfig() {
  try { const m = fs.statSync(FETES_FILE).mtimeMs; if (m !== fetesCache.m) fetesCache = { m, list: JSON.parse(fs.readFileSync(FETES_FILE, 'utf8')).fetes.map(f => ({ ...f, re: new RegExp(f.match) })) }; } catch (e) { console.error('[fetes] fichier illisible, ancienne version conservée :', e.message); }
  return fetesCache.list;
}
const COLIS_CHABBAT = { label: 'Colis de Chabbat', kind: 'base', montant: 80, sous: 'et de fêtes, aux familles' };
const ACTIONS_FILE = path.join(__dirname, 'actions.config.json'); let actionsCache = { m: 0, map: {} };
function actionsConfig() {   // présentation des actions et du colis de Chabbat (photo, texte, choix), modifiable à la main
  try { const m = fs.statSync(ACTIONS_FILE).mtimeMs; if (m !== actionsCache.m) actionsCache = { m, map: JSON.parse(fs.readFileSync(ACTIONS_FILE, 'utf8')).actions || {} }; } catch (e) {}
  return actionsCache.map;
}   // toute l'année. Le colis de fête (130 €) n'existe QUE sous la forme d'une carte de fête ouverte (Hanouka, Pourim…)
const AFFECT_BASE = ['Là où le besoin est le plus grand', 'Colis de Chabbat', "Un toit sur la tête (nuits d'hôtel)", 'Réinsertion sociale', "L'aide à la scolarité", "L'aide à l'éducation", 'Soutien moral et financier', 'Vêtements et soins'];
const AFFECT_ANCIEN = ['Colis de Chabbat et de fêtes', 'Colis alimentaires', 'Colis de fête'];   // anciens reçus et anciens liens : toujours acceptés
const AFFECT_DEFAUT = AFFECT_BASE[0];
let calCache = { at: 0, list: [] };
async function calendrier() {
  if (Date.now() - calCache.at < 6 * 3600e3 && calCache.list.length) return calCache.list;
  try { const r = await fetch((process.env.SITE_URL || (process.env.VERCEL ? 'https://www.emounateha.fr' : 'http://127.0.0.1:3000')) + '/holidays.json', { signal: AbortSignal.timeout(5000) }); const l = await r.json(); if (Array.isArray(l) && l.length) calCache = { at: Date.now(), list: l }; else calCache.at = Date.now() - 5 * 60e3; }
  catch (e) { calCache.at = Date.now() - 5 * 60e3; }      // site local indisponible : on réessaie dans 5 minutes
  return calCache.list;
}
async function affectations(now = new Date()) {
  const cal = await calendrier(), j0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), fetes = [];
  for (const f of fetesConfig()) {
    const h = cal.filter(x => !x.chabad && f.re.test(x.title)).map(x => ({ ...x, jours: Math.round((Date.parse(x.date + 'T00:00:00Z') - j0) / 86400000) })).find(x => x.jours >= -(f.apres || 0));
    if (h && h.jours <= f.avant) fetes.push({ label: f.label, kind: 'fete', titre: f.titre || f.label, date: h.date, jours: h.jours, actions: f.actions || [], defaut: f.defaut || [], image: f.image || '', intro: f.intro || '', apropos: f.apropos || [] });
  }
  fetes.sort((a, b) => a.jours - b.jours);
  const AC = actionsConfig();
  const base = AFFECT_BASE.map(l => { const o = l === COLIS_CHABBAT.label ? { ...COLIS_CHABBAT } : { label: l, kind: 'base' }, c = AC[l]; return c ? { ...o, titre: c.titre || l, image: c.image || '', intro: c.intro || '', apropos: c.apropos || [], actions: c.actions || [], defaut: c.defaut || [] } : o; });
  return [...fetes, ...base];
}
// don « fête » : plusieurs actions cumulables + don libre. Le total est TOUJOURS recalculé ici (jamais pris tel quel du navigateur).
async function lignesFete(b) {
  if (b.lignes !== undefined && !Array.isArray(b.lignes)) throw new Error('Choix invalide');
  if (!Array.isArray(b.lignes) && !(Number(b.libre) > 0)) return null;
  const f = (await affectations()).find(a => a.label === b.affectation && Array.isArray(a.actions) && a.actions.length);
  if (!f) throw new Error("Cette action n'est pas ouverte aux dons en ce moment.");
  const eur = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const lignes = [], vu = new Set();
  for (const l of (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 12)) {
    const a = f.actions.find(x => x.id === String(l && l.id)); if (!a || vu.has(a.id)) throw new Error('Choix invalide');
    const c = eur(l.montant); if (!(c >= 100 && c <= 99999900)) throw new Error('Montant invalide pour « ' + a.court + ' » (de 1 € à 999 999 €)');
    vu.add(a.id); lignes.push({ id: a.id, label: a.court, montant: c });
  }
  if (b.libre !== undefined && b.libre !== '' && Number(String(b.libre).replace(',', '.')) !== 0) { const c = eur(b.libre); if (!(c >= 100 && c <= 99999900)) throw new Error('Don libre invalide (de 1 € à 999 999 €)'); lignes.push({ id: 'libre', label: 'Don libre', montant: c }); }
  if (!lignes.length) throw new Error('Choisissez au moins une action.');
  const total = lignes.reduce((t, l) => t + l.montant, 0); if (total > 99999900) throw new Error('Montant invalide (de 1 € à 999 999 €)');
  return { lignes, total, affectation: (f.kind === 'fete' ? f.titre + ' : ' + lignes.map(l => l.label).join(', ') : f.label).slice(0, 78) };
}
async function affectationsOk() { const l = await affectations(); return new Set([...l.map(a => a.label), ...AFFECT_ANCIEN]); }
const affectation = (b, ok) => (ok.has(b.affectation) ? b.affectation : AFFECT_DEFAUT);
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
  if (!Number.isInteger(montant) || montant < 100 || montant > 99999900) throw new Error('Montant invalide (de 1 € à 999 999 €)');
  return { type, nom, siren: type === 'entreprise' ? siren : '', adresse: `${rue}, ${cp} ${ville}`, ville, email, montant, form: { prenom: clean(b.prenom, 60), nom: clean(b.nom, 60), raisonSociale: clean(b.raisonSociale, 120), siren, adresse: rue, cp, ville, tel: type === 'entreprise' ? '' : clean(b.tel, 24) } };
}

// --- reçu : HTML -> PDF (Chrome) ---
const lieu = ASSO.lieuSignature || '';
const OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3.1 3.1 6.6-7" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';   // coche dessinée : ne dépend d'aucune police
function remplir(don, numero) {
  const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const ent = don.type === 'entreprise';
  const img = (f, mime) => `data:${mime};base64,${fs.readFileSync(path.join(__dirname, f)).toString('base64')}`;
  const LOGO = 'logo-recu.png';   // logo complet (emblème + אמונתך + EMOUNATEHA) : toujours celui-ci sur les reçus
  const logo = LOGO && fs.existsSync(path.join(__dirname, LOGO)) ? img(LOGO, /\.png$/i.test(LOGO) ? 'image/png' : 'image/jpeg') : '';
  const sigEnv = process.env.SIGNATURE_PNG_B64 ? 'data:image/png;base64,' + process.env.SIGNATURE_PNG_B64.replace(/\s/g, '') : '';   // en ligne : signature dans une variable d'environnement (jamais dans Git)
  const sigOk = sigEnv || (ASSO.signatureImage && fs.existsSync(path.join(__dirname, ASSO.signatureImage)));
  const sig = sigOk ? `<img src="${sigEnv || img(ASSO.signatureImage, /\.png$/i.test(ASSO.signatureImage) ? 'image/png' : 'image/jpeg')}" alt="signature"/>`
                    : `<div style="height:16mm"></div><div class="who2">${esc(ASSO.signataire || 'Signé électroniquement')}</div>`;
  const ligne = (k, v) => `<div class="row"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`;
  const v = {
    numeroRecu: esc(numero), mentionRemplace: don.remplace ? '<div class="rempl">Annule et remplace le reçu n° ' + esc(don.remplace) + '</div>' : '',
    cerfaCode: ent ? '2041-MEC-SD' : '2041-RD', cerfaNum: ent ? '16216*01' : '11580*05', donateurLabel: ent ? "Dénomination de l'entreprise" : 'Nom ou dénomination',
    titreCerfa: ent ? "Reçu des dons et versements effectués par les entreprises au titre de l'article 238 bis du code général des impôts"
                    : 'Reçu des dons et versements effectués par les particuliers au titre des articles 200 et 978 du code général des impôts',
    assoLogo: logo, assoNom: esc(ASSO.nom.toUpperCase()), assoAdresse: esc(ASSO.adresse), assoSiren: esc(`${ASSO.siren.replace(/\s/g, '')} / ${ASSO.rna}`),
    assoObjet: esc(ASSO.objet), assoQualite: esc(ASSO.qualite || "Œuvre ou organisme d'intérêt général"),
    montantFigures: (don.montant / 100).toFixed(2).replace('.', ','), montantLettres: esc(montantEnLettres(don.montant)),
    donateurBloc: esc(don.nom) + '<br>' + esc(don.adresse.split(',')[0]) + '<br>' + esc(don.adresse.split(',').slice(1).join(',').trim()),
    donateurNom: esc(don.nom.toUpperCase()), donateurSiren: ent && don.siren ? ligne('Numéro SIREN', don.siren.replace(/(\d{3})(?=\d)/g, '$1 ')) : '', donateurAdresse: esc(don.adresse),
    check200: ent ? '' : OK, check238: ent ? OK : '', check978: '',
    modePaiement: esc(don.mode.replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne')), dateSignature: fmt(Date.now()),
    assoForme: esc(ASSO.forme || ''), assoSiret: esc(ASSO.siret || ''), assoContact: esc(`${ASSO.email} · ${ASSO.telephone}`), assoNomMin: esc(ASSO.nom), assoEmail: esc(ASSO.email), conservation: esc(ASSO.conservation || '6 ans'),
    dateVersement: fmt(don.dateDon), periodicite: don.mensuel ? `Don mensuel (un reçu pour chaque prélèvement) — échéance n°${don.echeance || 1}${don.nb ? ' sur ' + don.nb : ''}` : 'Don ponctuel',
    modeCourt: /Esp[eè]ces/i.test(don.mode) ? 'Espèces' : /Ch[eè]que/i.test(don.mode) ? 'Chèque' : /Virement/i.test(don.mode) ? 'Virement' : /paypal/i.test(don.mode) ? 'PayPal' : /klarna/i.test(don.mode) ? 'Klarna' : /Apple Pay/i.test(don.mode) ? 'Carte bancaire (Apple Pay)' : /Google Pay/i.test(don.mode) ? 'Carte bancaire (Google Pay)' : 'Carte bancaire', modeEsp: /Esp[eè]ces/i.test(don.mode) ? OK : '', modeChq: /Ch[eè]que/i.test(don.mode) ? OK : '', modeVir: /Esp[eè]ces|Ch[eè]que/i.test(don.mode) ? '' : OK,
    blocSignature: sig, piedPage: esc(`Reçu cerfa généré par ${ASSO.nom}`), testDisplay: process.env.NO_TEST_BANNER || PREFIX !== 'TEST' ? 'display:none' : ''
  };
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8'); for (const [k, val] of Object.entries(v)) html = html.split(`{{${k}}}`).join(val); return html;
}
let browserP = null;
const browser = () => browserP || (browserP = (async () => {
  const puppeteer = await loadPuppeteer();
  if (process.env.VERCEL) { const m = await import('@sparticuz/chromium'), cr = m.default || m; return puppeteer.launch({ executablePath: await cr.executablePath(), headless: 'shell', args: cr.args }); }
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu', ...(process.env.CHROME_NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : [])] });
})());
let pdfActifs = 0; const pdfAttente = [];                          // au plus 3 PDF fabriqués en même temps (évite de saturer l'ordinateur)
const pdfPlace = () => pdfActifs < 3 ? (pdfActifs++, Promise.resolve()) : new Promise(r => pdfAttente.push(r));
const pdfLibere = () => { const n = pdfAttente.shift(); if (n) n(); else pdfActifs--; };
async function pdf(html, file) {
  await pdfPlace();
  try {
    try { return await pdf1(html, file); }
    catch (e) {   // le navigateur qui fabrique les PDF s'est fermé (ou a planté) : on le relance et on réessaie une fois
      console.error('[pdf] nouvel essai avec un navigateur neuf :', e.message);
      const vieux = browserP; browserP = null; try { if (vieux) (await vieux).close().catch(() => {}); } catch (x) {}
      return await pdf1(html, file);
    }
  } finally { pdfLibere(); }
}
async function pdf1(html, file) {
  const b = await browser(), page = await b.newPage();
  try { await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {}); await page.evaluate(() => document.fonts.ready); vault.writeFile(file, Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))); } finally { await page.close(); }
}

// --- email : vrai envoi si SMTP configuré, sinon fichier .eml (ouvrable dans Mail) ---
async function envoyer({ to, numero, pdfFile, nom, affectation: aff, mensuel, don }) {
  if (don && !mailer.isFake(to)) {     // vraie adresse : email Brevo (modèle unique pour tous les dons), reçu en pièce jointe
    const m = await mailer.donEmail({ prenom: don.type === 'entreprise' ? '' : (don.form && don.form.prenom) || '', montant: don.montant, dateDon: don.dateDon, affectation: don.affectation, mode: don.mode.replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne'), numero, mensuel: don.mensuel, echeance: don.echeance, remplace: don.remplace || '',
      spaceUrl: process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/espace/' : '', test: PREFIX === 'TEST' });
    if (m) { const r = await mailer.send({ to, toName: nom, subject: m.subject, html: m.html, text: m.text, attachments: [{ name: `Recu-fiscal-${nomFichier(numero)}.pdf`, content: vault.readFile(pdfFile).toString('base64') }] }); if (r.sent) return { sent: true, messageId: r.messageId, brevo: true }; }
  }
  const subject = `${LIVE ? '' : '[TEST] '}Votre reçu fiscal ${numero} — ${ASSO.nom}`;
  const text = `Bonjour ${nom},\n\nMerci pour votre don à ${ASSO.nom}. Vous trouverez ci-joint votre reçu fiscal ${numero}.${aff ? `\nAffectation de votre don : ${aff}.` : ''}${mensuel ? '\nVotre don est mensuel : un reçu vous sera adressé pour chaque prélèvement.' : ''}\n\n(Message de TEST : aucun argent réel, reçu sans valeur fiscale.)\n\nCordialement,\n${ASSO.nom}\n${ASSO.telephone} · ${ASSO.email}`;
  const attachments = [{ filename: `Recu-fiscal-${nomFichier(numero)}.pdf`, content: vault.readFile(pdfFile), contentType: 'application/pdf' }];
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
  return { sent: false, eml: (process.env.BASE_PATH || '') + '/recus/' + eml, note: "SMTP non configuré : email enregistré en fichier .eml (double-clic pour l'ouvrir dans Mail)" };
}

// alerte e-mail à l'administrateur à chaque don réussi (une seule fois par don : appelée juste après la création du reçu ; n'échoue jamais)
const notifyAdmin = out => mailer.notifyAdminDon({ nom: out.nom, email: out.donorEmail, type: out.type, montant: out.montant, dateDon: out.dateDon, affectation: out.affectation, mode: out.mode, numero: out.numero, mensuel: out.mensuel, echeance: out.echeance, fin: out.fin, nb: out.nb, total: out.total, ambassadeur: out.ambassadeur, test: PREFIX === 'TEST' });
async function fabriquer(don, { envoyerEmail }) {
  const annee = new Date(don.dateDon).getFullYear();
  const numero = nextNumero(annee);
  const file = path.join(RECUS, `recu_${nomFichier(numero)}_${crypto.randomBytes(3).toString('hex')}.pdf`);
  await pdf(remplir(don, numero), file);
  const out = { numero, pdf: (process.env.BASE_PATH || '') + '/recus/' + path.basename(file), file: path.basename(file), montant: don.montant, mode: don.mode, donorEmail: String(don.email || '').toLowerCase(), dateDon: don.dateDon, type: don.type, nom: don.nom, affectation: don.affectation, mensuel: !!don.mensuel, echeance: don.echeance, form: don.form };
  if (don.proche) { out.proche = don.proche; out.accordAt = don.accordAt || null; }
  out.email = envoyerEmail ? await envoyer({ to: don.email, numero, pdfFile: file, nom: don.nom, affectation: don.affectation, mensuel: don.mensuel, don }).catch(e => ({ error: e.message })) : { skipped: true };
  out.creeLe = new Date().toISOString();   // moment où le reçu (PDF) a été fabriqué : l'ordre de création suit la numérotation
  if (envoyerEmail) { out.email = { ...out.email, at: out.creeLe, to: String(don.email || '').toLowerCase(), par: 'auto' }; out.mails = [out.email]; }   // trace de l'envoi
  return out;
}

// chiffre ce qui était resté en clair (data.json, PDF, .eml)
try { vault.setAllowPlain(true); const n = vault.migrateDir(RECUS); if (fs.existsSync(DATA)) save(load()); vault.setAllowPlain(false); if (n) console.log(`[sécurité] ${n} fichier(s) existant(s) chiffré(s)`); } catch (e) { console.error('[sécurité] migration impossible :', e.message); process.exit(1); }

// --- serveur ---
const app = express();
app.disable('x-powered-by');
// ancien préfixe /don-cerfa (anciens liens) : accepté et ramené à la racine ; le paiement vit sur don.emounateha.fr
app.use((req, res, next) => { if (req.url === '/don-cerfa' || req.url.startsWith('/don-cerfa/') || req.url.startsWith('/don-cerfa?')) req.url = req.url.slice(10) || '/'; next(); });
if (process.env.VERCEL) { app.set('trust proxy', true); app.use(require('./store')({ DATA, RECUS })); }   // Vercel : données dans Postgres (voir store.js)
// --- accès : l'ordinateur local a tous les droits ; via le tunnel HTTPS (*.trycloudflare.com) seule la page de don est ouverte ---
const hits = new Map();
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (!process.env.VERCEL && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && !req.headers['cf-connecting-ip']) return next();          // ordinateur local
  if (!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(host) && !(process.env.VERCEL && /\.vercel\.app$/i.test(host)) && host !== process.env.PUBLIC_HOST && host !== 'don.emounateha.fr') return res.status(403).type('text').send('Hôte non autorisé');   // rien d'autre n'entre
  if (req.path.startsWith('/backoffice') || req.path === '/api/recu') return res.status(403).type('text').send("Réservé à l'ordinateur local");
  if (req.path === '/api/vu') return next();                                                                             // mesure d'audience : hors limite (un signe de vie toutes les 30 s)
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {                                        // limite : 30 envois (60 modifications de profil) / 10 min / visiteur
    const post = req.method === 'POST', ip = (post ? '' : 'm|') + String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip).split(',')[0].trim(), now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 600000);
    if (arr.length >= (post ? 30 : 60)) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes.' });
    arr.push(now); hits.set(ip, arr);
  }
  next();
});
// --- en-têtes de sécurité (navigateur) ---
const STRIPE_H = 'https://*.stripe.com https://*.stripe.network https://*.stripecdn.com https://*.hcaptcha.com https://hcaptcha.com';
const CSP = ["default-src 'self'", `script-src 'self' 'unsafe-inline' ${STRIPE_H} https://pay.google.com`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:", `connect-src 'self' ${STRIPE_H} https://fonts.googleapis.com https://data.geopf.fr https://www.hebcal.com https://pay.google.com https://www.emounateha.fr`, `frame-src ${STRIPE_H} https://pay.google.com`,
  "media-src 'self' https:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self' https://www.emounateha.fr https://emounateha.fr" + (process.env.VERCEL ? '' : ' http://127.0.0.1:* http://localhost:*')].join('; ');   // la page de don peut s'ouvrir dans la petite fenêtre de la page Torah, et nulle part ailleurs
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff');   // (anti-clickjacking : frame-ancestors ci-dessus, plus strict que X-Frame-Options)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (/https/i.test(String(req.headers['x-forwarded-proto'] || ''))) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
// --- une page d'un autre site ne peut rien envoyer (anti-CSRF) : toute requête qui modifie quelque chose doit venir de ce site ---
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path === '/webhook' || req.path === '/api/vu') return next();   // le webhook est protégé par la signature Stripe ; /api/vu ne modifie rien ici
  const o = req.headers.origin; if (!o) return next();
  try { const h = new URL(o).host; if (h === req.headers.host || ('don.emounateha.fr,www.emounateha.fr,emounateha.fr,' + (process.env.ALLOWED_ORIGIN_HOSTS || '')).split(',').map(x => x.trim()).includes(h)) return next(); } catch (e) {}
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
        const out = await fabriquer({ type: m.type === 'entreprise' ? 'entreprise' : 'particulier', nom: cu.name, siren: m.siren || '', adresse: `${ad.line1 || ''}, ${ad.postal_code || ''} ${ad.city || ''}`, email: cu.email, montant: inv.amount_paid, mensuel: true, nb: m.nb ? +m.nb : 0, echeance: n,
          mode: 'Carte bancaire — don mensuel, échéance n°' + n, dateDon: new Date((inv.status_transitions.paid_at || inv.created) * 1000).toISOString(), affectation: m.affectation }, { envoyerEmail: m.envoi === '1' });
        out.affectation = m.affectation; out.mensuel = true; if (m.fin) out.fin = m.fin; if (m.nb) { out.nb = +m.nb; out.total = +m.total; } { const a = attrDe(m); if (Object.keys(a).length) { out.attr = a; out.attrRepeat = true; } }   // prélèvement suivant : même provenance que le 1er don
        if (m.ambassadeur) out.ambassadeur = m.ambassadeur;
        if (m.proche) { const pr = acc.prochesDe((load().users || {})[String(cu.email || '').toLowerCase()]).find(x => x.id === m.proche); out.proche = m.proche; if (pr && !pr.supprime && pr.lien) out.vuPar = pr.lien; }   // don mensuel au nom d'un proche relié
        const d2 = load(); d2.receipts[inv.id] = out; save(d2); await notifyAdmin(out);
        console.log('[webhook] invoice.paid', inv.id, '-> reçu', out.numero, '(mensualité n°' + n + ')');
      }
    } else console.log('[webhook]', ev.type, '(non traité)');
    res.json({ received: true });
  } catch (e) { console.error('[webhook] erreur', e.message); res.status(500).send('erreur'); }   // Stripe réessaiera plus tard
});
// Mesure d'audience (onglet Trafic du CRM) : la visite est relayée au site principal, signée, avec l'adresse du visiteur
// (qui n'y est jamais enregistrée : elle sert seulement à ne compter chaque visiteur qu'une fois par jour).
app.post('/api/vu', express.text({ type: () => true, limit: '2kb' }), async (req, res) => {
  try {
    let b = {}; try { b = JSON.parse(typeof req.body === 'string' ? req.body : '{}') || {}; } catch (e) {}
    const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(), ts = Date.now();
    await fetch(SITE + '/api/vu', { method: 'POST', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'text/plain', 'user-agent': String(req.headers['user-agent'] || ''), 'x-vu-ip': ip, 'x-vu-ts': String(ts), 'x-vu-sig': crypto.createHmac('sha256', cerfaKey()).update('vu|' + ts + '|' + ip).digest('hex') },
      body: JSON.stringify({ p: String(b.p || '/').slice(0, 120), r: String(b.r || '').slice(0, 300), h: b.h ? 1 : 0, s: 'don.emounateha.fr' }) });
  } catch (e) { /* le comptage ne doit jamais gêner la page */ }
  res.status(204).end();
});
app.use(express.json({ limit: '50kb' }));
acc.mount(app);                                   // /api/auth/*, /api/me*, /recus/:fichier (liens signés)
// fichier de vérification Apple Pay (Apple le réclame à la racine du domaine, dans .well-known)
app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'apple-pay', 'apple-developer-merchantid-domain-association')));
app.use((req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
// simulation de date (test) : ?date=2027-02-01, seulement depuis l'ordinateur local, jamais via le tunnel
const simDate = req => { const l = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') && !req.headers['cf-connecting-ip']; const d = String(req.query.date || ''); return l && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00') : new Date(); };
app.get('/api/config', async (req, res) => res.json({ live: LIVE, paypal: true, klarna: true, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', stripe: !!stripe, asso: { nom: ASSO.nom }, smtp: !!process.env.SMTP_HOST, modes: MODES.slice(0, 3), affectations: await affectations(simDate(req)) }));

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

// Provenance du don (e-mail de campagne) : c = campagne, t = modèle d'e-mail, s = envoi précis, src / med = source et canal.
// Rien de personnel : seulement des identifiants courts. Ils partent dans les métadonnées Stripe (paiement, abonnement, client) et sur le reçu.
const cleanAttr = a => { const o = {}; if (a && typeof a === 'object') for (const [k, mx] of [['c', 60], ['t', 60], ['s', 60], ['src', 30], ['med', 30]]) { const v = String(a[k] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, mx); if (v) o[k] = v; } return o; };
const attrMeta = a => ({ ...(a.src ? { utm_source: a.src } : {}), ...(a.med ? { utm_medium: a.med } : {}), ...(a.c ? { utm_campaign: a.c } : {}), ...(a.t ? { utm_content: a.t } : {}), ...(a.s ? { email_send: a.s } : {}) });
const attrDe = m => cleanAttr({ src: m.utm_source, med: m.utm_medium, c: m.utm_campaign, t: m.utm_content, s: m.email_send });
app.post('/api/intent', async (req, res) => {
  try {
    if (!stripe) throw new Error('Stripe non configuré (.env)');
    const fete = await lignesFete(req.body); if (fete) req.body.montant = fete.total / 100;   // le total est recalculé ici ; le don d'une fête / action peut aussi être mensuel ou réparti en plusieurs fois
    const sess = acc.getSession(req); let proche = null;
    if (req.body.procheId) {
      if (!sess) throw new Error("Connectez-vous pour faire un don au nom d'une autre personne.");
      proche = acc.procheDe(sess.email, String(req.body.procheId)); if (!proche) throw new Error('Profil introuvable. Rechargez la page.');
      Object.assign(req.body, { type: 'particulier', raisonSociale: '', siren: '', prenom: proche.prenom, nom: proche.nom, adresse: proche.adresse, cp: proche.cp, ville: proche.ville, tel: proche.tel || '', email: sess.email });
    }
    const don = validerDonateur(req.body);
    if (proche) { don.proche = proche.id; don.accordAt = proche.accordAt || null; don.form.emailProfil = proche.email; }
    if (sess) don.email = sess.email;                       // connecté : le reçu est rattaché au compte (et envoyé à l'email maître)
    const mensuel = req.body.frequence === 'mensuel';
    let besoin = null;   // mini-cagnotte : don.emounateha.fr/besoin/<slug> (créée dans le CRM)
    if (req.body.besoin) {
      besoin = await besoinInfo(String(req.body.besoin));
      if (!besoin || !besoin.actif) throw new Error("Cette cagnotte n'est plus ouverte aux dons.");
      if (mensuel) throw new Error('Une cagnotte reçoit uniquement des dons ponctuels.');
    }
    const aff = besoin ? ('Besoin : ' + besoin.titre).slice(0, 78) : fete ? fete.affectation : affectation(req.body, await affectationsOk());
    let amb = String(req.body.amb || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);   // lien d'ambassadeur
    if (!amb) { // donateur déjà venu par un ambassadeur : il lui reste attribué, en permanence
      const em = String(don.email || '').toLowerCase(), prev = Object.values(load().receipts || {}).filter(r => r.ambassadeur && r.donorEmail === em).sort((a, b) => String(a.dateDon).localeCompare(String(b.dateDon)))[0];
      if (prev) amb = prev.ambassadeur;
    }
    const attr = cleanAttr(req.body.attr);
    let fin = '';                                            // don mensuel « jusqu'à une date » (vide = sans limite de durée)
    const mois = mensuel ? parseInt(req.body.duree, 10) : 0;   // durée choisie : 12 ou 24 mois (N prélèvements) ; sinon sans limite
    if (mois) {
      if (![12, 24].includes(mois)) throw new Error('Durée du don mensuel invalide.');
      const t0 = new Date(Date.now() + 3600000), mm = t0.getUTCMonth() + mois, dernier = new Date(Date.UTC(t0.getUTCFullYear(), mm + 1, 0)).getUTCDate();   // jour du (N+1)e prélèvement (fin de mois : Stripe prend le dernier jour du mois)
      const f = new Date(Date.UTC(t0.getUTCFullYear(), mm, Math.min(t0.getUTCDate(), dernier))); f.setUTCDate(f.getUTCDate() - 1);   // la veille : exactement N prélèvements
      fin = f.toISOString().slice(0, 10);
    } else if (mensuel && req.body.duree === 'date') {
      fin = String(req.body.finDate || '');
      const t = /^\d{4}-\d{2}-\d{2}$/.test(fin) ? Date.parse(fin + 'T23:59:59Z') : NaN, now = Date.now();
      if (isNaN(t) || t < now + 32 * 86400000) throw new Error('Choisissez une date de fin au moins un mois après aujourd\'hui.');
      if (t > now + 10 * 365 * 86400000) throw new Error('La date de fin ne peut pas dépasser 10 ans.');
    }
    // « Don en plusieurs fois » : le montant saisi est un TOTAL réparti sur N mensualités (le reste des centimes est ajouté au 1er prélèvement)
    let nb = 0, total = 0, par = don.montant, reste = 0;
    if (mensuel && mois && req.body.repartition === 'total') {
      nb = mois; total = don.montant; par = Math.floor(total / nb); reste = total - par * nb;
      if (par < 100) throw new Error('Mensualité trop faible (au moins 1 € par mois) : choisissez une durée plus courte.');
      don.montant = par + reste;   // montant du 1er prélèvement
    }
    const meta = { type: don.type, donateur: don.nom.slice(0, 100), ville: don.ville.slice(0, 60), affectation: aff.slice(0, 80), frequence: mensuel ? 'mensuel' : 'ponctuel', ambassadeur: amb, ...(besoin ? { besoin: besoin.slug } : {}), ...(fin ? { fin } : {}), ...attrMeta(attr) };
    // libellé visible dans Stripe, sur chaque paiement : à quoi le don est destiné (action, fête, « là où le besoin est le plus grand », ou la cagnotte)
    const libelle = (`Don ${mensuel ? (nb ? 'en ' + nb + ' fois ' : 'mensuel ') : ''}${ASSO.nom}${T} — ` + (besoin ? 'Besoin : ' + besoin.titre + ' (' + besoin.slug + ')' : aff)).slice(0, 240);
    let id, clientSecret, subscription = null;
    if (mensuel) {
      const cust = await stripe.customers.create({ email: don.email, name: don.nom, address: { line1: don.adresse.split(',')[0], postal_code: (don.adresse.match(/\b\d{5}\b/) || [''])[0], city: don.ville, country: 'FR' }, metadata: meta });
      const prod = await stripe.products.create({ name: `${nb ? 'Don en ' + nb + ' fois' : 'Don mensuel'} ${ASSO.nom}${T}` });
      const sub = await stripe.subscriptions.create({ customer: cust.id, description: libelle, payment_behavior: 'default_incomplete', payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
        items: [{ price_data: { currency: 'eur', unit_amount: par, recurring: { interval: 'month' }, product: prod.id } }],
        ...(reste ? { add_invoice_items: [{ price_data: { currency: 'eur', unit_amount: reste, product: prod.id } }] } : {}),
        ...(fin ? { cancel_at: Math.floor(Date.parse(fin + 'T23:59:59Z') / 1000) } : {}),   // Stripe arrête les prélèvements à cette date
        metadata: { ...meta, ...(nb ? { nb: String(nb), total: String(total) } : {}), siren: don.siren || '', envoi: req.body.envoyerEmail ? '1' : '0', ...(don.proche ? { proche: don.proche } : {}) }, expand: ['latest_invoice.payment_intent'] });
      const pi = sub.latest_invoice.payment_intent; id = pi.id; clientSecret = pi.client_secret; subscription = sub.id;
    } else {
      // don ponctuel : carte (Apple Pay et Google Pay passent par la carte), PayPal et Klarna ; si un moyen n'est pas activé sur le compte Stripe, on retire les moyens en trop (jamais la carte)
      const envT = (process.env.PAYMENT_METHODS || 'card').split(',').map(x => x.trim()).filter(Boolean), base = { amount: don.montant, currency: 'eur', description: libelle, metadata: meta };
      const essais = [[...new Set([...envT, 'card', 'paypal', 'klarna'])], [...new Set([...envT, 'card', 'paypal'])], ['card']];
      let pi, derniere;
      for (const types of essais) { try { pi = await stripe.paymentIntents.create({ ...base, payment_method_types: types }); break; } catch (e) { derniere = e; console.error('[intent] moyens', types.join('+'), 'refusés :', e.message); } }
      if (!pi) throw derniere;
      id = pi.id; clientSecret = pi.client_secret;
    }
    const d = load(); for (const [k, v] of Object.entries(d.pending)) if (Date.now() - (v.at || 0) > 3 * 86400000) delete d.pending[k];   // paiements jamais terminés : effacés après 3 jours
    d.pending[id] = { ...don, amb, besoin: besoin ? besoin.slug : '', besoinNom: !!(besoin && req.body.afficherNom === true), envoyerEmail: !!req.body.envoyerEmail, affectation: aff, mensuel, subscription, fin, nb, total, attr, lignes: fete && !mensuel ? fete.lignes : null, owner: sess ? sess.email : null, saveProfile: !!(sess && req.body.saveProfile && !proche), at: Date.now() }; save(d);
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
    const pi = await stripe.paymentIntents.retrieve(id, { expand: ['payment_method'] });
    const pm = pi.payment_method || {}, wal = pm.card && pm.card.wallet && pm.card.wallet.type;
    const moyen = pm.type === 'paypal' ? 'PayPal' : pm.type === 'klarna' ? 'Klarna' : wal === 'apple_pay' ? 'Carte bancaire (Apple Pay)' : wal === 'google_pay' ? 'Carte bancaire (Google Pay)' : 'Carte bancaire';
    if (pi.status !== 'succeeded') throw new Error(`Paiement non abouti (statut : ${pi.status})`);
    if (pi.amount !== p.montant) throw new Error('Montant incohérent');
    const out = await fabriquer({ ...p, echeance: 1, mode: moyen + (p.mensuel ? ' — don mensuel, 1re échéance' : ''), dateDon: new Date(pi.created * 1000).toISOString() }, { envoyerEmail: p.envoyerEmail });
    out.affectation = p.affectation; out.mensuel = !!p.mensuel; if (p.fin) out.fin = p.fin; if (p.nb) { out.nb = p.nb; out.total = p.total; } if (p.attr && Object.keys(p.attr).length) out.attr = p.attr; if (p.amb) out.ambassadeur = p.amb; if (p.besoin) { out.besoin = p.besoin; if (p.besoinNom) out.besoinNom = true; }   // cagnotte : le nom n'est public que si le donateur l'a demandé
    if (p.lignes) out.lignes = p.lignes;
    const d2 = load(); d2.receipts[id] = out; delete d2.pending[id];
    if (out.proche && p.owner) { const pr = acc.prochesDe((d2.users || {})[p.owner]).find(x => x.id === out.proche); if (pr && !pr.supprime && pr.lien) out.vuPar = pr.lien; }
    acc.relier(d2); save(d2);   // proche relié : le reçu devient visible dans son espace
    await notifyAdmin(out);
    if (p.owner && p.saveProfile && !p.proche) acc.saveProfileFromForm(p.owner, p.type, p.form);   // « enregistrer mes informations »
    return out;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job); return job;
}
// espace donateur : dons mensuels en cours, et possibilité de les interrompre (seul le titulaire connecté, vérifié par code email, y accède)
async function abonnementsDe(email) {
  const out = [], custs = (await stripe.customers.list({ email, limit: 100 })).data.filter(c => String(c.email || '').toLowerCase() === email);
  for (const c of custs) for (const s of (await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 100 })).data) {
    if (!['active', 'trialing', 'past_due', 'unpaid'].includes(s.status) || (s.metadata || {}).frequence !== 'mensuel') continue;
    const it = (s.items && s.items.data[0]) || {}, fin = s.cancel_at || null, suiv = it.current_period_end || s.current_period_end || null;
    out.push({ id: s.id, montant: it.price ? it.price.unit_amount : 0, affectation: (s.metadata || {}).affectation || '', nb: +(s.metadata || {}).nb || 0, total: +(s.metadata || {}).total || 0, depuis: s.start_date * 1000, prochain: suiv && (!fin || suiv < fin) ? suiv * 1000 : null, fin: fin ? fin * 1000 : null, retard: s.status !== 'active' && s.status !== 'trialing' });
  }
  return out.sort((a, b) => b.depuis - a.depuis);
}
app.get('/api/me/dons-mensuels', async (req, res) => {
  try { const s = acc.getSession(req); if (!s) return res.status(401).json({ error: 'Connexion requise' }); if (!stripe) return res.json({ dons: [] });
    res.json({ dons: await abonnementsDe(String(s.email).toLowerCase()) });
  } catch (e) { console.error('[dons mensuels]', e.message); res.status(500).json({ error: 'Impossible de charger vos dons mensuels pour le moment.' }); }
});
app.post('/api/me/dons-mensuels/:id/arreter', async (req, res) => {
  try { const s = acc.getSession(req); if (!s) return res.status(401).json({ error: 'Connexion requise' }); if (!stripe) throw new Error('Stripe non configuré');
    const id = String(req.params.id); if (!/^sub_[A-Za-z0-9]+$/.test(id)) throw new Error('Don mensuel inconnu');
    if (!(await abonnementsDe(String(s.email).toLowerCase())).some(x => x.id === id)) return res.status(404).json({ error: 'Don mensuel introuvable' });   // il doit appartenir à la personne connectée
    await stripe.subscriptions.cancel(id);
    console.log('[don mensuel] arrêté par le donateur', id);
    res.json({ ok: true, dons: await abonnementsDe(String(s.email).toLowerCase()) });
  } catch (e) { console.error('[dons mensuels] arrêt', e.message); res.status(400).json({ error: e.message }); }
});
// « Corriger ce reçu » (espace donateur) : l'ancien reçu est annulé, un nouveau (nouveau numéro, mention « annule et remplace ») est créé
// et envoyé à l'email maître. Le montant, la date et le mode de paiement ne changent jamais. Le profil est corrigé pour les prochains dons.
async function alerteAdmin(subject, lignes) { try { await mailer.send({ to: mailer.ADMIN_EMAIL(), toName: 'Administrateur', subject: (PREFIX === 'TEST' ? '[TEST] ' : '') + subject, text: lignes.join('\n'), html: lignes.map(l => '<p>' + esc(l) + '</p>').join('') }); } catch (e) { console.error('[alerte]', e.message); } }
const corrEnCours = new Set();
app.post('/api/me/receipts/:ref/corriger', async (req, res) => {
  const ref = String(req.params.ref); let verrou = false;
  try {
    const s = acc.getSession(req); if (!s) return res.status(401).json({ error: 'Connexion requise' });
    const d = load(), r = (d.receipts || {})[ref];
    if (!r || r.donorEmail !== s.email || !r.file || !r.form) return res.status(404).json({ error: 'Reçu introuvable' });
    const non = acc.nonCorrigeable(r); if (non) throw new Error(non);
    if (corrEnCours.has(ref)) throw new Error('Correction déjà en cours pour ce reçu.'); corrEnCours.add(ref); verrou = true;
    const b = req.body.data || {}, u = acc.ensureUser(d, s.email), ent = r.type === 'entreprise';
    let f, emailProfil = '', nomChange = false, maj = () => {};   // maj : correction du profil, appliquée seulement une fois le nouveau reçu créé
    if (r.proche) {
      const p = acc.prochesDe(u).find(x => x.id === r.proche && !x.supprime); if (!p) throw new Error("Ce profil a été supprimé de votre compte : le reçu ne peut plus être corrigé en ligne. Contactez l'association.");
      if (p.lien && p.partage) f = { prenom: p.prenom, nom: p.nom, adresse: p.adresse, cp: p.cp, ville: p.ville, tel: p.tel || '', email: p.email };   // profil relié : seules les informations actuelles de la personne sont reprises
      else {
        f = acc.cleanProche(b);
        nomChange = acc.normTxt(f.prenom) !== acc.normTxt(r.form.prenom) || acc.normTxt(f.nom) !== acc.normTxt(r.form.nom);
        if (nomChange && req.body.accord !== true) throw new Error("Le nom change : cochez la case, la personne doit être d'accord pour qu'un reçu fiscal soit établi à son nom.");
        if (acc.prochesDe(u).some(x => !x.supprime && x !== p && acc.idt(x, x.email) === acc.idt(f, f.email))) throw new Error('Un autre profil de votre compte porte déjà exactement ces informations.');
        maj = (u2) => { const q = acc.prochesDe(u2).find(x => x.id === r.proche); if (!q) return; if (!acc.memePersonne(q, f)) { q.lien = null; q.partage = false; } Object.assign(q, f); if (nomChange) q.accordAt = Date.now(); q.modifAt = Date.now(); };   // le lien est réévalué ensuite (relier)
      }
      emailProfil = f.email;
    } else {
      f = acc.cleanProfile(ent ? 'pro' : 'particulier', b);
      if (ent && !f.siren) throw new Error('SIREN requis pour un reçu professionnel');
      nomChange = ent ? acc.normTxt(f.raisonSociale) !== acc.normTxt(r.form.raisonSociale) : (acc.normTxt(f.prenom) !== acc.normTxt(r.form.prenom) || acc.normTxt(f.nom) !== acc.normTxt(r.form.nom));
      const t0 = (u.profiles || {}).particulier, sien = ent ? true : !!(t0 && acc.normTxt(t0.prenom) === acc.normTxt(r.form.prenom) && acc.normTxt(t0.nom) === acc.normTxt(r.form.nom));
      if (!nomChange && sien) maj = (u2, d2) => {   // c'est bien le reçu du titulaire (ou de sa société) et le nom ne change pas : son profil est corrigé pour les prochains dons
        const last = u2.last, pf = { ...f }, t = (u2.profiles || {}).particulier; if (!ent && !pf.tel && t && t.tel) pf.tel = t.tel;
        acc.poserProfil(u2, ent ? 'pro' : 'particulier', pf); u2.last = last; if (!ent) acc.propager(d2, s.email);
      };
    }
    const form = { prenom: f.prenom || '', nom: f.nom || '', raisonSociale: f.raisonSociale || '', siren: f.siren || '', adresse: f.adresse, cp: f.cp, ville: f.ville, tel: f.tel || '', ...(emailProfil ? { emailProfil } : {}) };
    const cle = x => (ent ? ['raisonSociale', 'siren', 'adresse', 'cp', 'ville'] : ['prenom', 'nom', 'adresse', 'cp', 'ville']).map(k => String(x[k] || '')).join('|');
    if (cle(form) === cle(r.form)) {   // rien de ce qui est imprimé sur le reçu ne change
      if (!(r.proche && (form.tel !== (r.form.tel || '') || emailProfil !== (r.form.emailProfil || '')))) throw new Error('Aucune modification : le reçu porte déjà ces informations.');
      maj(u, d); r.form = { ...r.form, tel: form.tel, emailProfil }; delete r.vuPar; acc.relier(d); save(d);   // seuls l'email ou le téléphone de la personne changent : pas de nouveau reçu, le profil est corrigé
      return res.json({ ok: true, profilSeul: true });
    }
    const don = { type: r.type, nom: ent ? form.raisonSociale : form.prenom + ' ' + form.nom.toUpperCase(), siren: ent ? form.siren : '', adresse: `${form.adresse}, ${form.cp} ${form.ville}`, ville: form.ville, email: s.email, montant: r.montant, mode: r.mode, dateDon: r.dateDon, affectation: r.affectation, mensuel: r.mensuel, echeance: r.echeance, nb: r.nb, form, remplace: r.numero, proche: r.proche, accordAt: r.accordAt };
    const out = await fabriquer(don, { envoyerEmail: true });
    const d2 = load(), cur = d2.receipts[ref], ancien = { numero: cur.numero, file: cur.file, nom: cur.nom, form: cur.form, at: Date.now() };
    Object.assign(cur, { numero: out.numero, pdf: out.pdf, file: out.file, nom: out.nom, form: out.form, email: out.email, remplace: ancien.numero, corrections: [...(cur.corrections || []), ancien] });
    if (nomChange && r.proche) cur.accordAt = Date.now();
    maj(acc.ensureUser(d2, s.email), d2); delete cur.vuPar; acc.relier(d2); save(d2);
    console.log('[correction] reçu', ancien.numero, '->', out.numero, nomChange ? '(nom changé)' : '');
    await alerteAdmin(`Reçu fiscal corrigé par le donateur : ${ancien.numero} → ${out.numero}${nomChange ? ' (NOM CHANGÉ)' : ''}`, [`Compte : ${s.email}`, `Ancien reçu ${ancien.numero} (annulé) : ${ancien.nom}, ${[ancien.form.adresse, ancien.form.cp, ancien.form.ville].join(' ')}`, `Nouveau reçu ${out.numero} : ${out.nom}, ${[form.adresse, form.cp, form.ville].join(' ')}`, `Montant et date inchangés : ${(r.montant / 100).toFixed(2)} €, ${String(r.dateDon).slice(0, 10)}`, nomChange ? 'Attention : le nom du bénéficiaire du reçu a changé. À vérifier.' : 'Correction simple (même nom).']);
    res.json({ ok: true, numero: out.numero, remplace: ancien.numero, email: out.email && out.email.sent ? true : false });
  } catch (e) { res.status(400).json({ error: e.message }); } finally { if (verrou) corrEnCours.delete(ref); }
});
app.post('/api/finalize', async (req, res) => {
  try {
    if (!stripe) throw new Error('Stripe non configuré');
    const id = String(req.body.id || ''); if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new Error('Paiement inconnu');
    res.json(acc.publicReceipt(await receiptForPayment(id)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// 3) reçu SANS paiement (virement, chèque, espèces déjà reçus)
// --- CRM (onglet CERFA) : liste des reçus, reçus manuels (virement, chèque, espèces), PDF. Réservé au serveur du site :
// requête signée HMAC (clé dérivée de CERFA_SECRET, sinon de DATABASE_URL, commune aux deux projets), valable 5 minutes.
const cerfaKey = () => crypto.createHash('sha256').update('emounateha-cerfa|' + (process.env.CERFA_SECRET || process.env.DATABASE_URL || '')).digest();
function adminOk(req, res) {
  const ts = Number(req.headers['x-cerfa-ts'] || 0), sig = String(req.headers['x-cerfa-sig'] || '');
  const ok = (process.env.CERFA_SECRET || process.env.DATABASE_URL) && Math.abs(Date.now() - ts) < 300000 && /^[0-9a-f]{64}$/.test(sig)
    && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), crypto.createHmac('sha256', cerfaKey()).update(ts + '|' + req.method + '|' + req.path).digest());
  if (!ok) res.status(401).json({ error: 'non autorisé' });
  return !!ok;
}
const ligneRecu = (r, ref, source) => ({ ref, source, numero: r.numero, nom: r.nom, type: r.type, adresse: r.adresse || '', prenom: (r.form && r.form.prenom) || '', nomFamille: (r.form && r.form.nom) || '', cp: (r.form && r.form.cp) || '', ville: r.ville || (r.form && r.form.ville) || '', siren: r.siren || '', montant: r.montant, mode: r.mode, dateDon: r.dateDon, email: r.donorEmail, tel: r.tel || '', affectation: r.affectation || '', ambassadeur: r.ambassadeur || '', besoin: r.besoin || '', file: r.file, emailEnvoye: !!(r.email && r.email.sent), creeLe: r.creeLe || null, envois: (r.mails || []).length || (r.email && !r.email.skipped ? 1 : 0),
  mail: r.email && !r.email.skipped ? { sent: !!r.email.sent, messageId: r.email.messageId || '', at: r.email.at || null, to: r.email.to || r.donorEmail || '', error: r.email.error || '', note: r.email.note || '', brevo: !!r.email.brevo, par: r.email.par || 'auto' } : null, mensuel: !!r.mensuel, echeance: r.echeance || null, attr: r.attr || null, attrRepeat: !!r.attrRepeat, remplace: r.remplace || '', annules: (r.corrections || []).map(c => c.numero), pourProche: !!r.proche });
const ordreNum = n => { const m = String(n || '').match(/(\d{4})\D+(\d+)$/); return (/^TEST/i.test(String(n || '')) ? 0 : 1e12) + (m ? +m[1] * 1e6 + +m[2] : 0); };
const trouverRecu = (d, ref) => { for (const coll of ['receipts', 'manuels']) if (d[coll] && Object.prototype.hasOwnProperty.call(d[coll], ref)) return d[coll][ref]; return null; };
const mailDuRecu = r => mailer.donEmail({ prenom: r.type === 'entreprise' ? '' : (r.form && r.form.prenom) || '', montant: r.montant, dateDon: r.dateDon, affectation: r.affectation, mode: String(r.mode || '').replace(/^Carte bancaire \(Stripe, test\)/, 'Paiement en ligne'), numero: r.numero, mensuel: r.mensuel, echeance: r.echeance, remplace: r.remplace || '',
  spaceUrl: process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') + '/espace/' : '', test: PREFIX === 'TEST' });
// CRM : (r)envoyer le reçu par e-mail au donateur, avec trace de l'envoi
app.post('/api/admin/renvoyer', async (req, res) => {
  if (!adminOk(req, res)) return;
  try {
    const ref = String(req.body.ref || ''), r = trouverRecu(load(), ref); if (!r) throw new Error('Reçu introuvable');
    const to = String(req.body.email || r.donorEmail || '').trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Adresse e-mail invalide');
    let out; try { out = await envoyer({ to, numero: r.numero, pdfFile: path.join(RECUS, path.basename(r.file)), nom: r.nom, affectation: r.affectation, mensuel: r.mensuel, don: r }); } catch (e) { out = { error: e.message }; }
    const trace = { ...out, at: new Date().toISOString(), to, par: 'crm' };
    const d = load(), r2 = trouverRecu(d, ref); if (!r2) throw new Error('Reçu introuvable');
    r2.mails = [...(r2.mails || (r2.email && !r2.email.skipped ? [r2.email] : [])), trace]; r2.email = trace; if (!r2.donorEmail) r2.donorEmail = to; save(d);
    if (!out.sent) throw new Error(out.error || out.note || "L'e-mail n'a pas pu être envoyé");
    res.json({ ok: true, mail: trace });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// CRM : ce que le donateur reçoit (même modèle que l'envoi, reconstitué) + historique des envois de ce reçu
app.get('/api/admin/mail', async (req, res) => {
  if (!adminOk(req, res)) return;
  try {
    const r = trouverRecu(load(), String(req.query.ref || '')); if (!r) throw new Error('Reçu introuvable');
    const m = await mailDuRecu(r);
    res.json({ numero: r.numero, sujet: m ? m.subject : '', html: m ? m.html : '', piece: `Recu-fiscal-${nomFichier(r.numero)}.pdf`, envois: (r.mails || (r.email && !r.email.skipped ? [r.email] : [])).map(x => ({ at: x.at || null, to: x.to || r.donorEmail || '', sent: !!x.sent, messageId: x.messageId || '', error: x.error || '', note: x.note || '', par: x.par || 'auto' })) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/recus', (req, res) => {
  if (!adminOk(req, res)) return;
  const d = load();
  const recus = [...Object.entries(d.receipts || {}).map(([k, r]) => ligneRecu(r, k, 'en ligne')), ...Object.entries(d.manuels || {}).map(([k, r]) => ligneRecu(r, k, 'manuel'))]
    .sort((a, b) => ordreNum(b.numero) - ordreNum(a.numero) || String(b.creeLe || b.dateDon).localeCompare(String(a.creeLe || a.dateDon)));   // ordre de création = ordre des numéros (le plus récent en premier)
  res.json({ recus, modes: MODES.slice(0, 3) });
});
// suppression de reçus (uniquement les reçus de TEST, ou une liste précise de numéros TEST-…) : CRM → Dons
app.post('/api/admin/supprimer', (req, res) => {
  if (!adminOk(req, res)) return;
  const asked = Array.isArray(req.body.numeros) ? req.body.numeros.map(String) : null;
  const vise = n => /^TEST-/i.test(String(n || '')) && (!asked || asked.includes(String(n)));
  const d = load(), supprimes = [];
  for (const coll of ['receipts', 'manuels']) for (const [k, r] of Object.entries(d[coll] || {})) if (vise(r.numero)) {
    supprimes.push(r.numero); delete d[coll][k];
    if (r.file) { try { fs.unlinkSync(path.join(RECUS, path.basename(r.file))); } catch (e) {} }
  }
  if (supprimes.length) save(d);
  res.json({ ok: true, supprimes });
});
app.post('/api/admin/recu', async (req, res) => {
  if (!adminOk(req, res)) return;
  try {
    const don = validerDonateur(req.body);
    const mode = MODES.slice(0, 3).includes(req.body.mode) ? req.body.mode : null; if (!mode) throw new Error('Mode de versement invalide (virement, chèque ou espèces)');
    const dt = new Date(String(req.body.dateDon) + 'T12:00:00'); if (isNaN(dt) || String(req.body.dateDon) > new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })) throw new Error('Date du don invalide (pas dans le futur)');
    if (dt.getFullYear() < new Date().getFullYear() - 1) throw new Error('Date trop ancienne (année en cours ou précédente)');
    const aff = req.body.affectation ? affectation(req.body, await affectationsOk()) : '';   // reçu manuel : sans affectation
    const out = await fabriquer({ ...don, mode, dateDon: dt.toISOString(), affectation: aff }, { envoyerEmail: !!req.body.envoyerEmail });
    out.tel = clean(req.body.tel, 30); out.affectation = aff; out.manuel = true;
    const d = load(); d.manuels = d.manuels || {}; d.manuels['m_' + out.numero] = out; save(d);
    res.json({ ok: true, numero: out.numero, file: out.file, email: out.email });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/pdf', (req, res) => {
  if (!adminOk(req, res)) return;
  const f = path.basename(String(req.query.f || '')), p = path.join(RECUS, f);
  if (!/^recu_[\w-]+\.pdf$/.test(f) || !fs.existsSync(p)) return res.status(404).json({ error: 'PDF introuvable' });
  res.type('application/pdf').send(vault.readFile(p));
});
app.post('/api/recu', async (req, res) => {
  try {
    const don = validerDonateur(req.body);
    const mode = MODES.slice(0, 3).includes(req.body.mode) ? req.body.mode : null; if (!mode) throw new Error('Mode de versement invalide');
    const dt = new Date(String(req.body.dateDon) + 'T12:00:00'); if (isNaN(dt) || String(req.body.dateDon) > new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })) throw new Error('Date du don invalide (pas dans le futur)');
    if (dt.getFullYear() < new Date().getFullYear() - 1) throw new Error('Date trop ancienne pour cette page de test');
    res.json(acc.publicReceipt(await fabriquer({ ...don, mode, dateDon: dt.toISOString(), affectation: affectation(req.body, await affectationsOk()) }, { envoyerEmail: !!req.body.envoyerEmail })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// (les PDF ne sont plus servis publiquement : voir accounts.js, liens signés ou propriétaire connecté)
const SITE_PUBLIC = path.join(__dirname, '..', 'public');   // css, scripts et images du vrai site
const SITE = process.env.SITE_URL || (process.env.VERCEL ? 'https://www.emounateha.fr' : 'http://127.0.0.1:3000');                       // serveur du site local (bandeau Hanouka, date du jour…)
app.get(['/holidays.json', '/diffusion.json', '/api/zmanim', '/api/parasha', '/api/colis-videos', '/api/action-videos'], async (req, res) => {
  try { const r = await fetch(SITE + req.originalUrl); res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(Buffer.from(await r.arrayBuffer())); }
  catch (e) { res.status(502).json({ error: 'Serveur du site local (port 3000) indisponible' }); }
});
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use(express.static(SITE_PUBLIC, { index: false, dotfiles: 'deny' }));
// ---- mini-cagnottes « besoin » : la fiche vient du CRM (site principal), le montant collecté vient des reçus de ce serveur
const besoinCache = new Map();
async function besoinInfo(slug) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const c = besoinCache.get(slug); if (c && Date.now() - c.at < 20000) return c.v;
  let v = c ? c.v : null;
  try { const r = await fetch(SITE + '/api/besoin?slug=' + slug, { signal: AbortSignal.timeout(5000) }); if (r.ok) v = await r.json(); else if (r.status === 404) v = null; } catch (e) { console.error('[besoin]', e.message); }
  if (besoinCache.size > 500) besoinCache.clear();
  besoinCache.set(slug, { at: Date.now(), v }); return v;
}
function besoinFiche(b) {   // ce que la page affiche : la fiche + le total des dons reçus par ce lien
  let collecte = 0, dons = 0; const liste = [];
  for (const r of Object.values(load().receipts || {})) if (r.besoin === b.slug) { collecte += r.montant || 0; dons++; liste.push({ nom: r.besoinNom ? String(r.nom || '').slice(0, 60) : 'Anonyme', montant: r.montant || 0, date: r.dateDon }); }
  liste.sort((x, y) => String(y.date).localeCompare(String(x.date)));   // anonyme par défaut ; le nom n'apparaît que si le donateur a coché « Afficher mon nom »
  return { slug: b.slug, titre: b.titre, description: b.description || '', objectif: b.objectif || null, actif: !!b.actif, collecte, dons, donateurs: liste.slice(0, 40).map(x => ({ nom: x.nom, montant: x.montant })) };
}
app.get('/api/besoin/:slug', async (req, res) => {
  const b = await besoinInfo(String(req.params.slug)); if (!b) return res.status(404).json({ error: 'Cagnotte introuvable' });
  res.setHeader('Cache-Control', 'no-store'); res.json(besoinFiche(b));
});
app.get('/besoin/:slug', async (req, res, next) => {
  const b = await besoinInfo(String(req.params.slug)); if (!b) return res.redirect(302, (process.env.BASE_PATH || '') + '/');
  let html; try { html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'); } catch (e) { return next(); }
  const q = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1https://don.emounateha.fr/besoin/' + b.slug + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + q(b.titre) + ' — Cagnotte Émounatéha$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + q((b.description || 'Participez à cette cagnotte : chaque don compte.').slice(0, 180)) + '$2');
  // la fiche est écrite dans la page : la cagnotte s'affiche tout de suite, sans passer par l'écran de don général (fête en cours, choix d'action…)
  html = html.replace('<body', '<body data-besoin' + (b.actif ? '' : '-off') + '="' + q(JSON.stringify({ slug: b.slug, titre: b.titre, description: b.description || '', objectif: b.objectif || null, actif: !!b.actif, collecte: null, dons: 0 })) + '"');   // le total collecté est demandé ensuite par la page (/api/besoin/<slug>) : cette adresse-ci ne lit pas les reçus   // clôturée : simple message, puis don normal
  res.setHeader('Cache-Control', 'no-store'); res.type('html').send(html);
});
// une adresse par action : don.emounateha.fr/hanouka, /un-toit-sur-la-tete, /reinsertion-sociale, /l-aide-a-la-scolarite… (la page présélectionne l'action)
const slugOf = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' et ').replace(/^l['’]/, 'l-').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function slugsAffectations() {
  const AC = actionsConfig(), s = new Set(fetesConfig().map(f => slugOf(f.titre || f.label)));
  for (const l of AFFECT_BASE) s.add(slugOf((AC[l] && AC[l].titre) || l));
  return s;
}
// aperçu de partage (WhatsApp, Facebook…) propre à chaque adresse : l'image « don-<action> » du dossier public/apercus du site
const APERCU = { 'colis-de-chabbat': 'don-colis', 'l-aide-a-leducation': 'don-l-aide-a-l-education', 'lag-baomer': 'don-lag-ba-omer', 'chavouot': 'don-chavou-ot', 'la-ou-le-besoin-est-le-plus-grand': 'don' };
const TITRES = { 'la-ou-le-besoin-est-le-plus-grand': 'Là où le besoin est le plus grand' };
app.get('/:slug', (req, res, next) => {
  const sl = req.params.slug;
  if (!/^[a-z0-9-]+$/.test(sl) || !slugsAffectations().has(sl)) return next();
  let html; try { html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'); } catch (e) { return next(); }
  const img = 'https://www.emounateha.fr/apercus/' + (APERCU[sl] || 'don-' + sl) + '.jpg?v=1';
  const tit = TITRES[sl] || ((fetesConfig().find(f => slugOf(f.titre || f.label) === sl) || {}).titre) || ((Object.values(actionsConfig()).find(a => slugOf(a.titre || '') === sl) || {}).titre) || '';
  html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + img + '$2').replace(/(<meta name="twitter:image" content=")[^"]*(")/, '$1' + img + '$2')
    .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1https://don.emounateha.fr/' + sl + '/$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + ('Faire un don' + (tit ? ' · ' + tit.replace(/&/g, '&amp;').replace(/"/g, '&quot;') : '') + ' — Émounatéha') + '$2');
  res.setHeader('Cache-Control', 'no-store'); res.type('html').send(html);
});
app.use((err, req, res, next) => { const st = err && err.status >= 400 && err.status < 500 ? err.status : 400; if (!(err && err.status)) console.error('[erreur]', req.method, req.path, err && err.message); if (res.headersSent) return next(err); res.status(st).json({ error: st === 413 ? 'Requête trop volumineuse.' : 'Requête invalide.' }); });
if (!process.env.VERCEL) app.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Test Stripe + CERFA → http://127.0.0.1:${PORT}  (stripe: ${stripe ? 'test OK' : 'non configuré'}, email: ${process.env.SMTP_HOST ? 'SMTP' : 'fichier .eml'})`));
app.locals.remplir = remplir; app.locals.pdf = pdf;
module.exports = app;
