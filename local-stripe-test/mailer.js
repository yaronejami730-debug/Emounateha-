/* Envoi d'emails par Brevo (transactionnel) + modèles : code de connexion, remerciement après un don.
   Les réglages (clé, expéditeur) viennent du CRM (table public.settings) ; la clé n'est jamais affichée ni copiée.
   Adresses de test (@example.com…) : rien n'est envoyé. */
const fs = require('fs'), path = require('path');
const MAIN = process.env.CRM_DIR || '/Users/yarone/Emounateha';
let cache = null, cacheAt = 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function settings() {
  if (cache !== null && Date.now() - cacheAt < 300000) return cache || null;
  try {
    const need = m => { try { return require(m); } catch (e) { return require(path.join(MAIN, 'node_modules', m)); } };
    const env = Object.fromEntries(fs.readFileSync(path.join(MAIN, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
    const { Pool } = need('pg'); const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
    const s = ((await pool.query('select data from public.settings where id = 1')).rows[0] || {}).data || {}; await pool.end();
    cache = (s.brevoApiKey && s.senderEmail) ? s : false;
  } catch (e) { cache = false; console.error('[mail] réglages Brevo indisponibles :', e.message); }
  cacheAt = Date.now(); return cache || null;
}
const isFake = to => /@(example\.(com|org|net)|test|invalid|localhost)$/i.test(String(to)) || process.env.MAIL_SIMULATE === '1';

async function send({ to, toName, subject, html, text, attachments }) {
  if (isFake(to)) return { sent: false, simulated: true, reason: 'adresse de test : non envoyée' };
  const s = await settings(); if (!s) return { sent: false, simulated: true, reason: 'Brevo non configuré' };
  const res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': s.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({
    sender: { name: s.senderName || s.orgName, email: s.senderEmail }, to: [{ email: to, name: toName || undefined }], ...(s.replyTo ? { replyTo: { email: s.replyTo, name: s.orgName } } : {}),
    subject, htmlContent: html, textContent: text, ...(attachments && attachments.length ? { attachment: attachments.map(a => ({ name: a.name, content: a.content })) } : {}), tags: ['don-compte'] }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Brevo ' + res.status + ' : ' + (j.message || 'erreur'));
  return { sent: true, messageId: j.messageId };
}

// ---- enveloppe commune (même identité que les emails du CRM) ----
function shell(s, inner, { preheader = '', testBanner = false } = {}) {
  const abase = (s.assetsUrl || s.publicUrl || '').replace(/\/$/, ''), color = '#1f6a72', accent = '#c4a24a';
  const logo = /^https?:/.test(s.logoUrl || '') ? s.logoUrl : abase + (s.logoUrl || '/logo2.png');
  const pat = `background:#ffffff url('${abase}/bg.png') repeat;`, patAttr = `background="${abase}/bg.png" bgcolor="#ffffff"`;
  const wa = (s.phone || '').replace(/\D/g, '').replace(/^0/, '33');
  const ico = (href, name, alt) => `<a href="${esc(href)}" style="display:inline-block;margin:0 4px;text-decoration:none;"><img src="${abase}/icon-${name}.png" width="26" height="26" alt="${alt}" style="display:inline-block;border:0;"></a>`;
  const icons = [s.instagramUrl && ico(s.instagramUrl, 'instagram', 'Instagram'), s.facebookUrl && ico(s.facebookUrl, 'facebook', 'Facebook'), s.tiktokUrl && ico(s.tiktokUrl, 'tiktok', 'TikTok'), s.youtubeUrl && ico(s.youtubeUrl, 'youtube', 'YouTube'), s.phone && ico('https://wa.me/' + wa, 'whatsapp', 'WhatsApp')].filter(Boolean).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(s.orgName)}</title>
<style>:root{color-scheme:light only}.he{font-family:'Frank Ruhl Libre','David',serif !important}@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important}.pad{padding-left:18px !important;padding-right:18px !important}.big{font-size:40px !important}.code{font-size:34px !important;letter-spacing:6px !important}}</style></head>
<body bgcolor="#eef2f1" style="margin:0;padding:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;"><tr><td align="center" class="outer" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;width:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(20,60,66,.12);">
${testBanner ? '<tr><td align="center" style="background:#8a1f1f;color:#ffffff;font-size:11px;letter-spacing:1px;padding:7px 10px;font-weight:bold;">EMAIL DE TEST — AUCUN DON RÉEL</td></tr>' : ''}
<tr><td align="center" background="${abase}/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header2.jpg') center top/cover no-repeat;padding:12px 20px 18px;">
  <div lang="he" dir="rtl" style="text-align:right;color:${accent};font-size:13px;line-height:1;">בס״ד</div>
  <img src="${esc(logo)}" alt="${esc(s.orgName)}" width="120" style="display:block;margin:0 auto;width:120px;height:auto;">
  <div style="font-family:'Cinzel',Georgia,serif;font-size:22px;font-weight:bold;color:${accent};letter-spacing:2px;margin-top:6px;line-height:1.1;">${esc(String(s.orgName).toUpperCase())}</div>
  <div class="he" lang="he" dir="rtl" style="font-family:'Frank Ruhl Libre','David',serif;font-weight:900;font-size:20px;color:#fff;letter-spacing:2px;margin-top:2px;">אמונתך</div>
  <div style="height:2px;width:70px;background:${accent};margin:8px auto 7px;"></div>
  <div style="font-size:12px;color:#d8ecea;">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div></td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:32px 34px 14px;">${inner}</td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:22px 34px 28px;text-align:center;border-top:1px solid #eef0f3;">
  <div style="margin:0 0 12px;text-align:center;">${icons}</div>
  <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${esc(s.orgName)} · Association à but non lucratif · SIREN 930 755 558 · 76 boulevard Félix Faure, 93300 Aubervilliers</p>
  <p style="margin:0;font-size:11.5px;color:#9ca3af;">{{pied}}</p>
</td></tr></table></td></tr></table></body></html>`;
}

// ---- code de connexion à 6 chiffres ----
async function otpEmail(to, code) {
  const s = await settings(); if (!s) return null;
  const inner = `<h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:25px;line-height:1.25;color:#1f6a72;text-align:center;">Votre code de connexion</h1>
  <p style="margin:0 0 18px;text-align:center;font-size:15px;line-height:1.6;color:#374151;">Saisissez ce code sur la page pour accéder à votre espace donateur.</p>
  <p class="code" style="margin:0 0 16px;text-align:center;font-family:'Courier New',monospace;font-size:42px;font-weight:bold;letter-spacing:10px;color:#14272a;background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;padding:16px 8px;">${esc(code)}</p>
  <p style="margin:0 0 6px;text-align:center;font-size:13.5px;line-height:1.6;color:#51666a;">Ce code est valable <b>10 minutes</b> et ne peut servir qu'une fois.</p>
  <p style="margin:0 0 10px;text-align:center;font-size:12.5px;line-height:1.6;color:#8a949a;">Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet email : personne ne peut se connecter sans ce code.</p>`;
  return { subject: `${code} est votre code de connexion — ${s.orgName}`, html: shell(s, inner, { preheader: `Votre code : ${code} (valable 10 minutes)` }).replace('{{pied}}', 'Vous recevez cet email car une connexion à l\'espace donateur a été demandée avec cette adresse.'),
    text: `Votre code de connexion à l'espace donateur ${s.orgName} : ${code}\nValable 10 minutes, utilisable une seule fois.\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.` };
}

// ---- remerciement après un don : modèle unique, valable pour TOUS les dons ----
async function donEmail(d) {   // { prenom, montant(centimes), dateDon, affectation, mode, numero, mensuel, echeance, spaceUrl, test }
  const s = await settings(); if (!s) return null;
  const color = '#1f6a72', accent = '#c4a24a', site = (s.publicUrl || 'https://www.emounateha.fr').replace(/\/$/, '');
  const date = new Date(d.dateDon).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const amount = (d.montant / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
  const row = (k, v, last) => `<tr><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:13px;color:#6b7d80;width:42%;">${k}</td><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:15px;color:#14272a;font-weight:600;text-align:right;">${v}</td></tr>`;
  const inner = `<div class="he" lang="he" dir="rtl" style="text-align:center;font-family:'Frank Ruhl Libre','David',serif;font-weight:900;font-size:22px;color:${accent};margin-bottom:6px;">תודה רבה</div>
  <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:27px;line-height:1.25;color:${color};text-align:center;">Merci pour votre don${d.prenom ? ', ' + esc(d.prenom) : ''} !</h1>
  <p style="margin:0 0 4px;text-align:center;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#9a7a22;font-weight:bold;">${d.mensuel ? 'Votre don mensuel' : 'Votre don'}</p>
  <p class="big" style="margin:0 0 18px;text-align:center;font-family:Georgia,serif;font-size:46px;line-height:1.1;color:${color};">${amount}${d.mensuel ? '<span style="font-size:18px;color:#6b7d80;"> / mois</span>' : ''}</p>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#111827;text-align:center;">Votre générosité permet à ${esc(s.orgName)} de continuer à aider des familles et des personnes dans le besoin : repas, colis, hébergement, soutien et accompagnement vers l'autonomie.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;margin:0 0 6px;"><tr><td style="padding:6px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row('Montant', amount + (d.mensuel ? ' / mois' : ''))}${row('Date', esc(date))}${d.affectation ? row('Affectation', esc(d.affectation)) : ''}${row('Mode de paiement', esc(d.mode))}${d.mensuel && d.echeance ? row('Échéance', 'n°' + d.echeance) : ''}${row('Reçu fiscal n°', esc(d.numero), true)}
  </table></td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr><td style="padding:16px 4px 0;border-top:1px solid #dfe8e8;text-align:center;">
    <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#14272a;">Votre reçu fiscal est en pièce jointe (PDF)</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7d80;">Il vous permet de bénéficier d'une réduction d'impôt. Conservez-le : il vous sera demandé en cas de contrôle. Il n'est pas à joindre à votre déclaration de revenus.</p>
  </td></tr></table>
  ${d.spaceUrl ? `<table role="presentation" align="center" style="margin:24px auto 6px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${esc(d.spaceUrl)}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#1b2b2d;text-decoration:none;font-family:Arial,sans-serif;">Retrouver tous mes reçus</a></td></tr></table>
  <p style="margin:6px 0 4px;text-align:center;font-size:12.5px;color:#8a949a;">Connexion par simple code envoyé par email, sans mot de passe.</p>` : `<table role="presentation" align="center" style="margin:24px auto 6px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${site}/" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:bold;color:#1b2b2d;text-decoration:none;font-family:Arial,sans-serif;">Découvrir nos actions</a></td></tr></table>`}
  <p style="margin:14px 0 6px;text-align:center;font-size:13.5px;color:#51666a;">Une question sur votre don ou votre reçu ? Répondez simplement à cet email<br>ou appelez-nous au ${esc(s.phone || '')}.</p>`;
  return { subject: `${d.test ? '[TEST] ' : ''}Merci pour votre don de ${amount.replace(' ', ' ')}${d.mensuel ? ' par mois' : ''} — votre reçu fiscal`,
    html: shell(s, inner, { preheader: `Votre don de ${amount.replace(' ', ' ')} est bien reçu. Votre reçu fiscal est joint à cet email.`, testBanner: !!d.test }).replace('{{pied}}', `Vous recevez cet email car vous avez fait un don à ${esc(s.orgName)}. C'est un message de confirmation, pas une lettre d'information.<br>Vos données servent uniquement à établir et conserver votre reçu fiscal.`),
    text: `Merci pour votre don de ${amount.replace(' ', ' ')}${d.mensuel ? ' par mois' : ''} à ${s.orgName} (${date}).\n${d.affectation ? 'Affectation : ' + d.affectation + '.\n' : ''}Votre reçu fiscal ${d.numero} est joint à cet email (PDF). Conservez-le : il vous sera demandé en cas de contrôle.${d.spaceUrl ? '\nRetrouvez tous vos reçus : ' + d.spaceUrl : ''}` };
}

module.exports = { settings, isFake, send, otpEmail, donEmail };
