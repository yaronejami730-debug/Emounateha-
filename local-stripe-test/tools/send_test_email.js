/* Envoie un EMAIL DE TEST « merci pour votre don » via Brevo, avec le reçu CERFA en pièce jointe.
   - fait un vrai paiement Stripe de TEST (carte 4242) de 126 € sur le serveur local, récupère le PDF du reçu
   - lit l'expéditeur et la clé Brevo dans les réglages du CRM (base Supabase) ; la clé n'est jamais affichée ni enregistrée
   Usage : node tools/send_test_email.js [adresse]   (par défaut : l'adresse donnée en argument ou DEST_EMAIL) */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const MAIN = process.env.CRM_DIR || '/Users/yarone/Emounateha';                 // dossier du CRM (contient .env avec DATABASE_URL)
const need = m => { try { return require(m); } catch (e) { return require(path.join(MAIN, 'node_modules', m)); } };
const envf = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const crmEnv = Object.fromEntries(fs.readFileSync(path.join(MAIN, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const TO = process.argv[2] || process.env.DEST_EMAIL; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(TO || '')) { console.error('Adresse de destination manquante'); process.exit(1); }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  // 1) paiement de test 126 € + reçu
  const stripe = require('stripe')(envf.STRIPE_SECRET_KEY); const BASE = 'http://127.0.0.1:' + (envf.PORT || 3100);
  const post = async (u, b) => { const r = await fetch(BASE + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(u + ' : ' + j.error); return j; };
  const donor = { type: 'particulier', prenom: 'Yarone', nom: 'Jami', adresse: '12 rue de la Paix', cp: '75002', ville: 'Paris', email: TO, montant: '126', frequence: 'ponctuel', affectation: 'Colis de Chabbat et de fêtes', envoyerEmail: false };
  let rc;
  if (process.env.REUSE) { const d = JSON.parse(require('../vault').readFile(path.join(ROOT, 'data.json')).toString('utf8')); rc = Object.values(d.receipts).filter(r => r.montant === 12600 && !r.mensuel).pop(); if (!rc) throw new Error('Aucun reçu de 126 € à réutiliser'); console.log('reçu réutilisé :', rc.numero); }
  else {
    const it = await post('/api/intent', donor);
    await stripe.paymentIntents.confirm(it.id, { payment_method: 'pm_card_visa', return_url: BASE + '/' });
    rc = await post('/api/finalize', { id: it.id });
  }
  const pdfPath = path.join(ROOT, rc.pdf.replace(/^\//, '')); const pdf = require('../vault').readFile(pdfPath);
  console.log('reçu créé :', rc.numero, '| PDF', Math.round(pdf.length / 1024), 'Ko');

  // 2) réglages Brevo / identité visuelle du CRM (la clé reste en mémoire)
  const { Pool } = need('pg'); const pool = new Pool({ connectionString: crmEnv.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const s = ((await pool.query('select data from public.settings where id = 1')).rows[0] || {}).data || {}; await pool.end();
  if (!s.brevoApiKey || !s.senderEmail) throw new Error('Réglages Brevo incomplets dans le CRM');
  const abase = (s.assetsUrl || s.publicUrl).replace(/\/$/, ''), site = (s.publicUrl || 'https://www.emounateha.fr').replace(/\/$/, '');
  const color = '#1f6a72', accent = '#c4a24a', logoSrc = /^https?:/.test(s.logoUrl || '') ? s.logoUrl : abase + (s.logoUrl || '/logo2.png');
  const pat = `background:#ffffff url('${abase}/bg.png') repeat;`, patAttr = `background="${abase}/bg.png" bgcolor="#ffffff"`;
  const wa = (s.phone || '').replace(/\D/g, '').replace(/^0/, '33');
  const ico = (href, name, alt) => `<a href="${esc(href)}" style="display:inline-block;margin:0 4px;text-decoration:none;"><img src="${abase}/icon-${name}.png" width="26" height="26" alt="${alt}" style="display:inline-block;border:0;"></a>`;
  const icons = [s.instagramUrl && ico(s.instagramUrl, 'instagram', 'Instagram'), s.facebookUrl && ico(s.facebookUrl, 'facebook', 'Facebook'), s.tiktokUrl && ico(s.tiktokUrl, 'tiktok', 'TikTok'), s.youtubeUrl && ico(s.youtubeUrl, 'youtube', 'YouTube'), s.phone && ico('https://wa.me/' + wa, 'whatsapp', 'WhatsApp')].filter(Boolean).join('');
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const row = (k, v, last) => `<tr><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:13px;color:#6b7d80;width:42%;">${k}</td><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:15px;color:#14272a;font-weight:600;text-align:right;">${v}</td></tr>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Merci pour votre don</title>
<style>:root{color-scheme:light only}.he{font-family:'Frank Ruhl Libre','David',serif !important}@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important}.pad{padding-left:18px !important;padding-right:18px !important}.big{font-size:40px !important}}</style></head>
<body bgcolor="#eef2f1" style="margin:0;padding:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">Votre don de 126 € est bien reçu. Votre reçu fiscal CERFA est joint à cet email.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;"><tr><td align="center" class="outer" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;width:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(20,60,66,.12);">
<tr><td align="center" style="background:#8a1f1f;color:#ffffff;font-size:11px;letter-spacing:1px;padding:7px 10px;font-weight:bold;">EMAIL DE TEST — AUCUN DON RÉEL</td></tr>
<tr><td align="center" background="${abase}/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header2.jpg') center top/cover no-repeat;padding:12px 20px 18px;">
  <div lang="he" dir="rtl" style="text-align:right;color:${accent};font-size:13px;line-height:1;">בס״ד</div>
  <img src="${esc(logoSrc)}" alt="${esc(s.orgName)}" width="120" style="display:block;margin:0 auto;width:120px;height:auto;">
  <div style="font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:bold;color:${accent};letter-spacing:2px;margin-top:6px;line-height:1.1;">${esc(s.orgName.toUpperCase())}</div>
  <div class="he" lang="he" dir="rtl" style="font-family:'Frank Ruhl Libre','David',serif;font-weight:900;font-size:20px;color:#fff;letter-spacing:2px;margin-top:2px;">אמונתך</div>
  <div style="height:2px;width:70px;background:${accent};margin:8px auto 7px;"></div>
  <div style="font-size:12px;color:#d8ecea;">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div></td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:34px 34px 10px;">
  <div class="he" lang="he" dir="rtl" style="text-align:center;font-family:'Frank Ruhl Libre','David',serif;font-weight:900;font-size:22px;color:${accent};margin-bottom:6px;">תודה רבה</div>
  <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:27px;line-height:1.25;color:${color};text-align:center;">Merci pour votre don, Yarone !</h1>
  <p style="margin:0 0 4px;text-align:center;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#9a7a22;font-weight:bold;">Votre don</p>
  <p class="big" style="margin:0 0 18px;text-align:center;font-family:Georgia,serif;font-size:46px;line-height:1.1;color:${color};">126&nbsp;€</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#111827;text-align:center;">Grâce à vous, des familles et des personnes dans le besoin recevront un colis pour Chabbat et pour les fêtes. Votre générosité nous permet de continuer, du premier repas jusqu'au retour à l'autonomie.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;margin:0 0 6px;"><tr><td style="padding:6px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row('Montant', '126,00 €')}${row('Date', esc(date))}${row('Affectation', 'Colis de Chabbat et de fêtes')}${row('Mode de paiement', 'Paiement en ligne')}${row('Reçu fiscal n°', esc(rc.numero), true)}
    </table></td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr><td style="padding:16px 4px 0;border-top:1px solid #dfe8e8;text-align:center;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#14272a;">Votre reçu fiscal est en pièce jointe (PDF)</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7d80;">Il vous permet de bénéficier d'une réduction d'impôt. Conservez-le : il vous sera demandé en cas de contrôle. Il n'est pas à joindre à votre déclaration de revenus.</p>
  </td></tr></table>
  <table role="presentation" align="center" style="margin:26px auto 8px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${site}/" style="display:inline-block;padding:15px 34px;font-size:16px;font-weight:bold;color:#1b2b2d;text-decoration:none;font-family:Arial,sans-serif;">Découvrir nos actions</a></td></tr></table>
  <p style="margin:14px 0 6px;text-align:center;font-size:13.5px;color:#51666a;">Une question sur votre don ou votre reçu ? Répondez simplement à cet email<br>ou appelez-nous au ${esc(s.phone || '')}.</p>
</td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:22px 34px 28px;text-align:center;border-top:1px solid #eef0f3;">
  <div style="margin:0 0 12px;text-align:center;">${icons}</div>
  <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${esc(s.orgName)} · Association à but non lucratif · SIREN 930 755 558 · 76 boulevard Félix Faure, 93300 Aubervilliers</p>
  <p style="margin:0;font-size:11.5px;color:#9ca3af;">Vous recevez cet email car vous avez fait un don à ${esc(s.orgName)}. C'est un message de confirmation, il ne s'agit pas d'une lettre d'information.<br>Vos données servent uniquement à établir et conserver votre reçu fiscal.</p>
</td></tr></table></td></tr></table></body></html>`;
  fs.writeFileSync(path.join(ROOT, 'recus', 'email-don-test.html'), html);

  // 3) envoi Brevo (clé jamais affichée)
  const res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': s.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({
    sender: { name: s.senderName || s.orgName, email: s.senderEmail }, to: [{ email: TO, name: 'Yarone' }], ...(s.replyTo ? { replyTo: { email: s.replyTo, name: s.orgName } } : {}),
    subject: '[TEST] Merci pour votre don de 126 € — votre reçu fiscal', htmlContent: html,
    textContent: `Merci pour votre don de 126 € à ${s.orgName} (${date}).\nAffectation : Colis de Chabbat et de fêtes.\nVotre reçu fiscal ${rc.numero} est joint à cet email (PDF). Conservez-le : il vous sera demandé en cas de contrôle.\n\n(Email de test : aucun don réel.)`,
    attachment: [{ name: `Recu-fiscal-${rc.numero}.pdf`, content: pdf.toString('base64') }], tags: ['test-recu-don'] }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Brevo ' + res.status + ' : ' + (j.message || JSON.stringify(j).slice(0, 200)));
  console.log('✉️  email envoyé à', TO, '| expéditeur :', s.senderEmail, '| messageId :', j.messageId);
})().catch(e => { console.error('ERREUR :', e.message); process.exit(1); });
