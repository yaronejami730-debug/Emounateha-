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
    const env = process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : Object.fromEntries(fs.readFileSync(path.join(MAIN, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
    const { Pool } = need('pg'); const pool = new Pool({ connectionString: String(env.DATABASE_URL || '').replace(/(pooler\.supabase\.com):5432\b/, '$1:6543'), ssl: { rejectUnauthorized: false }, max: 1 });
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
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(s.orgName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Frank+Ruhl+Libre:wght@500;900&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Frank+Ruhl+Libre:wght@500;900&family=Inter:wght@400;600;700;800&display=swap');:root{color-scheme:light only}a[x-apple-data-detectors],u+#body a,#MessageViewBody a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;pointer-events:none}.he{font-family:'Frank Ruhl Libre','David',serif !important}@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important}.pad{padding-left:18px !important;padding-right:18px !important}.big{font-size:40px !important}.code{font-size:34px !important;letter-spacing:6px !important}}</style></head>
<body bgcolor="#eef2f1" style="margin:0;padding:0;background:#eef2f1;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(120)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;"><tr><td align="center" class="outer" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;width:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(20,60,66,.12);">
${testBanner ? '<tr><td align="center" style="background:#8a1f1f;color:#ffffff;font-size:11px;letter-spacing:1px;padding:7px 10px;font-weight:bold;">EMAIL DE TEST — AUCUN DON RÉEL</td></tr>' : ''}
<tr><td align="center" background="${abase}/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header2.jpg') center top/cover no-repeat;padding:12px 20px 18px;">
  <div lang="he" dir="rtl" style="text-align:right;color:${accent};font-size:13px;line-height:1;">בס״ד</div>
  <img src="${esc((s.publicUrl || abase).replace(/\/$/, ''))}/logo-complet-site.png?v=5" alt="${esc(s.orgName)} — אמונתך" width="150" style="display:block;margin:4px auto 2px;width:150px;max-width:55%;height:auto;border:0;">
  <div style="height:2px;width:70px;background:${accent};margin:8px auto 7px;"></div>
  <div style="font-size:11px;line-height:1.4;color:#d8ecea;">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div><div style="font-family:'Cinzel',Georgia,serif;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#f6e094;margin-top:8px;padding:0 6px;">Accueillons Machia'h avec des actes de bonté et de bienveillance&nbsp;!</div></td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:32px 34px 14px;">${inner}</td></tr>
<tr><td class="pad" ${patAttr} style="${pat}padding:22px 34px 28px;text-align:center;border-top:1px solid #eef0f3;">
  <div style="margin:0 0 12px;text-align:center;">${icons}</div>
  <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${esc(s.orgName)} · Association à but non lucratif · SIREN 930&#8203; 755&#8203; 558 · 76&#8203; boulevard Félix&#8203; Faure, 93&#8203;300 Auber&#8203;villiers</p>
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
  const row = (k, v, last) => `<tr><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:12px;color:#6b7d80;width:42%;">${k}</td><td style="padding:10px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:13.5px;color:#14272a;font-weight:600;text-align:right;">${v}</td></tr>`;
  const inner = `<div class="he" lang="he" dir="rtl" style="text-align:center;font-family:'Frank Ruhl Libre','David',serif;font-weight:900;font-size:19px;color:${accent};margin-bottom:4px;">תודה רבה</div>
  <h1 style="margin:0 0 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:bold;font-size:22px;line-height:1.3;color:${color};text-align:center;">Merci pour votre don${d.prenom ? ', ' + esc(d.prenom) : ''} !</h1>
  <p style="margin:0 0 2px;text-align:center;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#9a7a22;font-weight:bold;">${d.mensuel ? 'Votre don mensuel' : 'Votre don'}</p>
  <p class="big" class="amt" style="margin:2px 0 14px;text-align:center;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:42px;letter-spacing:-0.5px;line-height:1.05;color:${color};">${amount}${d.mensuel ? '<span style="font-size:18px;color:#6b7d80;"> / mois</span>' : ''}</p>
  <p style="margin:0 0 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#22383b;text-align:center;">Votre générosité permet à ${esc(s.orgName)} de continuer à aider des familles et des personnes dans le besoin : repas, colis, hébergement, soutien et accompagnement vers l'autonomie.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;margin:0 0 6px;"><tr><td style="padding:6px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row('Montant', amount + (d.mensuel ? ' / mois' : ''))}${row('Date', esc(date))}${d.affectation ? row('Affectation', esc(d.affectation)) : ''}${row('Mode de paiement', esc(d.mode).replace(/ \(/, '<br>('))}${d.mensuel && d.echeance ? row('Échéance', 'n°' + d.echeance) : ''}${row('Reçu fiscal n°', esc(d.numero), true)}
  </table></td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;"><tr>
    <td style="padding:6px 8px;text-align:center;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;line-height:1.55;">
      <div style="font-size:14px;color:${accent};font-weight:600;line-height:1.6;"><span style="font-family:Georgia,serif;font-size:30px;line-height:0;font-weight:bold;color:${accent};vertical-align:-15px;margin-right:5px;">&ldquo;</span>En pratiquant la tsédaka, nous honorons<br>son héritage et contribuons à la<br>construction d'un monde empreint de<br>bienveillance, d'unité et de générosité.<span style="font-family:Georgia,serif;font-size:30px;line-height:0;font-weight:bold;color:${accent};vertical-align:-17px;margin-left:5px;">&rdquo;</span></div>
    </td>
  </tr></table>
  ${d.spaceUrl ? `<table role="presentation" align="center" style="margin:24px auto 6px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${esc(d.spaceUrl)}" style="display:inline-block;padding:11px 26px;font-size:14px;font-weight:bold;color:#1b2b2d;text-decoration:none;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;">Retrouver tous mes reçus</a></td></tr></table>
  <p style="margin:6px 0 4px;text-align:center;font-size:12.5px;color:#8a949a;">Connexion par simple code envoyé par email, sans mot de passe.</p>` : `<table role="presentation" align="center" style="margin:24px auto 6px;"><tr><td style="background:${accent};border-radius:999px;"><a href="${site}/" style="display:inline-block;padding:11px 26px;font-size:14px;font-weight:bold;color:#1b2b2d;text-decoration:none;font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;">Découvrir nos actions</a></td></tr></table>`}
`;
  return { subject: `${d.test ? '[TEST] ' : ''}Merci pour votre don de ${amount.replace(' ', ' ')}${d.mensuel ? ' par mois' : ''}`,
    html: shell(s, inner, { preheader: `Votre don de ${amount.replace(' ', ' ')} est bien reçu. Merci pour votre générosité.`, testBanner: !!d.test }).replace('{{pied}}', `Vous recevez cet email car vous avez fait un don à ${esc(s.orgName)}. C'est un message de confirmation, pas une lettre d'information.<br>Vos données servent uniquement à établir et conserver votre reçu fiscal.`),
    text: `Merci pour votre don de ${amount.replace(' ', ' ')}${d.mensuel ? ' par mois' : ''} à ${s.orgName} (${date}).\n${d.affectation ? 'Affectation : ' + d.affectation + '.\n' : ''}« En pratiquant la tsédaka, nous honorons son héritage et contribuons à la construction d'un monde empreint de bienveillance, d'unité et de générosité. »\nVotre reçu fiscal ${d.numero} est joint à cet email (PDF). Conservez-le : il vous sera demandé en cas de contrôle.${d.spaceUrl ? '\nRetrouvez tous vos reçus : ' + d.spaceUrl : ''}` };
}

// ---- alerte administrateur : un don vient d'être effectué (aucune action requise) ----
const ADMIN_EMAIL = () => process.env.ADMIN_EMAIL || 'emounateha770@gmail.com';
async function adminDonEmail(d) {   // { nom, email, type, montant(centimes), dateDon, affectation, mode, numero, mensuel, echeance, ambassadeur, test }
  const s = await settings(); if (!s) return null;
  const color = '#1f6a72', accent = '#c4a24a';
  const date = new Date(d.dateDon).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const amount = (d.montant / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
  const ord = n => n === 1 ? '1er' : n + 'e';
  const finTxt = d.fin ? 'Jusqu\'au ' + new Date(d.fin + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : 'Sans limite de durée';
  const nature = d.nb ? `Don en ${d.nb} fois — ${ord(d.echeance || 1)} paiement sur ${d.nb}` : d.mensuel ? (d.echeance > 1 ? `Don mensuel — ${ord(d.echeance)} paiement` : 'Don mensuel — 1er paiement (début du don)') : 'Paiement unique';
  const row = (k, v, last) => `<tr><td style="padding:9px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:12px;color:#6b7d80;width:38%;">${k}</td><td style="padding:9px 0;${last ? '' : 'border-bottom:1px solid #e9eeee;'}font-size:13.5px;color:#14272a;font-weight:600;text-align:right;">${v}</td></tr>`;
  const inner = `<p style="margin:0 0 2px;text-align:center;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#9a7a22;font-weight:bold;">Nouveau don</p>
  <p style="margin:0 0 8px;text-align:center;"><span style="display:inline-block;background:${d.mensuel ? accent : '#e6f0ef'};color:${d.mensuel ? '#1b2b2d' : color};font-size:12.5px;font-weight:bold;padding:5px 14px;border-radius:999px;">${nature}</span></p>
  <h1 style="margin:0 0 6px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:bold;font-size:21px;line-height:1.3;color:${color};text-align:center;">Un don vient d'être effectué</h1>
  <p class="big" style="margin:2px 0 14px;text-align:center;font-family:Inter,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;font-size:40px;letter-spacing:-0.5px;line-height:1.05;color:${color};">${amount}${d.mensuel ? '<span style="font-size:18px;color:#6b7d80;"> / mois</span>' : ''}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf9;border:1px solid #dbe8e8;border-radius:12px;margin:0 0 14px;"><tr><td style="padding:6px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row('Nature', esc(nature))}${d.nb ? row('Don total', esc(((d.total || 0) / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' € en ' + d.nb + ' mensualités')) : d.mensuel ? row('Durée du don mensuel', esc(finTxt)) : ''}${row('Donateur', esc(d.nom || '—'))}${row('Email', esc(d.email || '—'))}${row('Type', d.type === 'entreprise' ? 'Entreprise' : 'Particulier')}${row('Date', esc(date))}${d.affectation ? row('Affectation', esc(d.affectation)) : ''}${row('Paiement', esc(d.mode || '—'))}${d.ambassadeur ? row('Ambassadeur', esc(d.ambassadeur)) : ''}${row('Reçu fiscal n°', esc(d.numero || '—'), true)}
  </table></td></tr></table>
  <p style="margin:0 0 10px;text-align:center;font-size:13px;line-height:1.6;color:#51666a;">Le don est accepté et le reçu fiscal a été généré automatiquement.<br><b>Aucune action de votre part n'est nécessaire.</b></p>`;
  return { subject: `${d.test ? '[TEST] ' : ''}${d.nb ? `Don en ${d.nb} fois : ${ord(d.echeance || 1)} paiement sur ${d.nb} (${amount})` : d.mensuel ? `Don mensuel : ${ord(d.echeance || 1)} paiement de ${amount}` : `Nouveau don de ${amount}`}${d.nom ? ' — ' + d.nom : ''}`,
    html: shell(s, inner, { preheader: `${d.nom || 'Un donateur'} a fait un don de ${amount}.`, testBanner: !!d.test }).replace('{{pied}}', "Notification automatique réservée à l'administrateur du site."),
    text: `Un don vient d'être effectué : ${amount}\n${nature}${d.mensuel ? ' (' + finTxt.toLowerCase() + ')' : ''}\nDonateur : ${d.nom || '—'} (${d.email || '—'})\nDate : ${date}\n${d.affectation ? 'Affectation : ' + d.affectation + '\n' : ''}Paiement : ${d.mode || '—'}\nReçu fiscal : ${d.numero || '—'}\nAucune action nécessaire.` };
}
async function notifyAdminDon(d) {   // ne casse jamais le flux du don
  try { const m = await adminDonEmail(d); if (!m) return { sent: false, reason: 'Brevo non configuré' }; return await send({ to: ADMIN_EMAIL(), toName: "Administrateur", subject: m.subject, html: m.html, text: m.text }); }
  catch (e) { console.error('[mail admin] échec :', e.message); return { sent: false, error: e.message }; }
}

module.exports = { settings, isFake, send, otpEmail, donEmail, adminDonEmail, notifyAdminDon, ADMIN_EMAIL };
