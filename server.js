// CRM Emounateha — serveur zéro dépendance (Node 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(ROOT, 'public');
const CRM_DIR = path.join(ROOT, 'crm-app'); // l'interface du CRM n'est servie qu'aux personnes connectées

const SERVERLESS = !!process.env.VERCEL; // sur Vercel : pas de disque, pas de timers, base rechargée à chaque requête
if (!SERVERLESS) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- DB ----------
const uid = () => crypto.randomBytes(6).toString('hex');
const now = () => new Date().toISOString();

const DEFAULT_BODY = `Bonjour {{prenom}},

À l'approche de Hanouka, la fête des lumières, pensons à toutes les familles qui n'ont pas de quoi allumer la joie dans leur foyer.

Grâce à vous, Émounatéha aide chaque semaine des familles dans le besoin et des personnes sans-abri : repas, soutien, et accompagnement vers la réinsertion sociale.

Accueillons Mashia'h avec des actes de bonté et de bienveillance. Chaque don, même modeste, allume une lumière de plus.`;

function defaultDb() {
  return {
    settings: {
      brevoApiKey: '', senderName: 'Emounateha', senderEmail: '',
      dailyLimit: 300, perMinute: 5, hourFrom: 8, hourTo: 21,
      publicUrl: '', logoUrl: '/logo.png', orgName: 'Émounatéha',
      address: '', donateUrl: 'https://don.emounateha.fr/',
      phone: '06 69 67 07 70', social: 'emounateha_', minGapHours: 24,
      instagramUrl: 'https://www.instagram.com/emounateha', facebookUrl: 'https://www.facebook.com/share/1HhyHMPNPd/', tiktokUrl: 'https://www.tiktok.com/@emounateha', youtubeUrl: 'https://youtube.com/@emounateharaba-h4b'
    },
    contacts: [],
    templates: [{
      id: uid(), holiday: 'hanouka', name: 'Hanouka — Appel aux dons', subject: '{{prenom}}, allumez une lumière avec Émounatéha 🕎',
      preheader: 'Ensemble, rendons Hanouka lumineux pour les familles dans le besoin.',
      title: 'Allumons ensemble la lumière de Hanouka',
      body: DEFAULT_BODY, buttonText: 'Faire un don', buttonUrl: 'https://don.emounateha.fr/?aff=hanouka',
      color: '#1f6a72', accent: '#c4a24a', createdAt: now()
    }],
    campaigns: [],
    sends: []
  };
}

let db;
// --- Stockage : Supabase (Postgres) si DATABASE_URL, sinon fichier local ---
function envVar(k) {
  if (process.env[k]) return process.env[k];
  try { const l = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').find(x => x.startsWith(k + '=')); return l ? l.slice(k.length + 1).trim() : ''; } catch { return ''; }
}
const DATABASE_URL = envVar('DATABASE_URL');
let pool = null;
if (DATABASE_URL) { const { Pool } = require('pg'); pool = new Pool({ connectionString: DATABASE_URL.replace(/(pooler\.supabase\.com):5432\b/, '$1:6543'), ssl: { rejectUnauthorized: false }, max: process.env.VERCEL ? 1 : 3, idleTimeoutMillis: process.env.VERCEL ? 3000 : 20000, allowExitOnIdle: true }); pool.on('error', e => console.error('[db] connexion perdue', e.message)); }   // pooler Supabase en mode transaction (6543) : le mode session (5432) plafonne à 15 clients

const TABLES = {
  contacts: { email: 'email', firstName: 'first_name', lastName: 'last_name', phone: 'phone', tags: 'tags', status: 'status', notes: 'notes', createdAt: 'created_at' },
  templates: { holiday: 'holiday', name: 'name', subject: 'subject', preheader: 'preheader', title: 'title', body: 'body', buttonText: 'button_text', buttonUrl: 'button_url', color: 'color', accent: 'accent', createdAt: 'created_at' },
  campaigns: { name: 'name', audienceTag: 'audience_tag', status: 'status', steps: 'steps', startDate: 'start_date', endDate: 'end_date', createdAt: 'created_at' },
  sends: { at: 'at', campaignId: 'campaign_id', contactId: 'contact_id', email: 'email', stepIndex: 'step_index', templateId: 'template_id', status: 'status', messageId: 'message_id', error: 'error', quota: 'quota' }
};
const JSONCOLS = new Set(['steps']);
const lastSnap = {}; // table -> Map(id -> json)
const toRow = (t, o) => Object.entries(TABLES[t]).map(([k, c]) => o[k] === undefined ? (c === 'quota' ? false : null) : (JSONCOLS.has(c) ? JSON.stringify(o[k]) : o[k])); // quota : jamais null (contrainte not null)
const fromRow = (t, r) => { const o = { id: r.id }; for (const [k, c] of Object.entries(TABLES[t])) { let v = r[c]; if (v instanceof Date) v = v.toISOString(); if (v === null && !['messageId', 'error', 'templateId', 'campaignId', 'contactId'].includes(k)) v = k === 'quota' ? false : ''; if (v !== null) o[k] = v; } return o; };

async function loadDb() {
  let loaded = null;
  if (pool) {
    if (!loadDb.migrated) { await pool.query(fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261102230000_crm_schema.sql'), 'utf8')); loadDb.migrated = true; }
    const [st, ...rows] = await Promise.all([
      pool.query('select data from public.settings where id = 1'),
      ...Object.keys(TABLES).map(t => pool.query(`select * from public.${t}` + (t === 'sends' ? ' order by at' : ' order by created_at')))
    ]);
    if (st.rows.length || rows[0].rows.length || rows[1].rows.length) {
      loaded = { settings: st.rows[0]?.data || {} };
      Object.keys(TABLES).forEach((t, i) => {
        loaded[t] = rows[i].rows.map(x => fromRow(t, x));
        lastSnap[t] = new Map(loaded[t].map(o => [o.id, JSON.stringify(o)]));
      });
    } else { // migration de l'ancien stockage clé/valeur, si présent
      const old = await pool.query("select to_regclass('public.crm_kv') as r");
      if (old.rows[0].r) { const r = await pool.query('select key, value from public.crm_kv'); if (r.rows.length) { loaded = {}; for (const x of r.rows) loaded[x.key] = x.value; } }
    }
  }
  if (!loaded) { try { loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { loaded = defaultDb(); } }
  db = { ...defaultDb(), ...loaded, settings: { ...defaultDb().settings, ...(loaded.settings || {}) } };
  loadedAt = Date.now();
  if (!SERVERLESS) await persist();
}
let loadedAt = 0, dirty = false;
async function ensureDb() { if (!db || (SERVERLESS && Date.now() - loadedAt > 4000)) await loadDb(); }
async function flush() { if (dirty) { dirty = false; await persist(); loadedAt = Date.now(); } }
let persisting = Promise.resolve();
function persist() {
  const snap = JSON.stringify(db);
  if (!SERVERLESS) { fs.writeFileSync(DB_FILE + '.tmp', snap); fs.renameSync(DB_FILE + '.tmp', DB_FILE); } // copie locale de secours
  if (!pool) return Promise.resolve();
  persisting = persisting.then(async () => {
    await pool.query("insert into public.settings (id, data) values (1, $1::jsonb) on conflict (id) do update set data = excluded.data, updated_at = now()", [JSON.stringify(db.settings)]);
    for (const [t, map] of Object.entries(TABLES)) {
      const prev = lastSnap[t] || (lastSnap[t] = new Map());
      const cols = Object.values(map), seen = new Set();
      for (const o of db[t]) {
        seen.add(o.id);
        const js = JSON.stringify(o);
        if (prev.get(o.id) === js) continue;
        const ph = cols.map((c, i) => JSONCOLS.has(c) ? `$${i + 2}::jsonb` : `$${i + 2}`).join(',');
        await pool.query(`insert into public.${t} (id, ${cols.join(',')}) values ($1, ${ph}) on conflict (id) do update set ${cols.map(c => `${c} = excluded.${c}`).join(',')}`, [o.id, ...toRow(t, o)]);
        prev.set(o.id, js);
      }
      for (const id of [...prev.keys()]) if (!seen.has(id)) { await pool.query(`delete from public.${t} where id = $1`, [id]); prev.delete(id); }
    }
  }).catch(e => console.error('Supabase save error:', e.message));
  return persisting;
}
let saveTimer;
function save() { dirty = true; if (SERVERLESS) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { dirty = false; persist(); }, 150); }

// ---------- Email rendering ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fill(str, contact, extra = {}) {
  const vars = {
    prenom: contact?.firstName || '', nom: contact?.lastName || '',
    email: contact?.email || '', ...extra
  };
  return String(str ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

function unsubUrl(contact) {
  const base = (db.settings.publicUrl || `http://localhost:${PORT}`).replace(/\/$/, '');
  return `${base}/u/${contact?.id || 'preview'}`;
}

// hébreu : chaque suite de lettres hébraïques reçoit lang="he", dir="rtl" et Frank Ruhl Libre
function heTag(html) {
  const HE = /[\u0590-\u05FF\uFB1D-\uFB4F][\u0590-\u05FF\uFB1D-\uFB4F\s"'״׳,.\-–:()]*/g;
  return html.split(/(<[^>]*>)/).map((p, i, arr) => (p.startsWith('<') || !/[\u0590-\u05FF]/.test(p) || /lang="he"/.test(arr[i - 1] || '')) ? p
    : p.replace(HE, m => `<span lang="he" dir="rtl">${m}</span>`)).join('');
}
// Suivi des dons par e-mail : chaque lien vers nos sites reçoit la campagne (utm_campaign), le modèle d'e-mail (utm_content) et l'identifiant de l'envoi (sid).
// Le site de don les garde (cookie 30 jours) et les envoie à Stripe avec le paiement : on sait quel e-mail a déclenché quel don.
const TRK_HOSTS = /^(www\.|don\.|ambassadeur\.)?emounateha\.fr$/i;
function trackUrl(url, ctx) {
  if (!ctx || !ctx.campaignId) return url;
  try {
    const u = new URL(url); if (!TRK_HOSTS.test(u.hostname)) return url;
    const cl = (v, n) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, n);
    u.searchParams.set('utm_source', 'email'); u.searchParams.set('utm_medium', 'email'); u.searchParams.set('utm_campaign', cl(ctx.campaignId, 60));
    if (ctx.templateId) u.searchParams.set('utm_content', cl(ctx.templateId, 60)); if (ctx.sendId) u.searchParams.set('sid', cl(ctx.sendId, 60));
    return u.toString();
  } catch (e) { return url; }
}
function renderEmail(t, contact, ctx) {
  const s = db.settings;
  const color = t.color || '#1f6a72', accent = t.accent || '#c4a24a';
  const c = contact || { firstName: 'Prénom', lastName: 'Nom', email: 'email@exemple.com', id: 'preview' };
  const base = (s.publicUrl || `http://localhost:${PORT}`).replace(/\/$/, '');
  const abase = (s.assetsUrl || base).replace(/\/$/, ''); // où sont hébergés logo.png / bg.png / header.jpg (doit être public pour Gmail)
  const logoSrc = s.logoUrl ? (/^https?:/.test(s.logoUrl) ? s.logoUrl : abase + s.logoUrl) : '';
  const pat = `background:#ffffff url('${abase}/bg.png') repeat;`, patAttr = `background="${abase}/bg.png" bgcolor="#ffffff"`;
  const paras = fill(t.body, c).split(/\n{2,}/).map(p =>
    `<p class="ink" style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const logo = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="${esc(s.orgName)}" width="120" style="display:block;margin:0 auto;width:120px;height:auto;">`
    : '';
  const button = t.buttonText && t.buttonUrl
    ? `<table role="presentation" align="center" style="margin:28px auto 8px;"><tr><td style="background:${accent};border-radius:999px;">
        <a href="${esc(trackUrl(fill(t.buttonUrl, c), ctx))}" style="display:inline-block;padding:${t.buttonSmall ? '11px 26px' : '16px 38px'};font-size:${t.buttonSmall ? '14px' : '17px'};font-weight:bold;color:#1f2937;text-decoration:none;font-family:Arial,sans-serif;">${esc(t.buttonText)}</a>
       </td></tr></table>` : '';
  const wa = (s.phone || '').replace(/\D/g, '').replace(/^0/, '33');
  const pill = (href, label) => `<a href="${esc(trackUrl(href, ctx))}" style="display:inline-block;margin:4px 3px;padding:10px 22px;background:#7b8a8d;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;border-radius:999px;">${label}</a>`;
  const ico = (href, name, alt) => `<a href="${esc(href)}" style="display:inline-block;margin:0 4px;text-decoration:none;"><img src="${abase}/icon-${name}.png" width="26" height="26" alt="${alt}" style="display:block;width:26px;height:26px;border:0;border-radius:17px;background:#7b8a8d;color:#ffffff;font-size:11px;"></a>`;
  const contactLine = '<div>' + [
    s.instagramUrl ? ico(s.instagramUrl, 'instagram', 'Instagram') : '',
    s.facebookUrl ? ico(s.facebookUrl, 'facebook', 'Facebook') : '',
    s.tiktokUrl ? ico(s.tiktokUrl, 'tiktok', 'TikTok') : '',
    s.youtubeUrl ? ico(s.youtubeUrl, 'youtube', 'YouTube') : '',
    s.phone ? ico('https://wa.me/' + wa, 'whatsapp', 'WhatsApp') : ''  // le numéro est dans le lien, pas affiché
  ].filter(Boolean).join('') + '</div>';
  return heTag(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(fill(t.subject, c))}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Frank+Ruhl+Libre:wght@500;900&display=swap" rel="stylesheet">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Frank+Ruhl+Libre:wght@500;900&display=swap');
:root{color-scheme:light only;supported-color-schemes:light only}
.he{font-family:'Frank Ruhl Libre','David',serif !important}
body,table,td{background-color:inherit}
.bgp{background-color:#ffffff !important}
.ink{color:#111827 !important}
@media (prefers-color-scheme: dark){
  body,.wrap-out{background-color:#eef2f1 !important}
  .bgp{background-color:#ffffff !important;background-image:url('${abase}/bg.png') !important}
  .ink,.ink *{color:#111827 !important}
  .ttl{color:${color} !important}
  .hdr{background-color:#1f6a72 !important}
}
[data-ogsc] .ink,[data-ogsc] .ink *{color:#111827 !important}
[data-ogsb] .bgp{background-color:#ffffff !important}
[data-ogsb] body,[data-ogsb] .wrap-out{background-color:#eef2f1 !important}
@media only screen and (max-width:620px){
  .outer{padding:0 !important}
  .card{border-radius:0 !important;box-shadow:none !important;max-width:100% !important}
  .pad{padding-left:18px !important;padding-right:18px !important}
  .cb-time{font-size:28px !important}
  .cb-date{font-size:10.5px !important}
}
${t.extraCss || ''}
</style></head>
<body class="wrap-out" bgcolor="#eef2f1" style="margin:0;padding:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(fill(t.preheader, c))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;"><tr><td align="center" class="outer" style="padding:24px 12px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:600px;width:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
  <tr><td class="hdr" background="${abase}/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header2.jpg') center top/cover no-repeat;padding:12px 20px 16px;text-align:center;">
    <div lang="he" dir="rtl" style="text-align:right;color:${accent};font-size:13px;margin-bottom:0;line-height:1;">בס״ד</div>
    <img src="${base}/logo-complet-site.png?v=5" alt="${esc(s.orgName)} — אמונתך" width="150" style="display:block;margin:4px auto 2px;width:150px;max-width:55%;height:auto;border:0;">
    <div style="height:2px;width:50px;background:${accent};margin:6px auto 5px;"></div>
    <div style="font-size:11px;line-height:1.4;color:#d8ecea;">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div><div style="font-family:'Cinzel',Georgia,serif;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#f6e094;margin-top:8px;padding:0 6px;">Accueillons Machia'h avec des actes de bonté et de bienveillance&nbsp;!</div></td></tr>
  <tr><td class="bgp pad" ${patAttr} style="${pat}padding:${t.extraHtml ? '30px 24px 10px' : '40px 36px 12px'};">
    <h1 class="ttl" style="margin:0 0 22px;font-family:Georgia,serif;font-size:28px;line-height:1.25;color:${color};text-align:center;">${esc(fill(t.title, c))}</h1>
    ${paras}${t.extraHtml || ''}${button}
  </td></tr>
  <tr><td class="bgp pad" ${patAttr} style="${pat}padding:24px 36px 30px;text-align:center;border-top:1px solid #eef0f3;">
    <div style="margin:0 0 14px;text-align:center;">${contactLine}</div>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${esc(s.orgName)} · Association à but non lucratif${s.address ? ' · ' + esc(s.address) : ''}</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">Vous recevez cet email car vous êtes en contact avec ${esc(s.orgName)}.<br>
    <a href="${esc(unsubUrl(c))}" style="color:#9ca3af;">Se désinscrire</a></p>
  </td></tr>
 </table></td></tr></table></body></html>`);
}

// ---------- SMS : outils ----------
let smsCost = 4.5; // crédits Brevo par SMS en France ; réajusté d'après la réponse de Brevo à chaque envoi
const SMS_GSM = new Set([...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà']);
const SMS_EXT = new Set([...'^{}\\[~]|€']);
function smsInfo(text) { // 1 SMS = 160 car. (alphabet GSM) ou 70 si un caractère spécial (ê, î, ’, emoji…) force l'Unicode
  let n = 0, uni = false;
  for (const ch of String(text)) { if (SMS_GSM.has(ch)) n++; else if (SMS_EXT.has(ch)) n += 2; else uni = true; }
  if (uni) n = String(text).length;
  const max = uni ? 70 : 160;
  return { len: n, unicode: uni, max, segments: n <= max ? 1 : Math.ceil(n / (uni ? 67 : 153)) };
}
function smsPhone(p) { // -> format Brevo : indicatif + numéro, sans + (ex. 33783259157)
  let s = String(p || '').trim().replace(/[\s.\-()]/g, '');
  const intl = /^(\+|00)/.test(s);
  s = s.replace(/^(\+|00)/, '');
  if (!/^\d+$/.test(s)) return '';
  if (!intl && /^0\d{9}$/.test(s)) return '33' + s.slice(1);
  if (/^33\d{9}$/.test(s)) return s;
  return intl && s.length >= 8 && s.length <= 15 ? s : '';
}
const smsFill = (t, r) => {   // remplace {{prenom}} / {{nom}} ; le texte est envoyé tel quel (même espace avant « ! » ou « ? »), sauf si une variable est vide : alors on nettoie « Bonjour , »
  let vide = false; const rep = v => { const x = (v || '').trim(); if (!x) vide = true; return x; };
  let o = String(t).replace(/\{\{\s*prenom\s*\}\}/gi, () => rep(r.firstName)).replace(/\{\{\s*nom\s*\}\}/gi, () => rep(r.lastName));
  if (vide) o = o.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1');
  return o.trim();
};

// ---------- Brevo ----------
async function brevoSend({ to, toName, subject, html, text, replyToEmail, replyToName }) {
  const s = db.settings;
  if (!s.brevoApiKey) return { simulated: true, messageId: 'sim-' + uid() };
  if (!s.senderEmail) throw new Error('Email expéditeur manquant (Réglages)');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': s.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: s.senderName || s.orgName, email: s.senderEmail },
      to: [{ email: to, name: toName || undefined }],
      ...(replyToEmail ? { replyTo: { email: replyToEmail, name: replyToName || undefined } } : s.replyTo ? { replyTo: { email: s.replyTo, name: s.senderName || s.orgName } } : {}),
      subject, ...(text ? { textContent: text } : { htmlContent: html })
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.message || `Brevo HTTP ${res.status}`); e.quota = res.status === 429 || /limit|quota|credit/i.test(e.message); throw e; }
  return { messageId: j.messageId };
}


// ---------- Robot YouTube : nouvelle vidéo sur la chaîne Tanya => entrée dans la diffusion du jour ----------
const YT_CHANNEL = 'UCoKYPjSFFtZ4LmO2ceHTU8g'; // @Tanya26770

// ---------- Vidéos des colis : chaîne YouTube d'Émounatéha, classées par fête d'après le titre ----------
const COLIS_CHANNEL = 'UCwfjah4RK77QAmkr55cRaxw'; // @EmounatehaRaba-h4b
const COLIS_RULES = [ // l'ordre compte : une vidéo va dans UN seul onglet (la première règle qui correspond)
  ['roch-hachana', /ro(ch|sh)\s*-?\s*(ha)?\s*-?\s*(ashana|hachana|hashana|chana)|nouvel\s+an/],
  ['simhat-torah', /sim[ck]?h?a?t?\s*-?\s*tora|simchat/],
  ['hanouka', /han+ou?[ck]+a|hanuk|hannouk/],
  ['pourim', /pourim|purim/],
  ['pessah', /pess?a[ch]*h?|pessach|paque|pâque|matsa|matza/],
  ['chabbat', /chabb?at|shabb?at|chabat/],
];
// vidéos déjà connues (le flux YouTube ne garde que les 15 dernières) : { id, titre }
const COLIS_KNOWN = [
  ['JT4mw7ZoMfM', '#pessah fête de la liberté N24 colis alimentaires'],
  ['tQV3gzJzqKQ', '#pourim Samea’h N23 colis alimentaires'],
  ['Bf0UHi2-ujg', 'Diffuserlemiraclede #hanouka vidéo#22 Colis pour CHABBAT'],
  ['bxaWSIIfFZo', 'COLIS POUR ROSH ASHANA N21'],
  ['RQZZU7glieI', 'Num.20 COLIS POUR PESSA’H'],
  ['pzY0qjlcAtc', 'COLIS POURIM ET CHABBAT N19'],
  ['NXOcxZAmbiQ', 'COLIS POUR CHABBAT N18'],
  ['u-VUff_nIuQ', 'COLIS POUR CHABBAT N16'],
  ['Dy8u3QwshgU', 'COLIS POUR CHABBAT N17'],
  ['ewA9uGEiTAY', 'QR CODE Mission: HÉBERGEMENT'],
  ['C-Dx14UqYow', 'COLIS POUR CHABBAT N15'],
  ['RHFSfF_FOlg', 'COLIS POUR CHABBAT N14'],
  ['jkwWoFx26v8', 'Campagne de Soutien AIDER NOUS À LES AIDER'],
  ['T7rJ0dsDp78', 'COLIS POUR CHABBAT N13'],
  ['lCzPwTXMfrA', 'COLIS POUR CHABBAT Numéro12 QRCODE'],
  ['17geVrQ51_k', 'COLIS POUR CHABBAT Numéro11 scannez le QRCODE'],
  ['YlHPEHt7oQk', 'QRCODE COLIS POUR #chabbat vidéo#10'],
  ['vW0GKKyyR9Q', 'QR CODE Mission:Hébergement'],
  ['B2EHaKa_pcA', 'Mission : Hébergement'],
  ['RuFuW_M_Hw8', 'COLIS POUR CHABBAT Numéro 9 scannez le QRCODE'],
  ['Y9013Gywh5A', 'COLIS POUR FÊTES/CHABBAT Numéro 8 scannez le QRCODE'],
  ['_60UZfl33ic', 'COLIS POUR les FÊTES/CHABBAT Numéro 7 scanner le QR CODE'],
  ['XyZGXK2ZeZU', 'COLIS POUR CHABBAT Numéro6 scanner le QR CODE'],
  ['1hTNCY_cT8w', 'COLIS POUR CHABBAT Numéro5'],
  ['qm42U3H6K44', '-Hébergement- #vincennes'],
  ['LwuOU6gyT-A', 'PRÉPARATION - DISTRIBUTION COLIS POUR CHABBAT- Numero 3'],
  ['C0w21MYejKg', 'PRÉPARATION-DISTRIBUTION num 2 Colis pour Chabat'],
  ['pVOuJnkYvBU', 'Colis pour Chabat -Préparation-Distribution'],
  ['TdMCfag0TYI', 'Colis pour CHABBAT - Aider son prochain comme soi-même'],
];
let _chanCache = null;
async function channelVideos() { // toutes les vidéos connues de la chaîne, de la plus récente à la plus ancienne : [{ id, title, at }]
  if (_chanCache && Date.now() - _chanCache.at < 30 * 60000) return _chanCache.list;
  const items = new Map();
  COLIS_KNOWN.forEach(([id, title], i) => items.set(id, { title, at: 0 - i }));
  try {
    const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + COLIS_CHANNEL);
    if (r.ok) {
      const x = await r.text();
      for (const m of x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const id = (m[1].match(/<yt:videoId>([^<]+)</) || [])[1], title = (m[1].match(/<title>([^<]*)</) || [])[1] || '';
        const at = Date.parse((m[1].match(/<published>([^<]+)</) || [])[1] || '') || 0;
        if (id) items.set(id, { title: title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"), at });
      }
    }
  } catch (e) { console.error('Chaîne vidéos', e.message); }
  const list = [...items.entries()].map(([id, v]) => ({ id, title: v.title, at: v.at })).sort((a, b) => b.at - a.at);
  _chanCache = { at: Date.now(), list };
  return list;
}
const noAccent = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function cleanTitle(t) { // retire hashtags, B"H, numéros « N24 », nom de l'association
  let c = String(t).replace(/#\S*/g, ' ').replace(/\bB\W{0,2}H\b/gi, ' ').replace(/ASSOCIATION\s+EMOUNATEHA/gi, ' ').replace(/\bEMOUNATEHA\b/gi, ' ').replace(/Diffuserlemiraclede/gi, 'Diffuser le miracle de').replace(/\bQR\s*CODE\b/gi, ' ')
    .replace(/\bN(um)?\.?\s*\d+\b/gi, ' ').replace(/\bnum[ée]ro\s*\d+\b/gi, ' ').replace(/\bvid[ée]o\s*\d+\b/gi, ' ').replace(/\bnum\s*\d+\b/gi, ' ').replace(/@\S+/g, ' ')
    .replace(/[-–—]+\s*(?=[-–—]|$)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, '').trim();
  const letters = c.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters && (c.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length) > 0.6) c = c.toLowerCase();
  c = c.charAt(0).toUpperCase() + c.slice(1);
  return c || String(t).trim();
}
// vidéos rangées à la main dans un onglet précis (le titre ne permet pas de deviner la fête)
const COLIS_FORCE = { 'Y9013Gywh5A': 'simhat-torah' };   // « Colis pour fêtes/Chabbat n°8 » : Simhat Torah
async function colisVideos() { // { fête: [id…] }
  const out = {};
  COLIS_RULES.forEach(([k]) => out[k] = []);
  (await channelVideos()).forEach(v => { const t = noAccent(v.title); const forced = COLIS_FORCE[v.id]; if (forced && out[forced]) { out[forced].push(v.id); return; } for (const [k, re] of COLIS_RULES) if (re.test(t)) { out[k].push(v.id); break; } });
  return out;
}
// les 4 actions de l'association. Vidéos déjà vues et classées une à une (titre propre) ; les nouvelles vidéos sont rangées d'après les mots de leur titre.
const ACTION_RULES = [
  ['reinsertion', /insertion|emploi|travail|formation|stage|autonomie|reconversion|metier/],
  ['vetements', /vetement|habit|coiffure|coiffeur|barbier|friperie|soins?\b|beaute|relooking/],
  ['toit', /hebergement|logement|toit|\bsdf\b|\brue\b|abri|appartement|loger/],
  ['soutien', /soutien|campagne|aider nous|ecoute|accompagnement|ecouter/],
];
const ACTION_CURATED = {
  // un toit sur la tête : « Mission Hébergement »
  'ewA9uGEiTAY': ['toit', 'Mission Hébergement · 4'], 'vW0GKKyyR9Q': ['toit', 'Mission Hébergement · 3'],
  'B2EHaKa_pcA': ['toit', 'Mission Hébergement · 2'], 'qm42U3H6K44': ['toit', 'Hébergement : un studio près de Vincennes'],
  // soutien moral et financier : campagne de soutien. Les vidéos de colis restent sur la page Colis (null = pas sur les pages d'actions)
  'jkwWoFx26v8': ['soutien', 'Campagne de soutien : aidez-nous à les aider'],
  'JT4mw7ZoMfM': [null, ''], 'tQV3gzJzqKQ': [null, ''],
  'bxaWSIIfFZo': [null, ''], 'RQZZU7glieI': [null, ''],
  'pzY0qjlcAtc': [null, ''], 'NXOcxZAmbiQ': [null, ''],
  'Dy8u3QwshgU': [null, ''], 'u-VUff_nIuQ': [null, ''],
  'C-Dx14UqYow': [null, ''], 'RHFSfF_FOlg': [null, ''],
  'T7rJ0dsDp78': [null, ''], 'lCzPwTXMfrA': [null, ''],
  '17geVrQ51_k': [null, ''], 'YlHPEHt7oQk': [null, ''],
  'RuFuW_M_Hw8': [null, ''], 'Y9013Gywh5A': [null, ''],
  '_60UZfl33ic': [null, ''], 'XyZGXK2ZeZU': [null, ''],
  '1hTNCY_cT8w': [null, ''], 'LwuOU6gyT-A': [null, ''],
  'C0w21MYejKg': [null, ''], 'pVOuJnkYvBU': [null, ''],
  'TdMCfag0TYI': [null, ''],
  'Bf0UHi2-ujg': [null, ''],   // Hanouka (allumage public) : reste sur la page des colis
};
const ACTION_FIRST = { soutien: 'jkwWoFx26v8', toit: 'ewA9uGEiTAY' }; // vidéo mise à la une
async function actionVideos() { // { action: [{ id, title }] }
  const out = {};
  ACTION_RULES.forEach(([k]) => out[k] = []);
  (await channelVideos()).forEach(v => {
    const cur = ACTION_CURATED[v.id];
    if (cur) { if (cur[0] && out[cur[0]]) out[cur[0]].push({ id: v.id, title: cur[1] }); return; }
    const t = noAccent(v.title);
    for (const [k, re] of ACTION_RULES) if (re.test(t)) { out[k].push({ id: v.id, title: cleanTitle(v.title) }); break; }
  });
  Object.keys(ACTION_FIRST).forEach(k => { const i = out[k].findIndex(x => x.id === ACTION_FIRST[k]); if (i > 0) out[k].unshift(out[k].splice(i, 1)[0]); });
  return out;
}
let ytLast = 0;
async function syncYoutube(force = false) {
  if (!pool) return { skipped: 'pas de base' };
  if (!force && Date.now() - ytLast < 60 * 60000) return { skipped: 'vérifié il y a moins d’une heure' };
  ytLast = Date.now();
  const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + YT_CHANNEL);
  if (!r.ok) throw new Error('YouTube ' + r.status);
  const xml = await r.text();
  const items = [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>(.*?)<\/yt:videoId>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<published>(.*?)<\/published>/g)].map(m => ({ id: m[1], title: m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), day: new Date(m[3]).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) }));
  const known = (await pool.query('select youtube from public.diffusion where youtube <> \'\'')).rows.map(x => (String(x.youtube).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/) || [])[1]).filter(Boolean);
  let added = 0;
  for (const v of items) {
    if (known.includes(v.id)) continue;
    const name = v.title.replace(/^@Tanya\S*\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    // si une image (Machia'h Now) existe déjà ce jour-là sans vidéo, on lui rattache la vidéo ; sinon nouvelle entrée vidéo
    const same = await pool.query("select id from public.diffusion where day = $1 and data is not null and youtube = '' limit 1", [v.day]);
    if (same.rows.length) await pool.query('update public.diffusion set youtube = $1 where id = $2', ['https://www.youtube.com/watch?v=' + v.id, same.rows[0].id]);
    else await pool.query('insert into public.diffusion (id, day, name, youtube, data) values ($1,$2,$3,$4,null)', [uid(), v.day, name, 'https://www.youtube.com/watch?v=' + v.id]);
    added++;
  }
  return { checked: items.length, added };
}

// ---------- Scheduler ----------
const parisDay = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisHour = () => +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24;
const dayKey = parisDay;
// Quota réel côté Brevo (tous usages du compte confondus : tests, autres envois…)
let brevoCache = { at: 0, n: 0 };
async function brevoToday(force) {
  const k = db.settings.brevoApiKey; if (!k) return 0;
  if (!force && Date.now() - brevoCache.at < 45000) return brevoCache.n;
  try {
    const d = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${d}&endDate=${d}`, { headers: { 'api-key': k, accept: 'application/json' } });
    if (r.ok) brevoCache = { at: Date.now(), n: (await r.json()).requests || 0 };
  } catch {}
  return brevoCache.n;
}
// événements Brevo (livré, ouvert, clic, rebond…) des 30 derniers jours, regroupés par messageId ; cache 45 s
let brevoEvCache = { at: 0, map: new Map(), ok: false };
async function brevoEvents() {
  const k = db.settings.brevoApiKey; if (!k) return brevoEvCache;
  if (Date.now() - brevoEvCache.at < 45000) return brevoEvCache;
  try {
    const end = parisDay(Date.now()), start = parisDay(Date.now() - 30 * 86400000), map = new Map();
    for (let off = 0; off < 30000; off += 2500) {
      const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=2500&offset=${off}&sort=asc&startDate=${start}&endDate=${end}`, { headers: { 'api-key': k, accept: 'application/json' } });
      if (!r.ok) throw new Error('Brevo ' + r.status);
      const ev = (await r.json()).events || [];
      for (const e of ev) {
        const m = map.get(e.messageId) || { delivered: null, opened: 0, firstOpen: null, clicks: 0, firstClick: null, links: [], problem: '', problemAt: null };
        if (e.event === 'delivered') m.delivered = e.date;
        else if (e.event === 'opened' || e.event === 'loadedByProxy') { m.opened++; m.firstOpen ||= e.date; }
        else if (e.event === 'clicks') { m.clicks++; m.firstClick ||= e.date; if (e.link && m.links.length < 12) m.links.push(String(e.link)); }   // « link » : l'adresse cliquée (bouton, désinscription…)
        else if (['hardBounces', 'softBounces', 'blocked', 'invalid', 'spam', 'unsubscribed', 'deferred', 'error'].includes(e.event)) { m.problem = e.event; m.problemAt = e.date; }
        map.set(e.messageId, m);
      }
      if (ev.length < 2500) break;
    }
    brevoEvCache = { at: Date.now(), map, ok: true };
  } catch (e) { console.error('Brevo events', e.message); brevoEvCache = { at: Date.now() - 20000, map: brevoEvCache.map, ok: false }; }
  return brevoEvCache;
}
const usedToday = () => Math.max(sentToday(), brevoCache.n);
const nextMidnight = () => new Date(parisDay(Date.now() + 86400000) + 'T00:00:05+02:00').toISOString(); // minuit heure de Paris (le quota Brevo est de toute façon revérifié)
const sentToday = () => db.sends.filter(x => x.status !== 'error' && dayKey(x.at) === dayKey(Date.now())).length;

// envois qui comptent pour une campagne : on ne compte pas les envois d'une campagne portant le MÊME nom
// (une campagne recréée avec le même nom et le même CSV repart du début). Les autres campagnes restent prises en compte.
function relevantSends(camp) {
  const names = new Map(db.campaigns.map(c => [c.id, c.name]));
  return db.sends.filter(x => x.status !== 'error' && (x.campaignId === camp.id || names.get(x.campaignId) !== camp.name));
}
function dueSends(campaign) {
  const steps = campaign.steps || [];
  if (!steps.length) return [];
  const out = [];
  const tag = (campaign.audienceTag || '').trim().toLowerCase();
  const ok = relevantSends(campaign);
  const byContact = new Map();
  for (const x of ok) { if (!byContact.has(x.contactId)) byContact.set(x.contactId, []); byContact.get(x.contactId).push(x); }
  const gapMs = (db.settings.minGapHours || 0) * 3600000;
  for (const c of db.contacts) {
    if (c.status !== 'active') continue;
    if (tag && !(c.tags || []).map(t => t.toLowerCase()).includes(tag)) continue;
    const all = byContact.get(c.id) || [];
    const last = all.length ? Math.max(...all.map(d => +new Date(d.at))) : 0;
    // 1er step non satisfait : déjà envoyé dans cette campagne, OU même template déjà reçu (toute campagne)
    let idx = 0;
    while (idx < steps.length && all.some(d => d.templateId === steps[idx].templateId)) idx++;
    if (idx >= steps.length) continue;
    const prevInCamp = all.filter(d => d.campaignId === campaign.id);
    if (prevInCamp.length) {
      const lastC = Math.max(...prevInCamp.map(d => +new Date(d.at)));
      if (Date.now() < lastC + (steps[idx].delayDays || 0) * 86400000) continue;
    }
    if (Date.now() < last + gapMs) continue; // jamais 2 mails au même contact dans la fenêtre
    out.push({ contact: c, stepIndex: idx, step: steps[idx] });
  }
  return out;
}

async function sendOne(campaign, { contact, stepIndex, step }) {
  // garde anti-doublon : on revérifie dans la base (pas dans la mémoire de l'instance, peut-être périmée) que ce mail n'est pas déjà parti
  if (pool) {
    try {
      const dup = await pool.query("select 1 from public.sends where campaign_id = $1 and contact_id = $2 and template_id = $3 and status <> 'error' limit 1", [campaign.id, contact.id, step.templateId]);
      if (dup.rows.length) { loadedAt = 0; return { status: 'skipped' }; }
    } catch (e) { console.error('garde doublon', e.message); }
  }
  const t = db.templates.find(x => x.id === step.templateId);
  const rec = { id: uid(), at: now(), campaignId: campaign.id, contactId: contact.id, email: contact.email, stepIndex, templateId: step.templateId };
  try {
    if (!t) throw new Error('Template introuvable');
    const r = await brevoSend({ to: contact.email, toName: contact.firstName, subject: fill(t.subject, contact), html: renderEmail(t, contact, { campaignId: campaign.id, templateId: step.templateId, sendId: rec.id }) });
    rec.status = r.simulated ? 'simulated' : 'sent'; rec.messageId = r.messageId;
  } catch (e) { rec.status = 'error'; rec.error = e.message; if (e.quota) { rec.quota = true; db.settings.pausedUntil = nextMidnight(); } }
  db.sends.push(rec); save();
  return rec;
}

let ticking = false;
async function tick(force = false) {
  if (ticking) return { skipped: 'busy' };
  ticking = true;
  try {
    let yt = null; try { yt = await syncYoutube(force); } catch (e) { yt = { error: e.message }; console.error('YouTube', e.message); }
    const s = db.settings;
    const h = parisHour();
    if (!force && (h < s.hourFrom || h >= s.hourTo)) return { skipped: 'hors plage horaire' };
    if (s.pausedUntil && Date.now() < +new Date(s.pausedUntil)) return { skipped: 'limite Brevo atteinte, reprise demain' };
    await brevoToday(force);
    let budget = Math.min(s.dailyLimit - usedToday(), force ? 50 : s.perMinute);
    await brevoToday(force);
    if (s.dailyLimit - usedToday() <= 0) { s.pausedUntil = nextMidnight(); save(); return { skipped: 'limite du jour atteinte, reprise demain' }; }
    let n = 0, errors = 0;
    const todayStr = parisDay(Date.now());
    for (const c of db.campaigns) if (c.status === 'scheduled' && (!c.startDate || c.startDate <= todayStr)) c.status = 'running';
    for (const c of db.campaigns) if (c.status === 'running' && c.endDate && c.endDate < todayStr) c.status = 'done'; // période terminée
    try { budget -= await chabbatJob(budget); } catch (e) { console.error('Chabbat', e.message); }
    for (const camp of db.campaigns.filter(c => c.status === 'running')) {
      // moteur de répartition : total de la campagne (déjà envoyé + restant) ÷ jours restants = quota du jour (max dailyLimit),
      // puis le quota du jour est étalé minute par minute sur la plage horaire (hourFrom → hourTo)
      let campCap = Infinity;
      if (camp.endDate) {
        const daysLeft = Math.max(1, Math.round((new Date(camp.endDate) - new Date(todayStr)) / 86400000) + 1);
        const sentC = db.sends.filter(x => x.campaignId === camp.id && x.status !== 'error' && dayKey(x.at) === dayKey(Date.now())).length;
        const sentTot = db.sends.filter(x => x.campaignId === camp.id && x.status !== 'error').length;
        const dayQuota = Math.min(db.settings.dailyLimit, Math.ceil((remaining(camp) + sentTot) / daysLeft));
        const winMin = Math.max(1, (db.settings.hourTo - db.settings.hourFrom) * 60);
        const nowMin = (+new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24) * 60 + (+new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', minute: 'numeric' }));
        const elapsed = Math.min(winMin, Math.max(0, nowMin - db.settings.hourFrom * 60));
        const allowedSoFar = Math.ceil(dayQuota * elapsed / winMin);
        campCap = Math.max(0, allowedSoFar - sentC);
      }
      const due = dueSends(camp);
      if (!due.length && !pendingCount(camp)) camp.status = 'done'; // plus rien à envoyer ni en attente de délai
      for (const d of due) {
        if (budget <= 0 || campCap <= 0) break;
        const r = await sendOne(camp, d);
        if (r.quota) { budget = 0; break; }
        if (r.status === 'skipped') continue; // déjà envoyé (doublon évité)
        if (r.status === 'error') { errors++; if (errors >= 3) { budget = 0; } } else { budget--; campCap--; n++; }
        await new Promise(r => setTimeout(r, 250));
      }
    }
    save();
    return { sent: n, errors, youtube: yt };
  } finally { ticking = false; }
}

function remaining(camp) { // nombre de mails encore à envoyer
  const tag = (camp.audienceTag || '').trim().toLowerCase();
  let n = 0;
  for (const c of db.contacts) {
    if (c.status !== 'active') continue;
    if (tag && !(c.tags || []).map(t => t.toLowerCase()).includes(tag)) continue;
    const got = new Set(relevantSends(camp).filter(x => x.contactId === c.id).map(x => x.templateId));
    n += (camp.steps || []).filter(st => !got.has(st.templateId)).length;
  }
  return n;
}
function pendingCount(camp) {
  const tag = (camp.audienceTag || '').trim().toLowerCase();
  const steps = camp.steps || [];
  let p = 0;
  for (const c of db.contacts) {
    if (c.status !== 'active') continue;
    if (tag && !(c.tags || []).map(t => t.toLowerCase()).includes(tag)) continue;
    const got = new Set(relevantSends(camp).filter(x => x.contactId === c.id).map(x => x.templateId));
    if (steps.some(st => !got.has(st.templateId))) p++;
  }
  return p;
}


// ---------- Horaires de Chabbat et des fêtes par email ----------
const CITIES = [['Yérouchalayim', 281184, 40], ['Tel Aviv-Netanya', 293397, 18], ['Haïfa', 294801, 30], ['Ashdod', 295629, 18], ['Netanya', 294071, 18], ['Beer-Sheva', 295530, 18], ['Eilat', 295277, 18], ['Tsfat', 293100, 18], ['Tibériade', 293322, 18], ['Paris', 2988507, 18], ['Sarcelles', 2976043, 18], ['Créteil', 3022530, 18], ['Boulogne-Billancourt', 3031137, 18], ['Versailles', 2969679, 18], ['Lyon', 2996944, 18], ['Marseille', 2995469, 18], ['Nice', 2990440, 18], ['Cannes', 3028808, 18], ['Aix-en-Provence', 3038354, 18], ['Montpellier', 2992166, 18], ['Toulouse', 2972315, 18], ['Bordeaux', 3031582, 18], ['Nantes', 2990969, 18], ['Lille', 2998324, 18], ['Strasbourg', 2973783, 18], ['Metz', 2994160, 18], ['Nancy', 2990999, 18], ['Grenoble', 3014728, 18], ['Genève', 2660646, 18], ['Zurich', 2657896, 18], ['Bruxelles', 2800866, 18], ['Anvers', 2803138, 18], ['Londres', 2643743, 18], ['Manchester', 2643123, 18], ['Milan', 3173435, 18], ['Rome', 3169070, 18], ['Madrid', 3117735, 18], ['Barcelone', 3128760, 18], ['Casablanca', 2553604, 18], ['Tunis', 2464470, 18], ['Johannesburg', 993800, 18], ['New York', 5128581, 18], ['Miami', 4164138, 18], ['Los Angeles', 5368361, 18], ['Boston', 4930956, 18], ['Montréal', 6077243, 18], ['Toronto', 6167865, 18], ['Mexico', 3530597, 18], ['Buenos Aires', 3435910, 18], ['São Paulo', 3448439, 18], ['Sydney', 2147714, 18], ['Melbourne', 2158177, 18]];
const ISRAEL = new Set([281184, 293397, 294801, 295629, 294071, 295530, 295277, 293100, 293322]);
const cityById = id => CITIES.find(c => String(c[1]) === String(id)) || CITIES[0];
const cityOfContact = c => { const t = (c.tags || []).find(x => /^ville:\d+$/.test(x)); return cityById(t ? t.slice(6) : 2988507); };
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const clean = t => String(t || '').replace(/[̀-ͯ]/g, '').replace(/H̲/g, 'H').replace(/Hechvan/g, "Mar'Hechvan").replace(/Kislav/g, 'Kislev');
const fmtH = (iso, tz) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).replace(':', ' h ');
const fmtD = (iso, tz) => cap1(new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }));
const ymdTz = (iso, tz) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: tz });
const SKIP_FETE = /^(Hag HaBanot|Roch Hachanah LaBehemot|Lel Selihot|Yom HaAliyah|Family Day|Sigd|Yom HaShoah VeHaGevurah)/i;

// horaires + fêtes des `days` prochains jours pour une ville (API Hebcal)
let calCache = null;
async function getCal() {
  if (calCache && Date.now() - calCache.at < 12 * 3600 * 1000) return calCache.v;
  const base = ((db && db.settings && db.settings.publicUrl) || 'https://www.emounateha.fr').replace(/\/$/, '');
  const r = await fetch(base + '/calendrier-hebraique.json'); if (!r.ok) return null;
  const v = await r.json(); calCache = { at: Date.now(), v }; return v;
}
const tmTxt = (e, tz) => e && e.txt ? e.txt.replace(':', ' h ') : fmtH(e.at, tz);
async function hebcalWeek(city, days = 8, shiftDays = 0) {
  const t0 = Date.now() + shiftDays * 86400000;
  const start = parisDay(t0), end = parisDay(t0 + days * 86400000);
  const u = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=off&nx=on&s=on&ss=on&mf=off&c=on&geonameid=${city[1]}&M=on&b=${city[2]}&lg=fr&i=${ISRAEL.has(city[1]) ? 'on' : 'off'}&start=${start}&end=${end}`;
  let j = null;
  try { const r = await fetch(u); if (r.ok) j = await r.json(); } catch (e) { j = null; }
  if (!j || !Array.isArray(j.items)) {
    // Hebcal en panne : le flux Chabad.org prend le relais (sans la parachat, qu'il ne donne pas)
    const lieu = CHABAD_LIEUX[String(city[1])];
    if (!lieu) throw new Error('Hebcal indisponible');
    j = { location: { tzid: 'UTC' }, items: [] };
    for (let t = new Date(start + 'T12:00:00Z').getTime(), last = new Date(end + 'T12:00:00Z').getTime(); t <= last; t += 86400000) {
      const day = parisDay(t), wd = new Date(day + 'T12:00:00Z').getUTCDay();
      if (wd !== 5 && wd !== 6) continue;
      try {
        const z = await chabadZmanim(lieu, day, city[2]);
        const it = z.items.find(x => wd === 5 ? /Allumage|bougies/i.test(x.label) : /Fin du Chabbat|Fin de (la )?f[êe]te/i.test(x.label));
        if (it) j.items.push({ category: wd === 5 ? 'candles' : 'havdalah', date: day + 'T' + it.time + ':00' });
      } catch (e) { /* jour ignoré */ }
    }
    if (!j.items.length) throw new Error('Hebcal et Chabad indisponibles');
  }
  const tz = (j.location && j.location.tzid) || 'Europe/Paris';
  const ev = [];
  for (const it of j.items || []) {
    const day = String(it.date).slice(0, 10);
    if (it.category === 'candles') ev.push({ day, kind: 'candles', at: it.date });
    else if (it.category === 'havdalah') ev.push({ day, kind: 'havdalah', at: it.date });
    else if (it.category === 'parashat') ev.push({ day, kind: 'parasha', title: clean(it.title).replace(/^Parachah?\s*/i, 'Parachat ') });
    else if (it.category === 'roshchodesh') ev.push({ day, kind: 'rh', title: clean(it.title).replace(/^Roch Hodech\s*/i, '') });
    else if (it.category === 'mevarchim') ev.push({ day, kind: 'mevarchim', title: clean(it.title).replace(/^Mevarchim Chodesh\s*/i, '') });
    else if (it.category === 'holiday' && !SKIP_FETE.test(it.title)) {
      let t = clean(it.title).split(':')[0].replace(/\s*\(.*\)$/, '').trim();
      t = t.replace(/^Erev\s+(.+)$/i, 'Veille de $1');
      if (!ev.some(e => e.kind === 'fete' && e.day === day && e.title === t)) ev.push({ day, kind: 'fete', title: t, yomtov: !!it.yomtov });
    }
  }
  // Roch Hodech : depuis le calendrier hébraïque du site (1 ou 2 jours), sinon Hebcal
  try {
    const cal = await getCal();
    if (cal) {
      const shift = (d, n) => parisDay(new Date(d + 'T12:00:00Z').getTime() + n * 86400000);
      const rh = [];
      for (let t = new Date(start + 'T12:00:00Z').getTime(), last = new Date(end + 'T12:00:00Z').getTime(); t <= last; t += 86400000) {
        const day = parisDay(t), e = cal[day]; if (!e) continue;
        if (e[2] === 30) { const nx = cal[shift(day, 1)]; if (nx && nx[2] === 1) rh.push({ day, kind: 'rh', title: nx[3] }); }
        else if (e[2] === 1 && e[3] !== 'Tichri') rh.push({ day, kind: 'rh', title: e[3] });
      }
      for (let i = ev.length - 1; i >= 0; i--) if (ev[i].kind === 'rh') ev.splice(i, 1);
      ev.push(...rh);
    }
  } catch (e) { /* on garde Hebcal */ }
  // horaires d'allumage / sortie : flux RSS Chabad.org (source unique)
  const lieu = CHABAD_LIEUX[String(city[1])];
  if (lieu) {
    for (const e of ev) {
      if (e.kind !== 'candles' && e.kind !== 'havdalah') continue;
      try {
        const z = await chabadZmanim(lieu, e.day, city[2]);
        const it = z.items.find(x => e.kind === 'candles' ? /Allumage|bougies/i.test(x.label) : /Fin du Chabbat|Fin de (la )?f[êe]te|Sortie|Havdala/i.test(x.label));
        if (it && /^\d{1,2}:\d{2}$/.test(it.time)) e.txt = it.time;
      } catch (err) { /* repli : horaire Hebcal */ }
    }
  }
  ev.sort((a, b) => (a.day + (a.at || '')).localeCompare(b.day + (b.at || '')));
  return { tz, ev };
}

// email « horaires de la semaine » : carte propre avec allumage des bougies, sortie, parachat, fêtes
function salutation(c) {
  const civ = ((c && c.tags) || []).find(x => /^civ:/.test(x)); const nom = (c && c.lastName || '').trim(), pre = (c && c.firstName || '').trim();
  if (civ === 'civ:M') return 'Bonjour Monsieur' + (nom ? ' ' + nom : '') + ',';
  if (civ === 'civ:Mme') return 'Bonjour Madame' + (nom ? ' ' + nom : '') + ',';
  return 'Bonjour' + (pre ? ' ' + pre : '') + ',';
}

// email « horaires de la semaine » : tout à plat, filets dorés, deux colonnes entrée / sortie, Roch Hodech mis en avant
function chabbatTemplate(city, wk, mode, contact) {
  const { tz, ev } = wk;
  const can = ev.filter(e => e.kind === 'candles'), hav = ev.filter(e => e.kind === 'havdalah');
  const par = ev.find(e => e.kind === 'parasha'), fetes = ev.filter(e => e.kind === 'fete'), mev = ev.find(e => e.kind === 'mevarchim');
  const rhs = ev.filter(e => e.kind === 'rh');
  const firstCandle = can[0];
  const G = '#d6b862', T = '#1f6a72';
  const hr = `<div style="height:1px;background:${G};margin:16px 0;line-height:1px;font-size:1px;">&nbsp;</div>`;
  const cell = (kind, e, border) => `<td width="50%" valign="top" class="${kind === 'in' ? 'cb-in' : 'cb-in2'}" style="padding:4px 4px;text-align:center;${border ? 'border-left:1px solid ' + G + ';' : ''}">
      <div style="font-size:11.5px;letter-spacing:2px;text-transform:uppercase;color:#8a9a9d;">${kind === 'in' ? '<span class="cb-flame">🕯️</span> Entrée' : '<span class="cb-flame">✨</span> Sortie'}</div>
      ${e ? `<div class="cb-time" style="font-family:Georgia,serif;font-size:36px;line-height:1.1;font-weight:bold;color:${T};margin:6px 0 3px;white-space:nowrap;">${esc(tmTxt(e, tz)).replace(/ /g, '&nbsp;')}</div><div class="cb-date" style="font-size:12px;letter-spacing:0;white-space:nowrap;color:#51666a;">${esc(fmtD(e.at, tz))}</div>` : '<div style="font-size:22px;color:#c3cfd1;margin-top:10px;">—</div>'}</td>`;
  const pairs = []; let open = null;
  for (const e of ev) { if (e.kind === 'candles') { if (open) pairs.push({ i: open }); open = e; } else if (e.kind === 'havdalah') { pairs.push({ i: open, o: e }); open = null; } }
  if (open) pairs.push({ i: open });
  // une seule ligne entrée / sortie : le Chabbat de la semaine (les fêtes peuvent en avoir plusieurs, mais jamais d'entrée sans sortie)
  const shown = mode === 'yomtov' ? (pairs.some(p => p.o) ? pairs.filter(p => p.o) : pairs) : pairs.slice(0, 1);
  const sched = shown.map((p, k) => (k ? hr : '') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cell('in', p.i, false)}${cell('out', p.o, true)}</tr></table>`).join('')
    || '<p style="text-align:center;color:#8a9a9d;">Horaires indisponibles pour le moment.</p>';
  const head = `<div style="text-align:center;margin:4px 0 14px;"><div style="font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:#b0902f;">${esc(city[0])}</div>${par ? `<div style="font-family:Georgia,serif;font-size:19px;color:${T};margin-top:3px;">${esc(par.title)}</div>` : ''}${mev ? `<div style="font-size:13px;color:#51666a;margin-top:2px;">Chabbat Mévarkhim ${esc(mev.title)}</div>` : ''}</div>`;
  let rh = '';
  if (rhs.length) {
    const nm = rhs[0].title, days = rhs.map(r => r.day);
    const dline = days.length === 1 ? fmtD(days[0] + 'T12:00:00', tz) : cap1(new Date(days[0] + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', timeZone: tz })) + ' et ' + new Date(days[days.length - 1] + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
    rh = hr + `<div class="cb-rh" style="text-align:center;padding:2px 10px;"><div style="font-family:Georgia,serif;font-size:22px;line-height:1.25;font-weight:bold;color:#b0902f;">Roch Hodech ${esc(nm)}</div><div style="font-size:14px;color:#51666a;margin-top:3px;">${esc(dline)}</div></div>`;
  }
  const grp = [];
  for (const f of fetes) { const g = grp.find(x => x.title === f.title && (new Date(f.day) - new Date(x.days[x.days.length - 1])) <= 86400000 * 1.5); if (g) g.days.push(f.day); else grp.push({ title: f.title, days: [f.day] }); }
  const dTxt = g => g.days.length === 1 ? fmtD(g.days[0] + 'T12:00:00', tz) : cap1(new Date(g.days[0] + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', timeZone: tz })) + ' et ' + new Date(g.days[g.days.length - 1] + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
  const fl = grp.length ? hr + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + grp.map(f => `<tr><td style="padding:5px 8px;font-size:14px;color:#51666a;">${esc(dTxt(f))}</td><td style="padding:5px 8px;font-size:14px;font-weight:bold;color:${T};text-align:right;">🕎 ${esc(f.title)}</td></tr>`).join('') + '</table>' : '';
  const card = head + sched + rh + fl + hr +
    `<p class="ink" style="margin:0 0 2px;font-size:10px;line-height:1.4;color:#b9c2c4 !important;text-align:center;">Source : fr.chabad.org</p>`;
  const ytNow = mode === 'yomtov';
  const subject = ytNow ? `🕯️ Ce soir : allumage des bougies à ${firstCandle ? tmTxt(firstCandle, tz) : ''} — ${city[0]}`
    : `Horaires de Chabbat — ${city[0]}${par ? ' · ' + par.title : ''}`;
  const intro = ytNow ? 'Ce soir, nous entrons dans la fête. Voici les horaires pour ' + city[0] + ' :'
    : `Voici les horaires de Chabbat${grp.length ? ' et des fêtes' : ''} de cette semaine pour ${city[0]} :`;
  return { subject, preheader: firstCandle ? `Allumage des bougies : ${fmtD(firstCandle.at, tz)} à ${tmTxt(firstCandle, tz)}` : 'Les horaires de la semaine',
    title: 'Chabbat Chalom !', body: salutation(contact) + '\n\n' + intro, extraHtml: card,
    extraCss: '@keyframes cb-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes cb-flame{0%{opacity:.72;transform:scale(.94)}100%{opacity:1;transform:scale(1.1)}}@keyframes cb-glow{0%,100%{opacity:.85}50%{opacity:1}}.cb-in{animation:cb-rise .8s ease both}.cb-in2{animation:cb-rise .8s .3s ease both}.cb-flame{display:inline-block;animation:cb-flame 1.3s ease-in-out infinite alternate}.cb-rh{animation:cb-glow 3s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.cb-in,.cb-in2,.cb-flame,.cb-rh{animation:none}}',
    buttonText: 'Changer de ville', buttonSmall: true, buttonUrl: (db.settings.publicUrl || '').replace(/\/$/, '') + '/horaires/' + (contact && contact.id && contact.id !== 'preview' && contact.id !== 'test' ? '?abo=' + encodeURIComponent(contact.id) : ''), color: '#1f6a72', accent: '#c4a24a' };
}

async function sendChabbat(contact, key, mode, cache) {
  const city = cityOfContact(contact);
  const ck = city[1]; if (!cache[ck]) cache[ck] = await hebcalWeek(city);
  const t = chabbatTemplate(city, cache[ck], mode, contact);
  const rec = { id: uid(), at: now(), campaignId: 'chabbat', contactId: contact.id, email: contact.email, stepIndex: 0, templateId: key };
  try {
    const r = await brevoSend({ to: contact.email, toName: contact.firstName, subject: fill(t.subject, contact), html: renderEmail(t, contact, { campaignId: 'chabbat', templateId: key, sendId: rec.id }) });
    rec.status = r.simulated ? 'simulated' : 'sent'; rec.messageId = r.messageId;
  } catch (e) { rec.status = 'error'; rec.error = e.message; if (e.quota) { rec.quota = true; db.settings.pausedUntil = nextMidnight(); } }
  db.sends.push(rec); save(); return rec;
}

// appelé à chaque tick : jeudi dès 10 h (Chabbat + fêtes de la semaine) ; veille d'une fête en semaine (allumage des bougies)
async function chabbatJob(budget) {
  if (budget <= 0) return 0;
  const today = parisDay(Date.now()), h = parisHour();
  const wd = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 = dimanche … 4 = jeudi
  if (h < 10) return 0;   // jeudi : envoi principal dès 19 h ; vendredi : rappel dès 10 h
  const subs = db.contacts.filter(c => c.status === 'active' && (c.tags || []).map(x => x.toLowerCase()).includes('chabbat'));
  if (!subs.length) return 0;
  const got = new Set(db.sends.filter(x => x.status !== 'error').map(x => x.contactId + '|' + x.templateId));
  const cache = {}; let n = 0, errors = 0;
  const jobs = [];
  // mail de la semaine : jeudi soir dès 19 h ; rappel le vendredi dès 10 h (jusqu'à 15 h)
  if (wd === 4 && h >= 19) jobs.push({ key: 'chabbat-' + today, mode: 'weekly' });
  if (wd === 5 && h < 15) jobs.push({ key: 'chabbat-rappel-' + today, mode: 'weekly' });
  jobs.push({ key: 'chabbat-fete-' + today, mode: 'yomtov', onlyIfEveToday: true });
  for (const job of jobs) {
    for (const c of subs) {
      if (n >= budget || errors >= 3) return n;
      if (got.has(c.id + '|' + job.key)) continue;
      if (job.onlyIfEveToday && got.has(c.id + '|chabbat-' + today)) continue; // déjà reçu le mail de la semaine aujourd'hui
      if (job.onlyIfEveToday) { // allumage de bougies aujourd'hui, un jour qui n'est pas vendredi (fête en semaine)
        const city = cityOfContact(c); if (!cache[city[1]]) cache[city[1]] = await hebcalWeek(city);
        const wk = cache[city[1]];
        if (!wk.ev.some(e => e.kind === 'candles' && e.day === today && wd !== 5)) continue;
        wk.ev = wk.ev.filter(e => e.day >= today && e.day <= parisDay(Date.now() + 3 * 86400000));
      }
      let r;
      try { r = await sendChabbat(c, job.key, job.mode, cache); } catch (e) { errors++; console.error('Chabbat', e.message); continue; }
      if (r.status === 'error') { errors++; if (r.quota) return n; } else { n++; got.add(c.id + '|' + job.key); }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  return n;
}

// inscription publique : ajoute au CRM (tag « chabbat » + ville) ; anti-spam simple
const subHits = new Map();
async function shabbatSubscribe(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const nowMs = Date.now(), hits = (subHits.get(ip) || []).filter(t => nowMs - t < 3600000);
  if (hits.length >= 8) return send(res, 429, { error: 'Trop de tentatives, réessayez plus tard.' });
  subHits.set(ip, [...hits, nowMs]);
  const b = await readBody(req);
  if (b.website) return send(res, 200, { ok: true }); // champ piège : un robot l'a rempli
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Adresse email invalide' });
  const city = cityById(b.city), vtag = 'ville:' + city[1];
  const civ = b.civility === 'Mme' ? 'civ:Mme' : b.civility === 'M' ? 'civ:M' : '';
  const clip = v => String(v || '').trim().replace(/[<>]/g, '').slice(0, 60);
  const firstName = clip(b.firstName), lastName = clip(b.lastName);
  let c = db.contacts.find(x => x.email.toLowerCase() === email);
  if (c) {
    c.tags = [...new Set([...(c.tags || []).filter(t => !/^(ville|civ):/.test(t)), 'chabbat', vtag, ...(civ ? [civ] : [])])];
    if (firstName) c.firstName = firstName; if (lastName) c.lastName = lastName;
    if (c.status === 'unsubscribed') c.status = 'active'; // il s'inscrit lui-même à nouveau
  } else {
    c = { id: uid(), createdAt: now(), email, firstName, lastName, phone: '', status: 'active', tags: ['chabbat', vtag, ...(civ ? [civ] : [])], notes: 'Inscrit via le site (horaires de Chabbat par email)' };
    db.contacts.push(c);
  }
  save();
  // premier envoi tout de suite (confirme l'adresse et montre le format). Il part AVANT la réponse :
  // sur Vercel, tout ce qui suit la réponse peut être coupé (l'e-mail n'arrivait jamais).
  const key = 'chabbat-bienvenue';
  const room = db.settings.dailyLimit - usedToday() > 25 && !(db.settings.pausedUntil && Date.now() < +new Date(db.settings.pausedUntil)); // on garde de la marge pour les envois planifiés
  let envoye = false;
  if (room && !db.sends.some(x => x.contactId === c.id && x.templateId === key && (x.status === 'sent' || x.status === 'simulated'))) {
    try { const r = await Promise.race([sendChabbat(c, key, 'weekly', {}), new Promise((_, no) => setTimeout(() => no(new Error('délai dépassé')), 20000))]); envoye = r && r.status === 'sent'; }
    catch (e) { console.error('Chabbat bienvenue', e.message); }
  }
  send(res, 200, { ok: true, city: city[0], emailEnvoye: envoye });
}


// ---------- Lettre au Rabbi : formulaire du site -> email (Brevo) vers l'Ohel ----------
const letterHits = new Map();
async function rabbiLetter(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const t0 = Date.now(), hits = (letterHits.get(ip) || []).filter(t => t0 - t < 3600000);
  if (hits.length >= 5) return send(res, 429, { error: 'Trop d\'envois, réessayez dans une heure.' });
  letterHits.set(ip, [...hits, t0]);
  const b = await readBody(req);
  if (b.website) return send(res, 200, { ok: true }); // champ piège
  const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n); // pas de retrait de < > : le HTML du récapitulatif est échappé, le texte simple n'en a pas besoin
  const name = clip(b.name, 90), heb = clip(b.heb, 60), mother = clip(b.mother, 60), city = clip(b.city, 60), phone = clip(b.phone, 30);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const message = String(b.message || '').trim().slice(0, 4000);
  if (!name || !heb || !mother || !city || phone.replace(/\D/g, '').length < 6 || message.length < 5) return send(res, 400, { error: 'Tous les champs sont obligatoires.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Adresse email invalide.' });
  if (!b.consent) return send(res, 400, { error: 'Merci de cocher l\'autorisation d\'envoi.' });
  const e = esc;
  const to = envVar('RABBI_LETTER_TO') || db.settings.rabbiLetterTo || 'ohel@ohelchabad.org';
  // email en texte simple (pas de HTML), lisible tel quel par l'Ohel
  const text = 'Lettre pour le Rabbi\n\nNom et prénom : ' + name + '\nPrénom hébraïque : ' + heb + '\nPrénom hébraïque de la mère : ' + mother + '\nEmail : ' + email + (city ? '\nVille : ' + city : '') + (phone ? '\nTéléphone : ' + phone : '') + '\n\nLettre :\n\n' + message + '\n';
  try {
    await brevoSend({ to, subject: 'Lettre pour le Rabbi — ' + name, text, replyToEmail: email, replyToName: name });
    // mail de récapitulatif pour l'expéditeur (HTML) : nom, prénoms, lettre ; l'Ohel, lui, reçoit du texte simple
    const base = (db.settings.publicUrl || 'https://www.emounateha.fr').replace(/\/$/, '');
    const row = (k, v) => `<tr><td style="padding:4px 10px 4px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap;">${e(k)}</td><td style="padding:4px 0;font-size:15px;color:#111827;">${e(v)}</td></tr>`;
    const recap = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;width:100%;">${row('Nom et prénom', name)}${row('Prénom hébraïque', heb)}${row('Prénom hébraïque de la mère', mother)}${row('Ville', city)}${row('Email', email)}${row('Téléphone', phone)}</table>` +
      `<div style="margin:0 0 6px;padding:14px 16px;border-left:3px solid #c4a24a;background:#fbf6e6;border-radius:6px;font-size:15px;line-height:1.6;color:#111827;white-space:pre-wrap;">${e(message)}</div>`;
    const copy = renderEmail({ subject: 'Votre lettre a bien été envoyée au Rabbi', preheader: 'Votre lettre a bien été envoyée au Rabbi', title: 'Votre lettre a bien été envoyée', color: '#1f6a72', accent: '#c4a24a',
      body: 'Bonjour ' + name + ',\n\nVotre lettre a bien été envoyée au Rabbi. Voici le récapitulatif de ce que vous avez écrit :',
      extraHtml: recap, buttonText: 'Participer à nos missions', buttonUrl: 'https://don.emounateha.fr/' }, { firstName: name, lastName: '', email, id: 'letter-copy' });
    await brevoSend({ to: email, toName: name, subject: 'Votre lettre a bien été envoyée au Rabbi', html: copy }).catch(() => {});
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, { ok: true });
  } catch (err) { console.error('Lettre Rabbi : échec d\'envoi'); /* jamais le contenu ni l'erreur détaillée (peut citer le texte) */ send(res, 502, { error: 'L\'envoi a échoué. Réessayez dans un instant.' }); }
}


const CHABAD_LIEUX = {"281184":"247","293397":"531","294801":"689","295629":"699","294071":"694","295530":"688","295277":"687","293322":"697","2988507":"394","2969679":"1187","2996944":"310","2995469":"322","2990440":"677","3028808":"678","2972315":"638","3031582":"70","2998324":"707","2973783":"759","2660646":"190","2657896":"611","2800866":"86","2803138":"24","2643743":"300","2643123":"316","3173435":"332","3169070":"449","3117735":"314","3128760":"44","2553604":"109","2464470":"547","993800":"248","5128581":"370","4164138":"331","5368361":"304","4930956":"71","6077243":"345","6167865":"540","3530597":"330","3435910":"90","3448439":"476","2147714":"523","2158177":"327","2976043":"394","3022530":"394","3031137":"394"}; // geonameid -> locationId Chabad.org (villes sans entrée : repli Hebcal)
// ---------- Horaires halakhiques : flux RSS de fr.chabad.org (source unique : site, mails, tableau) ----------
const zCache = new Map();
const decEnt = t => String(t || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// renvoie { loc, hebrew, items:[{label, time}] } pour un lieu Chabad (locationId) et un jour (YYYY-MM-DD)
async function chabadZmanim(id, ymd, before = 18) {
  id = String(id).replace(/\D/g, ''); if (!id) throw new Error('lieu inconnu');
  const key = id + '|' + ymd + '|' + before, hit = zCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.v;
  const [y, m, d] = ymd.split('-');
  const u = `https://fr.chabad.org/tools/rss/zmanim.xml?locationId=${id}&locationType=1&bDef=0&before=${before}&tdate=${+m}/${+d}/${y}`;
  let r, t;
  for (let i = 0; i < 3; i++) {
    r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15' } });
    if (r.status !== 429 && r.status < 500) break;
    await new Promise(x => setTimeout(x, 500 * (i + 1)));
  }
  if (!r.ok) throw new Error('Chabad ' + r.status);
  t = await r.text();
  const head = t.match(/<title>Zemanim - Horaires Halakhiques pour ([^<]*?) pour [^<]*<\/title>/);
  const items = [...t.matchAll(/<item>[\s\S]*?<category>([^<]*)<\/category>[\s\S]*?<title>([^<]*)<\/title>/g)].map(x => {
    const time = decEnt(x[1]).trim(), label = decEnt(x[2]).replace(/\s*-\s*[0-9:]+(?:\s*min\.)?\s*--.*$/, '').trim();
    return { label, time };
  }).filter(x => x.label && x.time);
  if (!items.length) throw new Error('aucun horaire');
  const v = { loc: head ? decEnt(head[1]).trim() : '', hebrew: decEnt((t.match(/<hebrew_date>([^<]*)<\/hebrew_date>/) || [])[1] || ''), items };
  zCache.set(key, { at: Date.now(), v });
  return v;
}


// ---------- Étude du jour (Houmach, Téhilim, Tanya) : flux RSS « Daily Study » de fr.chabad.org ----------
const etudeCache = new Map();
// jour demandé (AAAA-MM-JJ) ; par défaut le jour à Paris. Le flux Chabad sans date suit l'heure de New York : on passe toujours tdate.
const jourValide = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Math.abs(new Date(d + 'T12:00:00Z') - Date.now()) < 3 * 86400000 ? d : '';
// Le jour hébraïque change à Tset Hakokhavim (tombée de la nuit à Paris), pas à minuit : une fois la nuit tombée, le « jour » est celui de demain
// (date hébraïque, Houmach, Téhilim, Tanya). La date civile, elle, reste celle de Paris et change à minuit.
const tzCache = new Map([['2988507', 'Europe/Paris']]);
async function fuseauDe(geo) {   // fuseau horaire de la ville (Hebcal), gardé en mémoire
  if (tzCache.has(geo)) return tzCache.get(geo);
  const j = await (await fetch(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${geo}&date=${parisDay(Date.now())}`)).json();
  const tz = j.location && j.location.tzid; if (!tz) throw new Error('fuseau inconnu');
  tzCache.set(geo, tz); return tz;
}
// geo = ville de référence du visiteur (geonameid, mémorisée dans son navigateur après localisation) ; Paris par défaut
async function jourHebraique(geo) {
  geo = String(geo || '').replace(/\D/g, ''); if (!CHABAD_LIEUX[geo]) geo = '2988507';
  const now = Date.now(); let tz = 'Europe/Paris', tzeit = null;
  try { tz = await fuseauDe(geo); } catch (e) { if (geo !== '2988507') { geo = '2988507'; tz = 'Europe/Paris'; } }
  const jourA = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: tz }), today = jourA(now);
  try { const z = await chabadZmanim(CHABAD_LIEUX[geo], today), it = z.items.find(x => /Tset Hakokhavim|Tombée de la nuit/i.test(x.label)); if (it && /^\d{1,2}:\d{2}$/.test(it.time)) tzeit = it.time; } catch (e) { /* horaires indisponibles : on garde le jour civil */ }
  const hm = new Date(now).toLocaleTimeString('sv-SE', { timeZone: tz, hour12: false }).slice(0, 5);
  const apres = !!tzeit && hm.padStart(5, '0') >= tzeit.padStart(5, '0');
  return { jour: apres ? jourA(new Date(today + 'T12:00:00Z').getTime() + 86400000) : today, civil: today, tzeit, apres, geo };
}
const jourEtude = async (d, geo) => jourValide(d) || (await jourHebraique(geo)).jour;
async function chabadEtude(jour) {
  jour = await jourEtude(jour);
  const hit = etudeCache.get(jour);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.v;
  const [y, m, d] = jour.split('-');
  const r = await fetch(`https://fr.chabad.org/tools/rss/dailystudy_rss.xml?tdate=${+m}/${+d}/${y}`, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15' } });
  if (!r.ok) throw new Error('Chabad ' + r.status);
  const t = await r.text();
  const g = (b, k) => decEnt(((b.match(new RegExp('<' + k + '>([\\s\\S]*?)</' + k + '>')) || [])[1] || '')).replace(/&apos;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(x => ({ title: g(x[1], 'title'), desc: g(x[1], 'description'), link: g(x[1], 'link') }));
  const pick = re => items.find(i => re.test(i.title));
  const v = { date: g(t, 'title').replace(/^Chabad\.org Daily Study - /, ''), houmach: pick(/Chumash/i) || null, tehilim: pick(/^Daily Tehilim - Psalms$/i) || null, tehilimHeb: pick(/\(Hebrew\)/i) && items.find(i => /Tehilim - Psalms \(Hebrew\)/i.test(i.title)) || null, tanya: pick(/Tanya/i) || null };
  if (!v.houmach && !v.tehilim && !v.tanya) throw new Error('flux vide');
  etudeCache.set(jour, { at: Date.now(), v }); if (etudeCache.size > 10) etudeCache.delete(etudeCache.keys().next().value);
  return v;
}

// ---------- Texte intégral de l'étude du jour (Sefaria : hébreu + français pour Houmach/Téhilim, hébreu + anglais pour le Tanya) ----------
const texteCache = new Map();
const noAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cleanTxt = t => decEnt(String(t || '').replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<i class="footnote"[\s\S]*?<\/i>/g, '').replace(/<[^>]+>/g, '').replace(/&(?:thinsp|nbsp|ensp|emsp);/g, ' ')).replace(/\s+/g, ' ').trim();
async function sefaria(ref, q) {
  const r = await fetch('https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(ref) + '?' + q, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15' } });
  if (!r.ok) throw new Error('Sefaria ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  const he = (j.versions || []).find(v => v.language === 'he'), tr = (j.versions || []).find(v => v.language !== 'he');
  return { he: he ? he.text : [], tr: tr ? tr.text : [], trLang: tr && /\[fr\]/.test(tr.versionTitle) ? 'fr' : 'en' };
}
// aplatit [[v,v],[v]] ou [v,v] en sections numérotées
function sections(he, tr, c0, v0, label) {
  const deep = Array.isArray(he[0]);
  const chs = deep ? he : [he], trs = deep ? tr : [tr];
  return chs.map((ch, ci) => ({
    head: label ? (label + ' ' + (c0 + ci)) : '', headHe: label ? gem(c0 + ci) : '',
    items: ch.map((h, vi) => ({ n: (ci === 0 ? v0 : 1) + vi, he: cleanTxt(h).replace(/[\u0591-\u05AF\u05BD\u05C0]/g, '').replace(/\s+/g, ' ').trim(), tr: cleanTxt((trs[ci] || [])[vi]) })).filter(x => x.he || x.tr)
  })).filter(x => x.items.length);
}
function gem(n) { // nombre -> lettres hébraïques (135 -> קל״ה)
  const U = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], T = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], H = ['', 'ק', 'ר', 'ש', 'ת'];
  let r = ''; n = +n;
  while (n >= 400) { r += 'ת'; n -= 400; }
  r += H[Math.floor(n / 100)] || ''; n %= 100;
  if (n === 15) r += 'טו'; else if (n === 16) r += 'טז'; else r += T[Math.floor(n / 10)] + U[n % 10];
  return r.length > 1 ? r.slice(0, -1) + '״' + r.slice(-1) : r + '׳';
}
const LIVRES = { berechit: 'Genesis', bereshit: 'Genesis', chemot: 'Exodus', shemot: 'Exodus', vayikra: 'Leviticus', bamidbar: 'Numbers', devarim: 'Deuteronomy' };
// ---------- Tanya : traduction française automatique (d'après la version anglaise Kehot, CC BY-NC), via Vercel AI Gateway ----------
// Faite une seule fois par chapitre puis gardée en base (table etude_trad). En cas d'échec : texte anglais.
const TRAD_MODEL = process.env.TRAD_MODEL || 'anthropic/claude-sonnet-5.5';
let tradTable = null;
async function tradLire(cle) {
  if (!pool) return null;
  tradTable = tradTable || pool.query('create table if not exists public.etude_trad (cle text primary key, fr jsonb not null, created_at timestamptz not null default now())').catch(e => { tradTable = null; throw e; });
  await tradTable;
  const r = await pool.query('select fr from public.etude_trad where cle = $1', [cle]);
  return r.rows[0] ? r.rows[0].fr : null;
}
async function tradEcrire(cle, fr) { if (pool) await pool.query('insert into public.etude_trad (cle, fr) values ($1, $2) on conflict (cle) do update set fr = excluded.fr', [cle, JSON.stringify(fr)]); }
async function traduireTanya(items, jeton) {
  if (!jeton) throw new Error('pas de jeton AI Gateway');
  const segs = items.map(i => ({ he: i.he, en: i.tr }));
  const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + jeton, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(100000),
    body: JSON.stringify({ model: TRAD_MODEL, temperature: 0.2, max_tokens: 16000, messages: [
      { role: 'system', content: "Tu traduis le Tanya (l'œuvre de l'Admour Hazaken) en français, pour un public juif francophone habad. Pour chaque segment tu reçois l'original hébreu et une traduction anglaise (Kehot) qui contient aussi des notes explicatives mêlées au texte. Traduis l'HÉBREU, et seulement lui : sers-toi de l'anglais pour le sens, mais n'y reprends jamais les notes ni les ajouts, et ignore les remarques éditoriales entre crochets de l'hébreu. Écris un français soutenu, clair et élégant, fidèle au texte. Translittère les termes hébreux à la française (Hachem, Torah, mitsvot, néchama, 'Hassidout, Ein Sof, Sefirot, Zohar, Arizal…), garde les références entre crochets ou parenthèses. Réponds UNIQUEMENT par un tableau JSON de chaînes, une par segment, dans le même ordre, sans aucun autre texte." },
      { role: 'user', content: JSON.stringify(segs) }] })
  });
  if (!r.ok) throw new Error('AI Gateway ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json(), txt = String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
  const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
  if (!Array.isArray(arr) || arr.length !== segs.length) throw new Error('traduction incomplète (' + (arr && arr.length) + '/' + segs.length + ')');
  return arr.map(x => String(x || '').trim());
}
const tradEnCours = new Map();
let TANYA_FR = null;   // traductions relues à la main, livrées avec le site (data/tanya-fr.json) : prioritaires
function tanyaFichier(cle) { if (!TANYA_FR) { try { TANYA_FR = JSON.parse(fs.readFileSync(path.join(ROOT, 'contenu', 'tanya-fr.json'), 'utf8')); } catch (e) { TANYA_FR = {}; } } return TANYA_FR[cle] || null; }
async function tanyaFrancais(cle, items, jeton) {
  const fic = tanyaFichier(cle); if (fic && fic.length === items.length) return fic;
  const deja = await tradLire(cle).catch(() => null); if (deja && deja.length === items.length) return deja;
  if (tradEnCours.has(cle)) return tradEnCours.get(cle);
  const p = traduireTanya(items, jeton).then(async fr => { await tradEcrire(cle, fr).catch(e => console.error('[trad] écriture', e.message)); return fr; }).finally(() => tradEnCours.delete(cle));
  tradEnCours.set(cle, p); return p;
}

async function chabadTexte(type, jour, jeton) {
  jour = await jourEtude(jour);
  const hit = texteCache.get(type + jour);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.v;
  const e = await chabadEtude(jour), it = e[type];
  if (!it) throw new Error('rien aujourd\'hui');
  let v;
  if (type === 'houmach') {
    const m = it.desc.match(/\(([^)\d]+?)\s+(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?\)/); if (!m) throw new Error('portion illisible');
    const bk = LIVRES[noAcc(m[1]).replace(/[^a-z]/g, '')]; if (!bk) throw new Error('livre inconnu');
    const c1 = +m[2], v1 = +m[3], c2 = m[4] ? +m[4] : c1, v2 = m[5] ? +m[5] : v1;
    const x = await sefaria(`${bk} ${c1}:${v1}-${c2 === c1 ? '' : c2 + ':'}${v2}`, 'version=french&version=hebrew');
    v = { title: 'Houmach', ref: it.desc.replace(/\s+with Rashi$/i, ''), trLang: x.trLang, sections: sections(x.he, x.tr, c1, v1, 'Chapitre') };
  } else if (type === 'tehilim') {
    const nums = (it.desc.match(/\d+/g) || []).map(Number); if (!nums.length) throw new Error('portion illisible');
    const a = Math.min(...nums), b = Math.max(...nums);
    const x = await sefaria(`Psalms ${a}${b > a ? '-' + b : ''}`, 'version=french&version=hebrew');
    v = { title: 'Téhilim', ref: b > a ? `Chapitres ${a} à ${b}` : `Chapitre ${a}`, trLang: x.trLang, sections: sections(x.he, x.tr, a, 1, 'Psaume') };
  } else {
    const d = it.desc.toLowerCase(), nums = (it.desc.match(/\d+/g) || []).map(Number); if (!nums.length) throw new Error('portion illisible');
    const part = /kuntres|kuntras|acharon/.test(d) ? ['Part V; Kuntres Acharon', 'Kountrass Aharon'] : /kodesh/.test(d) ? ['Part IV; Iggeret HaKodesh', 'Iguérèt Hakodech'] : /teshuv|techouv/.test(d) ? ['Part III; Iggeret HaTeshuvah', 'Iguérèt Hatéchouva'] : /ichud|yichud/.test(d) ? ['Part II; Shaar HaYichud VehaEmunah', 'Chaar Hayihoud Véhaémouna'] : /likut|likkut|amarim/.test(d) ? ['Part I; Likkutei Amarim', 'Likouteï Amarim'] : null;
    if (!part) throw new Error('livre du Tanya inconnu');
    const a = Math.min(...nums), b = Math.max(...nums);
    const x = await sefaria(`Tanya, ${part[0]} ${a}${b > a ? '-' + b : ''}`, 'version=primary&version=english');
    v = { title: 'Tanya', ref: part[1] + (b > a ? `, chapitres ${a} à ${b}` : `, chapitre ${a}`), trLang: 'en', sections: sections(x.he, x.tr, a, 1, 'Chapitre').map(sc => ({ head: sc.head, items: sc.items.map(i => ({ n: 0, he: i.he, tr: i.tr })) })) };
    try {   // anglais -> français (une seule fois par chapitre, gardé en base)
      const tous = v.sections.flatMap(sc => sc.items), fr = await tanyaFrancais('tanya:' + part[0] + ':' + a + '-' + b, tous, jeton);
      tous.forEach((it2, k) => { it2.tr = fr[k] || it2.tr; });
      v.trLang = 'fr'; v.trNote = tanyaFichier('tanya:' + part[0] + ':' + a + '-' + b) ? "Traduction française d'après l'original hébreu." : "Traduction française automatique d'après l'original hébreu (aidée de la version anglaise de Kehot, CC BY-NC).";
    } catch (e) { console.error('[trad] Tanya', e.message); }
  }
  if (!v.sections.length) throw new Error('texte vide');
  v.jour = jour; if (!(type === 'tanya' && v.trLang !== 'fr')) texteCache.set(type + jour, { at: Date.now(), v }); if (texteCache.size > 30) texteCache.delete(texteCache.keys().next().value);
  return v;
}

// ---------- Parachat de la semaine (Hebcal), côté serveur : fiable, mise en cache, indépendante de la ville ----------
const parCache = new Map();
async function parashaFor(id) {
  const il = ISRAEL.has(Number(id)) ? 1 : 0;
  const wd = new Date(parisDay(Date.now()) + 'T12:00:00Z').getUTCDay(), h = parisHour();
  const add = wd === 6 ? (h >= 21 ? 7 : 0) : (6 - wd + 7) % 7;
  const sat = parisDay(Date.now() + add * 86400000);
  const key = sat + '|' + il, hit = parCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.v;
  const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&s=on&maj=on&min=off&mod=off&nx=off&mf=off&i=${il ? 'on' : 'off'}&lg=fr&start=${sat}&end=${sat}`);
  if (!r.ok) throw new Error('Hebcal ' + r.status);
  const j = await r.json(), it = j.items || [];
  const p = it.find(x => x.category === 'parashat'), hol = it.find(x => x.category === 'holiday' && x.yomtov);
  const v = { day: sat, p: p ? clean(p.title).replace(/^Parachah?\s*/i, '') : (hol ? clean(hol.title) : ''), ph: ((p ? p.hebrew : (hol ? hol.hebrew : '')) || '').replace(/^פרשת\s*/, '') };
  if (!v.p) throw new Error('parachat introuvable');
  parCache.set(key, { at: Date.now(), v });
  return v;
}


// changer la ville de son abonnement aux horaires de Chabbat (lien reçu dans le mail : l'identifiant du contact fait office de clé, comme pour la désinscription)
async function shabbatCity(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const nowMs = Date.now(), hits = (subHits.get('c' + ip) || []).filter(t => nowMs - t < 3600000);
  if (hits.length >= 20) return send(res, 429, { error: 'Trop de tentatives.' });
  subHits.set('c' + ip, [...hits, nowMs]);
  const b = await readBody(req);
  const c = db.contacts.find(x => x.id === String(b.id || ''));
  if (!c) return send(res, 404, { error: 'Abonnement introuvable.' });
  const city = CITIES.find(x => String(x[1]) === String(b.city));
  if (!city) return send(res, 400, { error: 'Cette ville n\'est pas disponible pour les e-mails.' });
  c.tags = [...new Set([...(c.tags || []).filter(t => !/^ville:/.test(t)), 'chabbat', 'ville:' + city[1]])];
  save();
  return send(res, 200, { ok: true, city: city[0] });
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
// ---------- Trafic : mesure d'audience anonyme ----------
// Une ligne par (jour, visiteur, site, page). Le « visiteur » est une empreinte qui change chaque jour (sel du jour + IP + navigateur) :
// ni l'adresse IP ni le navigateur ne sont enregistrés, aucun cookie n'est posé. Les robots sont ignorés.
let visitsReady = null;
const ensureVisits = () => visitsReady || (visitsReady = pool.query(`
  create table if not exists public.visits (
    day date not null, visitor text not null, site text not null, path text not null,
    first_at timestamptz not null default now(), last_at timestamptz not null default now(), hits int not null default 1,
    ref text not null default '', device text not null default '',
    primary key (day, visitor, site, path));
  create index if not exists visits_last_idx on public.visits (last_at);
  alter table public.visits enable row level security;
  delete from public.visits where day < current_date - 400;`).catch(e => { visitsReady = null; throw e; }));
// ---- Besoins : mini-cagnottes. Chaque besoin a son adresse don.emounateha.fr/besoin/<slug> ; les dons faits par cette adresse lui sont attribués.
let besoinsReady = null;
const ensureBesoins = () => besoinsReady || (besoinsReady = pool.query(`
  create table if not exists public.besoins (
    id text primary key, slug text not null unique, titre text not null,
    beneficiaire text not null default '', description text not null default '', objectif integer,
    actif boolean not null default true, created_at timestamptz not null default now());
  alter table public.besoins enable row level security;`).catch(e => { besoinsReady = null; throw e; }));
const besoinSlug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
// public : ce que la page de don affiche (jamais le nom du bénéficiaire, qui reste dans le CRM)
async function besoinPublic(req, res, url) {
  const slug = String(url.searchParams.get('slug') || '');
  if (!pool || !/^[a-z0-9-]{1,40}$/.test(slug)) return send(res, 404, { error: 'introuvable' });
  await ensureBesoins();
  const b = (await pool.query('select slug, titre, description, objectif, actif from public.besoins where slug = $1', [slug])).rows[0];
  if (!b) return send(res, 404, { error: 'introuvable' });
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=20' }); res.end(JSON.stringify(b));
}
const VU_ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|axios|okhttp|monitor|pingdom|uptime|scan|vercel|gptbot|claude|bytespider/i;
const VU_SITES = { 'www.emounateha.fr': 'www.emounateha.fr', 'emounateha.fr': 'www.emounateha.fr', 'don.emounateha.fr': 'don.emounateha.fr', 'ambassadeur.emounateha.fr': 'ambassadeur.emounateha.fr' };
const jourParis = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
async function vu(req, res) {
  const fin = () => { res.writeHead(204, { 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(); };
  try {
    if (!pool) return fin();
    const ua = String(req.headers['user-agent'] || ''); if (ua.length < 20 || VU_ROBOT.test(ua)) return fin();
    // relais du serveur de don (signé avec la clé commune aux deux projets) : il transmet l'adresse du visiteur
    const rts = Number(req.headers['x-vu-ts'] || 0), rip = String(req.headers['x-vu-ip'] || ''), rsig = String(req.headers['x-vu-sig'] || '');
    const rkey = crypto.createHash('sha256').update('emounateha-cerfa|' + (envVar('CERFA_SECRET') || DATABASE_URL)).digest();
    const relais = /^[0-9a-f]{64}$/.test(rsig) && Math.abs(Date.now() - rts) < 120000 && crypto.timingSafeEqual(Buffer.from(rsig, 'hex'), crypto.createHmac('sha256', rkey).update('vu|' + rts + '|' + rip).digest());
    let oh = ''; try { oh = new URL(req.headers.origin || req.headers.referer || '').hostname; } catch (e) {}
    if (!relais && !VU_SITES[oh] && !(!process.env.VERCEL && /^(localhost|127\.0\.0\.1)$/.test(oh))) return fin();   // seulement depuis nos pages
    const b = await readBody(req).catch(() => ({})) || {};
    const site = relais ? 'don.emounateha.fr' : VU_SITES[String(b.s || '')]; if (!site || (!relais && site === 'don.emounateha.fr')) return fin();   // la page de don ne passe que par son relais
    let p = String(b.p || '/').split(/[?#]/)[0].slice(0, 100).replace(/\/index\.html$/, '/').replace(/\/{2,}/g, '/');
    if (!/^\/[A-Za-z0-9\-._~%\/]*$/.test(p) || p.split('/').length > 5 || /^\/(crm|backoffice|api|login|auth)(\/|$)/.test(p)) return fin();
    if (p.length > 1 && !p.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(p)) p += '/';
    const ip = relais ? rip : String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
    const day = jourParis(), visitor = crypto.createHash('sha256').update('emounateha-vu|' + (envVar('CRON_SECRET') || DATABASE_URL) + '|' + day + '|' + ip + '|' + ua).digest('hex').slice(0, 20);
    let ref = ''; try { const rh = new URL(String(b.r || '')).hostname.replace(/^www\./, ''); if (rh && !/(^|\.)emounateha\.fr$/.test(rh)) ref = rh.slice(0, 60); } catch (e) {}
    const device = /iPad|Tablet/i.test(ua) ? 'Tablette' : /Mobi|Android|iPhone/i.test(ua) ? 'Téléphone' : 'Ordinateur';
    await ensureVisits();
    await pool.query(`insert into public.visits (day, visitor, site, path, ref, device) values ($1,$2,$3,$4,$5,$6)
      on conflict (day, visitor, site, path) do update set last_at = now(), hits = public.visits.hits + $7`, [day, visitor, site, p.toLowerCase(), ref, device, b.h ? 0 : 1]);
  } catch (e) { console.error('[trafic] visite non enregistrée', e.message); }
  fin();
}
async function trafic(req, res, url) {
  if (!pool) return send(res, 503, { error: 'Base indisponible' });
  await ensureVisits();
  const jours = [1, 7, 30, 90].includes(+url.searchParams.get('jours')) ? +url.searchParams.get('jours') : 30;
  const auj = jourParis(), hier = jourParis(new Date(Date.now() - 86400000)), depuis = jourParis(new Date(Date.now() - (jours - 1) * 86400000)), depuisG = jourParis(new Date(Date.now() - (Math.max(jours, 14) - 1) * 86400000));
  const [live, parJour, pages, sources, appareils] = await Promise.all([
    // en direct : chaque personne n'est montrée que sur SA page la plus récente (sinon, juste après un changement de page, elle apparaîtrait sur deux pages)
    pool.query("select site, path, count(*)::int as n from (select distinct on (visitor) visitor, site, path from public.visits where last_at > now() - interval '75 seconds' order by visitor, last_at desc) t group by 1, 2 order by n desc, path limit 40"),
    pool.query('select day::text as day, count(distinct visitor)::int as u, sum(hits)::int as v from public.visits where day >= $1 group by day order by day', [depuisG]),
    pool.query('select site, path, count(*)::int as u, sum(hits)::int as v from public.visits where day >= $1 group by 1, 2 order by u desc, v desc limit 60', [depuis]),
    pool.query("select ref, count(*)::int as u from (select day, visitor, (array_agg(ref order by first_at))[1] as ref from public.visits where day >= $1 group by day, visitor) t group by ref order by u desc limit 12", [depuis]),
    pool.query('select device, count(*)::int as u from (select distinct day, visitor, device from public.visits where day >= $1) t group by device order by u desc', [depuis])
  ]);
  const enDirect = await pool.query("select count(distinct visitor)::int as n from public.visits where last_at > now() - interval '75 seconds'");
  const map = Object.fromEntries(parJour.rows.map(r => [r.day, r])), serie = [];
  for (let i = Math.max(jours, 14) - 1; i >= 0; i--) { const d = jourParis(new Date(Date.now() - i * 86400000)); serie.push({ day: d, u: (map[d] || {}).u || 0, v: (map[d] || {}).v || 0 }); }
  const dansPeriode = serie.filter(x => x.day >= depuis);
  send(res, 200, { jours, enDirect: enDirect.rows[0].n, live: live.rows, aujourdhui: map[auj] || { u: 0, v: 0 }, hier: map[hier] || { u: 0, v: 0 },
    periode: { u: dansPeriode.reduce((t, x) => t + x.u, 0), v: dansPeriode.reduce((t, x) => t + x.v, 0) }, serie, pages: pages.rows, sources: sources.rows, appareils: appareils.rows, maj: new Date().toISOString() });
}
const readBody = req => new Promise((ok, ko) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 8e6) req.destroy(); });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } });
});

function publicSettings() {
  const { brevoApiKey, ...rest } = db.settings;
  return { ...rest, hasKey: !!brevoApiKey, keyHint: brevoApiKey ? '••••' + brevoApiKey.slice(-4) : '' };
}

// plan d'envoi d'une campagne en cours : même règle que le moteur (quota du jour, étalé sur la plage horaire)
function campaignPlan(c) {
  if (c.status !== 'running' || !c.endDate) return null;
  const s = db.settings, nowD = new Date(), todayStr = parisDay(Date.now());
  const daysLeft = Math.max(1, Math.round((new Date(c.endDate) - new Date(todayStr)) / 86400000) + 1);
  const sentC = db.sends.filter(x => x.campaignId === c.id && x.status !== 'error' && dayKey(x.at) === dayKey(Date.now())).length;
  const sentTot = db.sends.filter(x => x.campaignId === c.id && x.status !== 'error').length;
  const rem = remaining(c);
  const dayQuota = Math.min(s.dailyLimit, Math.ceil((rem + sentTot) / daysLeft));
  const winMin = Math.max(1, (s.hourTo - s.hourFrom) * 60);
  const h = +nowD.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24;
  const nowMin = h * 60 + (+nowD.toLocaleString('en-GB', { timeZone: 'Europe/Paris', minute: 'numeric' }));
  const fromMin = s.hourFrom * 60, toMin = s.hourTo * 60;
  const inWindow = nowMin >= fromMin && nowMin < toMin;
  const elapsed = Math.min(winMin, Math.max(0, nowMin - fromMin));
  const capNow = Math.max(0, Math.ceil(dayQuota * elapsed / winMin) - sentC);
  const dayLeft = Math.max(0, dayQuota - sentC);
  const perHour = Math.round(dayQuota / (winMin / 60) * 10) / 10;
  const fmtW = m => (m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min');
  let waitMin, nextLabel, nextCount;
  if (rem === 0 || dayLeft === 0 && !inWindow && nowMin < fromMin) {
    if (rem === 0) return { dayQuota, sentToday: sentC, dayLeft: 0, remaining: 0, perHour, nextLabel: 'plus rien à envoyer', nextCount: 0 };
  }
  if (inWindow && dayLeft > 0 && capNow > 0) { waitMin = 0; nextLabel = 'maintenant'; nextCount = Math.min(capNow, s.perMinute, dayLeft, rem); }
  else if (inWindow && dayLeft > 0) { // le quota étalé n'a pas encore avancé : prochain mail quand le temps écoulé le permet
    const needMin = Math.ceil(((sentC + 1) * winMin) / dayQuota);
    waitMin = Math.max(1, needMin - elapsed); nextLabel = 'dans ' + fmtW(waitMin); nextCount = 1;
  }
  else if (!inWindow && nowMin < fromMin && dayLeft > 0) { waitMin = fromMin - nowMin; nextLabel = 'dans ' + fmtW(waitMin) + ' (à ' + String(s.hourFrom).padStart(2, '0') + ' h)'; nextCount = Math.min(s.perMinute, Math.ceil(dayQuota / winMin), rem); }
  else { waitMin = (24 * 60 - nowMin) + fromMin; nextLabel = 'demain à ' + String(s.hourFrom).padStart(2, '0') + ' h'; nextCount = Math.min(s.perMinute, Math.ceil(dayQuota / winMin), rem); }
  return { dayQuota, sentToday: sentC, dayLeft, remaining: rem, perHour, waitMin, nextLabel, nextCount };
}
function campaignStats(c) {
  const s = db.sends.filter(x => x.campaignId === c.id);
  // contacts de l'audience exclus car ils ont déjà reçu ce mail dans une autre campagne (nom différent)
  const tag = (c.audienceTag || '').trim().toLowerCase(), rs = relevantSends(c);
  const excluded = db.contacts.filter(ct => ct.status === 'active' && (!tag || (ct.tags || []).map(t => t.toLowerCase()).includes(tag)))
    .filter(ct => (c.steps || []).some(st => rs.some(x => x.contactId === ct.id && x.templateId === st.templateId && x.campaignId !== c.id))).length;
  const audience = db.contacts.filter(ct => ct.status === 'active' && (!tag || (ct.tags || []).map(t => t.toLowerCase()).includes(tag))).length;
  const daily = {}; s.filter(x => x.status !== 'error').forEach(x => { const k = dayKey(x.at); daily[k] = (daily[k] || 0) + 1; });
  return {
    audience, daily: Object.entries(daily).sort().map(([day, n]) => ({ day, n })),
    excluded,
    sent: s.filter(x => x.status !== 'error').length,
    errors: s.filter(x => x.status === 'error').length,
    pending: pendingCount(c),
    steps: (c.steps || []).map((_, i) => s.filter(x => x.stepIndex === i && x.status !== 'error').length)
  };
}

// programmation complète d'une campagne : envois déjà faits (heure réelle) + envois à venir (heure prévue).
// Simulation minute par minute avec la MÊME règle que tick() (plage horaire, quota du jour étalé, perMinute, délais entre étapes).
function parisMidnight(day) {
  const noon = Date.parse(day + 'T12:00:00Z');
  const h = +new Date(noon).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24;
  return Date.parse(day + 'T00:00:00Z') - (h - 12) * 3600000;
}
function campaignSchedule(c) {
  const s = db.settings, MAXROWS = 5000, DAY = 86400000;
  const nameOf = ct => ((ct.firstName || '') + ' ' + (ct.lastName || '')).trim();
  const tplName = id => (db.templates.find(t => t.id === id) || {}).name || '';
  const steps = c.steps || [];
  const stepsInfo = steps.map((st, i) => { const t = db.templates.find(x => x.id === st.templateId) || {}; return { label: i ? 'Relance ' + i : 'Premier envoi', templateId: st.templateId, tpl: t.name || '', subject: t.subject || '', title: t.title || '', body: String(t.body || '').slice(0, 220), delayDays: st.delayDays || 0 }; });
  const mine = db.sends.filter(x => x.campaignId === c.id).sort((a, b) => (a.at < b.at ? -1 : 1));
  const byId = new Map(db.contacts.map(k => [k.id, k]));
  const sent = mine.slice(-MAXROWS).map(x => ({ id: x.id, at: x.at, email: x.email, name: nameOf(byId.get(x.contactId) || {}), step: x.stepIndex + 1, tpl: tplName(x.templateId), status: x.status, error: x.error || '' }));
  const sentOk = mine.filter(x => x.status !== 'error').length;
  // file d'attente : pour chaque contact, ses étapes restantes, dans l'ordre
  const tag = (c.audienceTag || '').trim().toLowerCase(), ok = relevantSends(c);
  const heads = [];
  const gapMs = (s.minGapHours || 0) * 3600000;
  for (const ct of db.contacts) {
    if (ct.status !== 'active') continue;
    if (tag && !(ct.tags || []).map(t => t.toLowerCase()).includes(tag)) continue;
    const all = ok.filter(x => x.contactId === ct.id);
    const got = new Set(all.map(x => x.templateId));
    const todo = steps.map((st, i) => ({ st, i })).filter(o => !got.has(o.st.templateId));
    if (!todo.length) continue;
    const inCamp = all.filter(x => x.campaignId === c.id);
    const lastAll = all.length ? Math.max(...all.map(x => +new Date(x.at))) : 0;
    const lastC = inCamp.length ? Math.max(...inCamp.map(x => +new Date(x.at))) : 0;
    const ready = Math.max(lastC ? lastC + (todo[0].st.delayDays || 0) * DAY : 0, lastAll + gapMs);
    heads.push({ ct, todo, pos: 0, ready });
  }
  const totalPlanned = heads.reduce((a, h) => a + h.todo.length, 0);
  const planned = [];
  const running = c.status === 'running' || c.status === 'scheduled';
  if (!running) {
    for (const h of heads) for (const o of h.todo) { if (planned.length < MAXROWS) planned.push({ at: null, email: h.ct.email, name: nameOf(h.ct), step: o.i + 1, tpl: tplName(o.st.templateId) }); }
    return { status: c.status, sent, planned, totalPlanned, sentOk, stepsInfo, truncated: totalPlanned > planned.length, window: [s.hourFrom, s.hourTo] };
  }
  const nowMs = Date.now(), today = parisDay(nowMs);
  const fromMin = s.hourFrom * 60, toMin = s.hourTo * 60, winMin = Math.max(1, toMin - fromMin);
  let day = today;
  if (c.startDate && c.startDate > day) day = c.startDate;
  let pausedUntil = s.pausedUntil && +new Date(s.pausedUntil) > nowMs ? +new Date(s.pausedUntil) : 0;
  let left = totalPlanned, assigned = 0;
  const pOf = ts => { // minute du jour à Paris
    const d = new Date(ts);
    return (+d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24) * 60 + +d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', minute: 'numeric' });
  };
  for (let guard = 0; left > 0 && guard < 200; guard++, day = parisDay(parisMidnight(day) + 36 * 3600000)) {
    if (c.endDate && day > c.endDate) break;
    const isToday = day === today, mid = parisMidnight(day);
    if (pausedUntil && mid + 86399000 < pausedUntil) continue;
    const sentC = isToday ? mine.filter(x => x.status !== 'error' && dayKey(x.at) === today).length : 0;
    const usedDay = isToday ? usedToday() : 0;
    let dayQuota = s.dailyLimit;
    if (c.endDate) {
      const daysLeft = Math.max(1, Math.round((new Date(c.endDate) - new Date(day)) / DAY) + 1);
      dayQuota = Math.min(s.dailyLimit, Math.ceil((left + sentOk + assigned) / daysLeft));
    }
    let doneDay = sentC, budgetDay = s.dailyLimit - usedDay;
    let startM = fromMin;
    if (isToday) startM = Math.max(fromMin, pOf(nowMs) + 1);
    for (let m = startM; m < toMin && left > 0 && budgetDay > 0; m++) {
      const at = mid + m * 60000;
      if (pausedUntil && at < pausedUntil) continue;
      let n = Math.min(s.perMinute, budgetDay);
      if (c.endDate) n = Math.min(n, Math.ceil(dayQuota * (m - fromMin) / winMin) - doneDay);
      else n = Math.min(n, dayQuota - doneDay);
      for (let k = 0; k < n; k++) {
        const h = heads.find(x => x.pos < x.todo.length && x.ready <= at);
        if (!h) break;
        const o = h.todo[h.pos++];
        if (planned.length < MAXROWS) planned.push({ at: new Date(at).toISOString(), email: h.ct.email, name: nameOf(h.ct), step: o.i + 1, tpl: tplName(o.st.templateId) });
        left--; assigned++; doneDay++; budgetDay--;
        if (h.pos < h.todo.length) h.ready = Math.max(at + (h.todo[h.pos].st.delayDays || 0) * DAY, at + gapMs);
      }
    }
  }
  // ce qui n'a pas pu être placé (au-delà de la date de fin ou de l'horizon) : sans heure
  for (const h of heads) for (; h.pos < h.todo.length; h.pos++) { if (planned.length < MAXROWS) planned.push({ at: null, email: h.ct.email, name: nameOf(h.ct), step: h.todo[h.pos].i + 1, tpl: tplName(h.todo[h.pos].st.templateId), late: true }); }
  planned.sort((a, b) => (a.at && b.at ? (a.at < b.at ? -1 : 1) : a.at ? -1 : b.at ? 1 : 0));
  return { status: c.status, sent, planned, totalPlanned, sentOk, stepsInfo, truncated: totalPlanned > planned.length, window: [s.hourFrom, s.hourTo], serverNow: nowMs };
}

const CHABAD = [ // [nom français, nom hébreu, mois (convertisseur Hebcal), jour] — recalculé chaque année
  ['Youd Kislev', 'י׳ כסלו', 'Kislev', 10],
  ['Youd-Tet Kislev', 'י״ט כסלו', 'Kislev', 19],
  ['Hé Tevet', 'ה׳ טבת', 'Tevet', 5],
  ['Kaf-Dalet Tevet', 'כ״ד טבת', 'Tevet', 24],
  ['Youd Chevat', 'י׳ שבט', 'Shvat', 10],
  ['Youd-Aleph Nissan', 'י״א ניסן', 'Nisan', 11],
  ['Guimel Tamouz', 'ג׳ תמוז', 'Tamuz', 3],
  ['Youd-Beth / Youd-Guimel Tamouz', 'י״ב–י״ג תמוז', 'Tamuz', 12],
  ['Chaï Elloul', 'י״ח אלול', 'Elul', 18]
];
let chabadCache = { at: 0, list: [] };
async function chabadDates() {
  if (Date.now() - chabadCache.at < 12 * 3600e3 && chabadCache.list.length) return chabadCache.list;
  const t = new Date();
  const g = await (await fetch(`https://www.hebcal.com/converter?cfg=json&gy=${t.getFullYear()}&gm=${t.getMonth() + 1}&gd=${t.getDate()}&g2h=1`)).json();
  const jobs = [];
  for (const hy of [g.hy, g.hy + 1, g.hy + 2]) for (const [title, hebrew, hm, hd] of CHABAD)
    jobs.push(fetch(`https://www.hebcal.com/converter?cfg=json&hy=${hy}&hm=${hm}&hd=${hd}&h2g=1`).then(r => r.json()).then(r => ({ date: `${r.gy}-${String(r.gm).padStart(2, '0')}-${String(r.gd).padStart(2, '0')}`, title, hebrew, chabad: true })).catch(() => null));
  chabadCache = { at: Date.now(), list: (await Promise.all(jobs)).filter(Boolean) };
  return chabadCache.list;
}
let holCache = {};
const COLL = ['contacts', 'templates', 'campaigns'];
const PICK = {
  contacts: ['email', 'firstName', 'lastName', 'phone', 'tags', 'status', 'notes'],
  templates: ['holiday', 'name', 'subject', 'preheader', 'title', 'body', 'buttonText', 'buttonUrl', 'color', 'accent'],
  campaigns: ['name', 'audienceTag', 'steps', 'startDate', 'endDate', 'buttonUrl']
};
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;
  const body = ['POST', 'PUT'].includes(m) ? await readBody(req) : {};

  if (parts[0] === 'state' && m === 'GET') {
    await Promise.race([brevoToday(), new Promise(r => setTimeout(r, 2500))]); // vrai total du jour chez Brevo (horaires, dons, codes, campagnes)
    return send(res, 200, {
      settings: publicSettings(), contacts: db.contacts, templates: db.templates,
      campaigns: db.campaigns.map(c => ({ ...c, stats: campaignStats(c), plan: campaignPlan(c) })),
      today: { sent: usedToday(), limit: db.settings.dailyLimit, pausedUntil: db.settings.pausedUntil || null, queue: db.campaigns.filter(c => c.status === 'running').reduce((a, c) => a + remaining(c), 0) },
      sends: db.sends.slice(-60).reverse()
    });
  }
  if (parts[0] === 'engagement' && m === 'GET') return send(res, 200, await engagementReport());   // par campagne : délivrés, ouverts, qui a cliqué, clics sur le bouton
  if (parts[0] === 'attribution' && m === 'GET') return send(res, 200, await attributionReport());   // quels e-mails ont déclenché des dons
  if (parts[0] === 'reset' && m === 'POST') { // Réglages : remise à zéro (contacts, historique des envois, campagnes)
    if (body.confirm !== 'SUPPRIMER') return send(res, 400, { error: 'Tapez SUPPRIMER pour confirmer.' });
    const quoi = ['contacts', 'sends', 'campaigns'].filter(t => body[t]);
    if (!quoi.length) return send(res, 400, { error: 'Rien à supprimer.' });
    const n = {};
    for (const t of quoi) {
      n[t] = db[t].length;
      if (pool) await pool.query(`delete from public.${t}`);
      db[t] = []; lastSnap[t] = new Map();
    }
    if (quoi.includes('sends')) { db.settings.pausedUntil = null; dirty = true; }
    save(); await flush().catch(() => {});
    return send(res, 200, { ok: true, n });
  }
  if (parts[0] === 'settings' && m === 'POST') {
    const allowed = ['senderName', 'senderEmail', 'dailyLimit', 'perMinute', 'hourFrom', 'hourTo', 'publicUrl', 'logoUrl', 'orgName', 'address', 'donateUrl', 'phone', 'social', 'minGapHours', 'assetsUrl', 'replyTo', 'instagramUrl', 'facebookUrl', 'tiktokUrl', 'youtubeUrl'];
    for (const k of allowed) if (k in body) db.settings[k] = ['dailyLimit', 'perMinute', 'hourFrom', 'hourTo', 'minGapHours'].includes(k) ? Number(body[k]) : String(body[k]).trim();
    if (body.brevoApiKey) db.settings.brevoApiKey = String(body.brevoApiKey).trim();
    if (body.clearKey) db.settings.brevoApiKey = '';
    save(); return send(res, 200, publicSettings());
  }
  if (parts[0] === 'render' && m === 'POST') {
    const c = body.contactId ? db.contacts.find(x => x.id === body.contactId) : null; // vrai contact = rendu identique à l'envoi
    const t = body.template || {};
    return send(res, 200, { html: renderEmail(t, c), subject: fill(t.subject, c || { firstName: 'Prénom', lastName: 'Nom', email: 'email@exemple.com' }), preheader: fill(t.preheader, c || { firstName: 'Prénom', lastName: 'Nom' }) });
  }
  if (parts[0] === 'historique' && m === 'GET') {
    const ev = await brevoEvents(); // lecture seule : envois réels + dons reçus (webhook AlloDons)
    const sends = db.sends.slice().sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 200).map(x => {
      const c = db.contacts.find(k => k.id === x.contactId);
      const camp = db.campaigns.find(k => k.id === x.campaignId);
      const nom = camp ? camp.name : ({ chabbat: 'Horaires de Chabbat', 'test-templates': 'Test depuis Templates' })[x.campaignId] || 'Campagne supprimée';
      return { at: x.at, email: x.email, campagne: nom, status: x.status, erreur: x.error || '', brevo: (ev.map.get(x.messageId) || null) };
    });
    let dons = [];
    try { dons = fs.readFileSync(path.join(DATA_DIR, 'allodons-webhook.log'), 'utf8').trim().split('\n').filter(Boolean).slice(-100).map(l => JSON.parse(l)).reverse(); } catch (e) {}
    dons = dons.map(x => ({ at: x.at, donateur: (x.data && x.data.donateur) || '', email: (x.data && x.data.email) || '', montant: (x.data && x.data.montant) || '', transaction: (x.data && x.data.transaction) || '', campagne: (x.data && x.data.category) || '' }));
    return send(res, 200, { envois: sends, brevoOk: !db.settings.brevoApiKey || ev.ok });
  }
  if (parts[0] === 'test-send' && m === 'POST') {
    const t = body.template; if (!t || !body.to) return send(res, 400, { error: 'template + to requis' });
    const fake = { id: 'test', firstName: body.firstName || 'Test', lastName: '', email: body.to };
    try {
      const r = await brevoSend({ to: body.to, toName: fake.firstName, subject: '[TEST] ' + fill(t.subject, fake), html: renderEmail(t, fake) });
      // trace dans l'historique : même table que les campagnes (campagne « Test depuis Templates »)
      db.sends.push({ id: uid(), at: now(), campaignId: 'test-templates', contactId: '', email: body.to, stepIndex: 0, templateId: t.id || '', status: r.simulated ? 'simulated' : 'sent', messageId: r.messageId || '' });
      save();
      return send(res, 200, r);
    } catch (e) {
      db.sends.push({ id: uid(), at: now(), campaignId: 'test-templates', contactId: '', email: body.to, stepIndex: 0, templateId: t.id || '', status: 'error', error: e.message });
      save();
      return send(res, 400, { error: e.message });
    }
  }
  if (parts[0] === 'holidays' && m === 'GET') {
    if (holCache.at && Date.now() - holCache.at < 12 * 3600e3 && holCache.q === url.search) return send(res, 200, holCache.v);
    try {
      const y = new Date().getFullYear(), out = [];
      for (const yr of [y, y + 1]) {
        const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=off&nx=off&ss=off&mf=off&c=off&geo=none&lg=fr&i=off&year=${yr}&month=x`);
        const j = await r.json();
        for (const it of j.items || []) if (it.category === 'holiday') out.push({ date: it.date, title: it.title.replace(/[\u0300-\u036f]/g, '').split(':')[0].replace(/\s*\(.*\)$/, '').trim(), hebrew: (it.hebrew || '').split(':')[0] });
      }
      const today = new Date().toISOString().slice(0, 10), list = [];
      for (const h of out.filter(x => x.date >= today && !/Hag HaBanot/i.test(x.title))) {
        const prev = list[list.length - 1];
        if (prev && prev.title.split(' ')[0] === h.title.split(' ')[0] && (new Date(h.date) - new Date(prev.date)) < 10 * 86400000) continue; // 1er jour d'une fête de plusieurs jours
        list.push(h);
      }
      let merged = list;
      try { const today2 = new Date().toISOString().slice(0, 10); merged = [...list, ...(await chabadDates()).filter(x => x.date >= today2)].sort((a, b) => a.date.localeCompare(b.date)); } catch {}
      const outList = merged.slice(0, url.searchParams.get('all') ? 80 : 8); holCache = { at: Date.now(), q: url.search, v: outList };
      return send(res, 200, outList);
    } catch (e) { return send(res, 200, []); }
  }
  if (parts[0] === 'diffusion') {
    if (!pool) return send(res, 400, { error: 'Base de données requise' });
    if (m === 'GET') { const r = await pool.query('select id, day::text as day, name, youtube, (data is not null) as has_image from public.diffusion order by day desc, created_at desc limit 200'); return send(res, 200, r.rows); }
    if (m === 'POST') {
      const raw = String(body.data || '').replace(/^data:[^,]+,/, '');
      const buf = raw ? Buffer.from(raw, 'base64') : null;
      const ytOk = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(body.youtube || '');
      if (buf && (buf.length < 1000 || buf.length > 6e6 || buf[0] !== 0xff || buf[1] !== 0xd8)) return send(res, 400, { error: 'Image JPEG requise (6 Mo max)' });
      if (!buf && !ytOk) return send(res, 400, { error: 'Ajoutez une image ou un lien YouTube' });
      const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || '') ? body.day : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      const id = uid();
      await pool.query('insert into public.diffusion (id, day, name, youtube, data) values ($1, $2, $3, $4, $5)', [id, day, String(body.name || '').slice(0, 120), /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(body.youtube || '') ? String(body.youtube).slice(0, 300) : '', buf]);
      return send(res, 200, { id, day });
    }
    if (m === 'PATCH' && parts[1]) { // ajouter / changer le lien YouTube d'un jour
      const yt = String(body.youtube || '').trim();
      if (yt && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(yt)) return send(res, 400, { error: 'Lien YouTube invalide' });
      await pool.query('update public.diffusion set youtube = $1 where id = $2', [yt.slice(0, 300), parts[1]]);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE' && parts[1]) { await pool.query('delete from public.diffusion where id = $1', [parts[1]]); return send(res, 200, { ok: true }); }
  }
  if (parts[0] === 'ambassadors') {
    if (!pool) return send(res, 400, { error: 'Base de données requise' });
    if (m === 'GET') { // avec les dons rapportés par chaque lien (reçus du serveur des dons)
      const r = await pool.query('select id, first_name, last_name, email, phone, cp, city, slug, status, created_at from public.ambassadors order by created_at desc');
      let recus = [], erreur = '';
      try { const x = await fetch(DON_URL + '/api/admin/recus', { headers: cerfaSig('GET', '/api/admin/recus'), signal: AbortSignal.timeout(15000) }); const j = await x.json(); if (!x.ok) throw new Error(j.error || x.status); recus = j.recus || []; } catch (e) { erreur = 'Dons indisponibles : ' + e.message; }
      const par = {}; for (const x of recus) if (x.ambassadeur) { const p = par[x.ambassadeur] = par[x.ambassadeur] || { dons: 0, total: 0, dernier: null }; p.dons++; p.total += x.montant || 0; if (!p.dernier || x.dateDon > p.dernier) p.dernier = x.dateDon; }
      return send(res, 200, { list: r.rows.map(a => ({ ...a, ...(par[a.slug] || { dons: 0, total: 0, dernier: null }) })), erreur });
    }
    if (m === 'PUT' && parts[1]) { const st = ['new', 'contacted', 'active', 'inactive'].includes(body.status) ? body.status : 'new'; await pool.query('update public.ambassadors set status = $1 where id = $2', [st, parts[1]]); return send(res, 200, { ok: true }); }
    if (m === 'DELETE' && parts[1]) { await pool.query('delete from public.ambassadors where id = $1', [parts[1]]); return send(res, 200, { ok: true }); }
  }
  if (parts[0] === 'besoins') {   // mini-cagnottes : création, suivi du montant collecté par lien
    if (!pool) return send(res, 400, { error: 'Base de données requise' });
    await ensureBesoins();
    const propre = b => ({ titre: String(b.titre || '').trim().slice(0, 70), beneficiaire: String(b.beneficiaire || '').trim().slice(0, 120), description: String(b.description || '').trim().slice(0, 600),
      objectif: (() => { const n = Math.round(Number(String(b.objectif == null ? '' : b.objectif).replace(',', '.')) * 100); return Number.isFinite(n) && n >= 100 && n <= 100000000 ? n : null; })() });
    if (m === 'GET') {
      const r = await pool.query('select id, slug, titre, beneficiaire, description, objectif, actif, created_at from public.besoins order by actif desc, created_at desc');
      let recus = [], erreur = '';
      try { const x = await fetch(DON_URL + '/api/admin/recus', { headers: cerfaSig('GET', '/api/admin/recus'), signal: AbortSignal.timeout(15000) }); const j = await x.json(); if (!x.ok) throw new Error(j.error || x.status); recus = j.recus || []; } catch (e) { erreur = 'Dons indisponibles : ' + e.message; }
      const par = {}; for (const x of recus) if (x.besoin) { const p = par[x.besoin] = par[x.besoin] || { dons: 0, total: 0, dernier: null, liste: [] }; p.dons++; p.total += x.montant || 0; if (!p.dernier || x.dateDon > p.dernier) p.dernier = x.dateDon; p.liste.push({ nom: x.nom, montant: x.montant, dateDon: x.dateDon, numero: x.numero }); }
      return send(res, 200, { list: r.rows.map(a => ({ ...a, ...(par[a.slug] || { dons: 0, total: 0, dernier: null, liste: [] }) })), erreur });
    }
    if (m === 'POST' && !parts[1]) {
      const v = propre(body); if (!v.titre) return send(res, 400, { error: 'Indiquez le besoin (ex. Loyer en retard)' });
      const base = besoinSlug(body.slug || v.titre); if (!base) return send(res, 400, { error: "Adresse invalide : utilisez des lettres ou des chiffres" });
      const pris = new Set((await pool.query("select slug from public.besoins where slug = $1 or slug like $1 || '-%'", [base])).rows.map(r => r.slug));
      if (body.slug && pris.has(base)) return send(res, 400, { error: 'Cette adresse est déjà prise par un autre besoin' });
      let slug = base; for (let n = 2; pris.has(slug); n++) slug = base.slice(0, 36) + '-' + n;
      const id = uid(); await pool.query('insert into public.besoins (id, slug, titre, beneficiaire, description, objectif) values ($1,$2,$3,$4,$5,$6)', [id, slug, v.titre, v.beneficiaire, v.description, v.objectif]);
      return send(res, 200, { id, slug, lien: DON_URL + '/besoin/' + slug });
    }
    if (m === 'PUT' && parts[1]) {   // l'adresse (slug) ne change jamais : les liens déjà partagés et les dons déjà reçus y restent attachés
      const v = propre(body); if (!v.titre) return send(res, 400, { error: 'Indiquez le besoin' });
      await pool.query('update public.besoins set titre = $1, beneficiaire = $2, description = $3, objectif = $4, actif = $5 where id = $6', [v.titre, v.beneficiaire, v.description, v.objectif, body.actif !== false, parts[1]]);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE' && parts[1]) { await pool.query('delete from public.besoins where id = $1', [parts[1]]); return send(res, 200, { ok: true }); }
  }
  if (parts[0] === 'users') {
    if (!pool) return send(res, 400, { error: 'Base de données requise' });
    if (m === 'GET') { const r = await pool.query("select id, email, role, created_at, (password_hash is null) as pending from public.crm_users order by created_at"); return send(res, 200, r.rows); }
    if (m === 'POST' && parts[1] === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Email invalide' });
      const token = crypto.randomBytes(24).toString('hex');
      await pool.query("insert into public.crm_users (id, email, invite_hash, invite_expires) values ($1, $2, $3, now() + interval '7 days') on conflict (lower(email)) do update set invite_hash = excluded.invite_hash, invite_expires = excluded.invite_expires", [uid(), email, sha(token)]);
      const base = (db.settings.publicUrl || '').replace(/\/$/, '') || ((SERVERLESS ? 'https://' : 'http://') + req.headers.host);
      try { await sendInvite(base, email, token); } catch (e) { return send(res, 502, { error: 'Invitation créée mais email non envoyé : ' + e.message }); }
      return send(res, 200, { ok: true, email });
    }
    if (m === 'DELETE' && parts[1]) {
      const left = +(await pool.query('select count(*) n from public.crm_users where password_hash is not null and id <> $1', [parts[1]])).rows[0].n;
      if (!left && !envVar('CRM_PASSWORD')) return send(res, 400, { error: 'Impossible de supprimer le dernier administrateur' });
      await pool.query('delete from public.crm_users where id = $1', [parts[1]]); return send(res, 200, { ok: true });
    }
  }
  if (parts[0] === 'youtube-sync' && m === 'POST') { try { return send(res, 200, await syncYoutube(true)); } catch (e) { return send(res, 500, { error: e.message }); } }
  if (parts[0] === 'tick' && m === 'POST') return send(res, 200, await tick(true));

  // ---------- SMS (Brevo) ----------
  if (parts[0] === 'sms' && parts[1] === 'credits' && m === 'GET') { // crédits SMS restants, lus en direct chez Brevo
    const key = db.settings.brevoApiKey;
    if (!key) return send(res, 400, { error: 'Clé Brevo manquante (Réglages)' });
    try {
      const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, r.status, { error: r.status === 403 ? 'La clé Brevo n\'a pas le droit « Compte » en lecture (Brevo > SMTP et API > clé > Compte : Lues).' : (j.message || 'Brevo HTTP ' + r.status) });
      const p = (j.plan || []).find(x => x.type === 'sms');
      return send(res, 200, { credits: p ? p.credits : 0, perSms: smsCost, at: now() });
    } catch (e) { return send(res, 502, { error: 'Brevo injoignable : ' + e.message }); }
  }
  if (parts[0] === 'sms' && parts[1] === 'status' && m === 'GET') { // état de livraison réel (Brevo accepte l'envoi, mais l'opérateur peut ensuite refuser ou retarder le SMS)
    const key = db.settings.brevoApiKey; if (!key) return send(res, 400, { error: 'Clé Brevo manquante (Réglages)' });
    const phones = String(url.searchParams.get('phones') || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean).slice(0, 10);
    const since = Number(url.searchParams.get('since')) || Date.now() - 3600000;
    const out = [];
    for (const ph of phones) {
      try {
        const r = await fetch('https://api.brevo.com/v3/transactionalSMS/statistics/events?limit=50&sort=desc&phoneNumber=' + ph, { headers: { 'api-key': key, accept: 'application/json' } }); const j = await r.json().catch(() => ({}));
        const by = new Map(); for (const e of (j.events || [])) if (+new Date(e.date) >= since - 5000) { const k = e.messageId || e.date; (by.get(k) || by.set(k, []).get(k)).push(e); }
        for (const [id, ev] of by) { ev.sort((a, b) => (a.date < b.date ? -1 : 1)); const fin = [...ev].reverse().find(e => /delivered|bounce|blocked|rejected|skipped|unsubscribed/i.test(e.event)); out.push({ phone: ph, id, state: fin ? (/delivered/i.test(fin.event) ? 'delivered' : 'failed') : 'pending', event: fin ? fin.event : ev[ev.length - 1].event, reason: fin && fin.reason || '', at: (fin || ev[ev.length - 1]).date }); }
      } catch (e) { out.push({ phone: ph, state: 'unknown', error: e.message }); }
    }
    return send(res, 200, { messages: out });
  }
  if (parts[0] === 'sms' && parts[1] === 'send' && m === 'POST') { // un lot de SMS (le navigateur découpe en lots de 25)
    const key = db.settings.brevoApiKey;
    if (!key) return send(res, 400, { error: 'Clé Brevo manquante (Réglages)' });
    const type = body.type === 'transactional' ? 'transactional' : 'marketing'; // transactionnel = test vers son propre numéro
    const h = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }) % 24;
    if (type === 'marketing' && (h < 8 || h >= 22)) return send(res, 400, { error: 'Les SMS de prospection ne peuvent partir qu\'entre 8 h et 22 h (heure de Paris).' });
    const sender = String(body.sender || 'Emounateha').trim();
    if (!/^[A-Za-z0-9]{1,11}$/.test(sender)) return send(res, 400, { error: 'Expéditeur : 11 caractères max, lettres et chiffres seulement.' });
    const tpl = String(body.message || '').trim();
    if (!tpl) return send(res, 400, { error: 'Message vide' });
    const list = Array.isArray(body.recipients) ? body.recipients.slice(0, 100) : [];
    const failed = []; let sent = 0, used = 0, remaining = null;
    const queue = [];
    const seen = new Set();
    for (const r of list) {
      const to = smsPhone(r.phone);
      if (!to) { failed.push({ phone: r.phone || '', error: 'numéro invalide' }); continue; }
      if (seen.has(to)) continue; seen.add(to);
      const text = smsFill(tpl, r);
      if (!text.trim()) { failed.push({ phone: to, error: 'message vide' }); continue; }
      if (smsInfo(text).segments !== 1) { failed.push({ phone: to, error: 'dépasse un SMS (' + smsInfo(text).len + ' car.)' }); continue; }
      queue.push({ to, text });
    }
    let stop = null;
    const worker = async () => {
      while (queue.length && !stop) {
        const { to, text } = queue.shift();
        try {
          const rr = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', { method: 'POST', headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender, recipient: to, content: text, type, tag: 'crm' }) });
          const j = await rr.json().catch(() => ({}));
          if (!rr.ok) { const msg = j.message || 'Brevo HTTP ' + rr.status; failed.push({ phone: to, error: msg }); if (rr.status === 402 || rr.status === 429 || /credit|limit|quota/i.test(msg)) stop = msg; continue; }
          sent++; used += j.usedCredits || 0; remaining = j.remainingCredits ?? remaining;
          if (j.usedCredits && j.smsCount) smsCost = j.usedCredits / j.smsCount;
        } catch (e) { failed.push({ phone: to, error: e.message }); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
    if (stop) failed.push({ phone: '', error: 'Envoi arrêté : ' + stop });
    return send(res, 200, { sent, failed, used, remaining, perSms: smsCost });
  }

  if (parts[0] === 'contacts' && parts[1] === 'import' && m === 'POST') {
    let added = 0, skipped = 0;
    const tags = (body.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const lines = String(body.csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const split = l => l.split(/[;,\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
    let cols = { fn: -1, ln: -1, em: -1 };
    if (lines.length && !/@/.test(lines[0])) { // ligne d'en-tête
      split(lines.shift()).forEach((h, i) => {
        h = h.toLowerCase();
        if (/mail/.test(h)) cols.em = i; else if (/pr[ée]nom|first/.test(h)) cols.fn = i; else if (/^nom|last|famil/.test(h)) cols.ln = i;
      });
    }
    let dup = 0;
    for (const line of lines) {
      const cells = split(line);
      const email = (cols.em >= 0 ? cells[cols.em] : cells.find(x => /@/.test(x))) || '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; continue; }
      const ex = db.contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
      if (ex) { // déjà connu : on lui ajoute juste le tag de la campagne
        for (const t of tags) if (!(ex.tags || []).includes(t)) (ex.tags ||= []).push(t);
        dup++; continue;
      }
      const rest = cells.filter(x => x !== email);
      db.contacts.push({ id: uid(), email, firstName: cols.fn >= 0 ? cells[cols.fn] || '' : rest[0] || '', lastName: cols.ln >= 0 ? cells[cols.ln] || '' : rest[1] || '', phone: '', tags: [...tags], status: 'active', notes: '', createdAt: now() });
      added++;
    }
    save(); return send(res, 200, { added, skipped, existing: dup });
  }

  if (parts[0] === 'campaigns' && parts[2] === 'schedule' && m === 'GET') { // programmation détaillée (envoyés + prévus), rafraîchie en direct par le CRM
    const c = db.campaigns.find(x => x.id === parts[1]); if (!c) return send(res, 404, { error: 'introuvable' });
    return send(res, 200, { name: c.name, ...campaignSchedule(c) });
  }
  if (parts[0] === 'campaigns' && parts[2] && m === 'POST') {
    const c = db.campaigns.find(x => x.id === parts[1]); if (!c) return send(res, 404, { error: 'introuvable' });
    if (parts[2] === 'start') c.status = (c.startDate && c.startDate > new Date().toISOString().slice(0, 10)) ? 'scheduled' : 'running';
    else if (parts[2] === 'pause') c.status = 'paused';
    save(); return send(res, 200, c);
  }

  if (COLL.includes(parts[0])) {
    const coll = db[parts[0]];
    if (m === 'POST') {
      const item = { id: uid(), createdAt: now(), ...pick(body, PICK[parts[0]]) };
      if (parts[0] === 'contacts') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.email || '')) return send(res, 400, { error: 'Email invalide' });
        if (coll.some(c => c.email.toLowerCase() === item.email.toLowerCase())) return send(res, 400, { error: 'Contact déjà existant' });
        item.status ||= 'active'; item.tags ||= [];
      }
      if (parts[0] === 'campaigns') { item.status = 'draft'; item.steps ||= []; }
      coll.push(item); save(); return send(res, 200, item);
    }
    if (m === 'PUT' && parts[1]) {
      const item = coll.find(x => x.id === parts[1]); if (!item) return send(res, 404, { error: 'introuvable' });
      Object.assign(item, pick(body, PICK[parts[0]])); save(); return send(res, 200, item);
    }
    if (m === 'DELETE' && parts[1]) {
      const i = coll.findIndex(x => x.id === parts[1]); if (i < 0) return send(res, 404, { error: 'introuvable' });
      coll.splice(i, 1); save(); return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: 'not found' });
}


// ---------- Authentification : comptes + invitation par email ----------
const SESSION_SECRET = envVar('SESSION_SECRET') || envVar('CRON_SECRET') || crypto.createHash('sha256').update(String(DATABASE_URL || 'local')).digest('hex');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const hmac = x => crypto.createHmac('sha256', SESSION_SECRET).update(x).digest('base64url');
function hashPw(pw) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function checkPw(pw, stored) { try { const [s, k] = String(stored).split(':'); const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(k, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch { return false; } }
function makeSession(email) { const p = Buffer.from(email + '|' + (Date.now() + 30 * 864e5)).toString('base64url'); return p + '.' + hmac(p); }
function readSession(req) {
  const m = /(?:^|;\s*)crm_session=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [p, sig] = m[1].split('.'); if (!p || sig !== hmac(p)) return null;
  const [email, exp] = Buffer.from(p, 'base64url').toString().split('|'); return +exp > Date.now() ? email : null;
}
const cookie = (v, maxAge, secure) => `crm_session=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
const isHttps = req => (req.headers['x-forwarded-proto'] || '').includes('https');
async function usersCount() { return pool ? +(await pool.query('select count(*) n from public.crm_users where password_hash is not null')).rows[0].n : 0; }
async function authorized(req) {
  if (readSession(req)) return true;
  const pw = envVar('CRM_PASSWORD');
  if (pw && Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':') === pw) return true;
  return !SERVERLESS && !pw && (await usersCount()) === 0; // en local, sans compte ni mot de passe : ouvert
}
function reply(res, code, body, type = 'text/html; charset=utf-8', extra = {}) { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra }); res.end(body); }
function authPage(title, inner) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — Émounatéha</title>
<link href="https://fonts.googleapis.com/css2?family=Bree+Serif&family=Inter:wght@400;600&display=swap" rel="stylesheet"><link rel="icon" href="/logo.png">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,sans-serif;color:#14272a;background:#1f6a72 url(/header.jpg) center/cover}
.box{background:#fff;border-radius:20px;padding:30px 26px;width:100%;max-width:390px;box-shadow:0 20px 50px rgba(0,0,0,.3);text-align:center}
.box img{width:84px;height:84px;border-radius:50%;margin-bottom:8px}h1{font-family:'Bree Serif',serif;font-weight:400;font-size:24px;margin:0 0 4px;color:#1f6a72}p{color:#5d7276;font-size:14px;margin:0 0 18px}
label{display:block;text-align:left;font-size:12px;font-weight:600;color:#5d7276;margin:12px 0 5px;text-transform:uppercase;letter-spacing:.4px}
input{width:100%;padding:12px;border:1px solid #e3eaea;border-radius:10px;font:inherit;outline:none}input:focus{border-color:#1f6a72;box-shadow:0 0 0 3px rgba(31,106,114,.15)}
button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#1f6a72;color:#fff;font:inherit;font-weight:600;cursor:pointer}button:hover{background:#164c52}
.err{color:#b91c1c;font-size:13px;margin-top:12px;min-height:18px}</style></head><body><div class="box"><img src="/logo.png" alt="">${inner}</div></body></html>`;
}
const loginPage = () => authPage('Connexion', `<h1>Connexion au CRM</h1><p>Réservé aux administrateurs.</p>
<form id="f"><label>Email</label><input id="e" type="email" autocomplete="username" required><label>Mot de passe</label><input id="p" type="password" autocomplete="current-password" required><button>Se connecter</button><div class="err" id="m"></div><p style="margin:14px 0 0"><a href="/forgot" style="color:#1f6a72">Mot de passe oublié ?</a></p></form>
<script>f.onsubmit=async ev=>{ev.preventDefault();m.textContent='';const r=await fetch('/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value,password:p.value})});if(r.ok)location.href='/crm/';else m.textContent=(await r.json()).error||'Erreur'}</script>`);
const forgotPage = () => authPage('Mot de passe oublié', `<h1>Mot de passe oublié</h1><p>Entrez votre email : si un compte existe, vous recevrez un lien pour choisir un nouveau mot de passe (valable 1 heure).</p>
<form id="f"><label>Email</label><input id="e" type="email" autocomplete="username" required><button>Envoyer le lien</button><div class="err" id="m" style="color:#1f6a72"></div><p style="margin:14px 0 0"><a href="/login" style="color:#1f6a72">← Retour à la connexion</a></p></form>
<script>f.onsubmit=async ev=>{ev.preventDefault();await fetch('/auth/forgot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});m.textContent='Si ce compte existe, un email vient d\\'être envoyé.'}</script>`);
const invitePage = (email, token) => authPage('Créer mon mot de passe', `<h1>Bienvenue</h1><p>Créez votre mot de passe pour <b>${esc(email)}</b>.</p>
<form id="f"><label>Mot de passe (10 caractères minimum)</label><input id="p" type="password" minlength="10" autocomplete="new-password" required><label>Confirmer</label><input id="q" type="password" minlength="10" autocomplete="new-password" required><button>Créer mon mot de passe</button><div class="err" id="m"></div></form>
<script>f.onsubmit=async ev=>{ev.preventDefault();m.textContent='';if(p.value!==q.value){m.textContent='Les deux mots de passe sont différents';return}const r=await fetch('/auth/set-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)},password:p.value})});if(r.ok)location.href='/crm/';else m.textContent=(await r.json()).error||'Erreur'}</script>`);
async function sendReset(base, email, token) {
  const link = `${base}/invite/${token}`, org = db.settings.orgName || 'Émounatéha';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important;width:100% !important}.pad{padding:24px 18px !important}.bt{display:block !important;padding:14px 12px !important;text-align:center}}</style></head><body style="margin:0;background:#eef2f1;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1"><tr><td align="center" class="outer" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#1f6a72 url('${base}/header2.jpg') center top/cover;padding:18px 22px;text-align:center"><img src="${base}/logo-complet-site.png?v=5" alt="${esc(org)}" width="130" style="display:block;margin:0 auto;width:130px;max-width:55%;height:auto;border:0"><div style="font-size:11px;line-height:1.4;color:#d8ecea;margin-top:6px">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div><div style="font-family:Cinzel,Georgia,serif;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#f6e094;margin-top:8px;padding:0 6px">Accueillons Machia'h avec des actes de bonté et de bienveillance&nbsp;!</div></td></tr><tr><td class="pad" background="${base}/bg.png" bgcolor="#ffffff" style="background:#ffffff url('${base}/bg.png') repeat;padding:32px 30px;color:#111827;font-size:16px;line-height:1.6;word-break:break-word"><h2 style="font-family:Georgia,serif;color:#1f6a72;margin:0 0 12px">Réinitialiser votre mot de passe</h2><p>Une demande de réinitialisation a été faite pour votre accès au CRM. Ce lien est valable 1 heure.</p><p style="text-align:center;margin:26px 0"><a href="${link}" class="bt" style="background:#c4a24a;color:#1b2b2d;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:99px;display:inline-block">Choisir un nouveau mot de passe</a></p><p style="font-size:13px;color:#6b7280">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe ne change pas.</p></td></tr></table></td></tr></table></body></html>`;
  return brevoSend({ to: email, subject: `Réinitialisation de votre mot de passe — ${org}`, html });
}
async function sendInvite(base, email, token) {
  const link = `${base}/invite/${token}`, org = db.settings.orgName || 'Émounatéha';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important;width:100% !important}.pad{padding:24px 18px !important}.bt{display:block !important;padding:14px 12px !important;text-align:center}}</style></head><body style="margin:0;background:#eef2f1;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1"><tr><td align="center" class="outer" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#1f6a72 url('${base}/header2.jpg') center top/cover;padding:18px 22px;text-align:center"><img src="${base}/logo-complet-site.png?v=5" alt="${esc(org)}" width="130" style="display:block;margin:0 auto;width:130px;max-width:55%;height:auto;border:0"><div style="font-size:11px;line-height:1.4;color:#d8ecea;margin-top:6px">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div><div style="font-family:Cinzel,Georgia,serif;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#f6e094;margin-top:8px;padding:0 6px">Accueillons Machia'h avec des actes de bonté et de bienveillance&nbsp;!</div></td></tr><tr><td class="pad" background="${base}/bg.png" bgcolor="#ffffff" style="background:#ffffff url('${base}/bg.png') repeat;padding:32px 30px;color:#111827;font-size:16px;line-height:1.6;word-break:break-word"><h2 style="font-family:Georgia,serif;color:#1f6a72;margin:0 0 12px">Créez votre accès au CRM</h2><p>Vous avez été invité comme <b>super administrateur</b> du CRM d'${esc(org)}.</p><p>Cliquez sur le bouton pour choisir votre mot de passe. Ce lien est valable 7 jours.</p><p style="text-align:center;margin:26px 0"><a href="${link}" class="bt" style="background:#c4a24a;color:#1b2b2d;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:99px;display:inline-block">Créer mon mot de passe</a></p><p style="font-size:13px;color:#6b7280">Si le bouton ne marche pas, copiez ce lien : ${link}</p></td></tr></table></td></tr></table></body></html>`;
  return brevoSend({ to: email, subject: `Créez votre accès au CRM ${org}`, html });
}

async function handle(req, res) {
  let url = new URL(req.url, 'http://x');
  const forced = url.searchParams.get('__path'); // réécritures Vercel : on retrouve le chemin d'origine
  if (forced) { url.searchParams.delete('__path'); url = new URL(forced + (url.search || ''), 'http://x'); req.url = url.pathname + url.search; }
  if (SERVERLESS) { // l'envoi de la réponse attend l'enregistrement en base
    const end = res.end.bind(res);
    res.end = (...a) => { flush().catch(e => console.error('flush', e.message)).finally(() => end(...a)); return res; };
  }
  try {
    await ensureDb();
    if (url.pathname === '/api/cron-youtube') { // déclenché toutes les heures : nouvelles vidéos de Tanya
      const key = envVar('CRON_SECRET');
      const got = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('key');
      if (!key || got !== key) return send(res, 401, { error: 'non autorisé' });
      try { return send(res, 200, await syncYoutube(true)); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (url.pathname === '/api/cron') { // déclenché toutes les minutes (pg_cron / planificateur externe)
      const key = envVar('CRON_SECRET');
      const got = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('key');
      if (!key || got !== key) return send(res, 401, { error: 'non autorisé' });
      return send(res, 200, await tick());
    }
    // webhook AlloDons (test) : journalise l'événement reçu ; route publique
    if (url.pathname === '/webhooks/allodons' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}));
      const ev = { at: now(), type: body.type || body.event || '', data: body };
      try { fs.appendFileSync(path.join(DATA_DIR, 'allodons-webhook.log'), JSON.stringify(ev) + '\n'); } catch (e) {}
      // don reçu : si l'email correspond à un contact, il est marqué « a donné » et ne reçoit plus les campagnes
      try {
        const d = body.data || body;
        const em = String(d.email || '').trim().toLowerCase();
        const c = em && db.contacts.find(x => (x.email || '').toLowerCase() === em);
        if (c && d.montant) {
          c.tags = [...new Set([...(c.tags || []), 'a-donne'])];
          c.status = 'converted'; // accepté par la base ; hors envois (seuls les « active » reçoivent)
          c.donatedAt = now();
          save();
          console.log('don reçu de', c.email, '→ marqué a-donné');
        }
      } catch (e) {}
      console.log('AlloDons webhook :', ev.type || '(sans type)');
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/parasha' && req.method === 'GET') { // public : parachat de la semaine
      try { const v = await parashaFor(url.searchParams.get('id')); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Parachat indisponible' }); }
    }
    if (url.pathname === '/api/colis-videos' && req.method === 'GET') { // public : vidéos de la chaîne Émounatéha rangées par fête (colis)
      try { const v = await colisVideos(); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Vidéos indisponibles' }); }
    }
    if (url.pathname === '/api/action-videos' && req.method === 'GET') { // public : vidéos de la chaîne rangées par action (réinsertion, vêtements, toit, soutien)
      try { const v = await actionVideos(); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Vidéos indisponibles' }); }
    }
    if (url.pathname === '/api/etude-texte' && req.method === 'GET') { // public : texte du jour (Houmach, Téhilim, Tanya)
      const ty = url.searchParams.get('type');
      if (!['houmach', 'tehilim', 'tanya'].includes(ty)) return send(res, 400, { error: 'type inconnu' });
      try { const v = await chabadTexte(ty, url.searchParams.get('date'), process.env.VERCEL_OIDC_TOKEN || req.headers['x-vercel-oidc-token'] || process.env.AI_GATEWAY_API_KEY); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': (ty === 'tanya' && v.trLang !== 'fr') ? 'no-store' : ty === 'tanya' ? 'public, max-age=900' : url.searchParams.get('date') ? 'public, max-age=21600' : 'public, max-age=600' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Texte indisponible' }); }
    }
    if (url.pathname === '/api/jour-hebraique' && req.method === 'GET') { // public : jour hébraïque en cours (change à Tset Hakokhavim)
      try { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': 'https://don.emounateha.fr' }); return res.end(JSON.stringify(await jourHebraique(url.searchParams.get('geo')))); }
      catch (e) { return send(res, 502, { error: 'Indisponible' }); }
    }
    if (url.pathname === '/api/etude' && req.method === 'GET') { // public : étude du jour (flux RSS Chabad)
      try { const v = await chabadEtude(url.searchParams.get('date')); res.writeHead(200, { 'content-type': 'application/json', 'cache-control': url.searchParams.get('date') ? 'public, max-age=21600' : 'public, max-age=600' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Étude indisponible' }); }
    }
    if (url.pathname === '/api/zmanim' && req.method === 'GET') { // public : horaires du flux RSS Chabad (id Chabad + jour)
      try { const v = await chabadZmanim(url.searchParams.get('id'), /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : parisDay(Date.now()), +url.searchParams.get('before') || 18);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' }); return res.end(JSON.stringify(v)); }
      catch (e) { return send(res, 502, { error: 'Horaires indisponibles' }); }
    }
    if (url.pathname === '/api/besoin' && req.method === 'GET') return await besoinPublic(req, res, url);   // public : une mini-cagnotte (titre, texte, objectif)
    if (url.pathname === '/api/vu' && req.method === 'POST') return vu(req, res);   // public : mesure d'audience anonyme (onglet Trafic)
    if (url.pathname === '/api/shabbat-subscribe' && req.method === 'POST') return shabbatSubscribe(req, res);
    if (url.pathname === '/api/shabbat-city' && req.method === 'POST') return shabbatCity(req, res);
    if (url.pathname === '/api/rabbi-letter' && req.method === 'POST') return rabbiLetter(req, res);
    // (ancien paiement AlloDons /api/pay-session retiré : tous les dons passent par don.emounateha.fr)
    if (url.pathname === '/api/ambassadeur' && req.method === 'POST') { // public : inscription ambassadeur → lien personnel
      if (!pool) return send(res, 503, { error: 'Base indisponible' });
      const b = await readBody(req);
      if (String(b.website || '')) return send(res, 200, { ok: true }); // piège anti-robot
      const t = (k, n) => String(b[k] || '').trim().slice(0, n);
      const email = t('email', 120).toLowerCase(), prenom = t('firstName', 80), nom = t('lastName', 80), tel = t('phone', 30), cp = t('cp', 10), ville = t('city', 80);
      if (!prenom) return send(res, 400, { error: 'Prénom requis' });
      if (!nom) return send(res, 400, { error: 'Nom requis' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Email invalide' });
      if (tel.replace(/\D/g, '').length < 9) return send(res, 400, { error: 'Numéro de téléphone invalide' });
      if (!/^\d{5}$/.test(cp)) return send(res, 400, { error: 'Code postal invalide (5 chiffres)' });
      if (!ville) return send(res, 400, { error: 'Ville requise' });
      const ex = (await pool.query('select slug from public.ambassadors where lower(email) = $1', [email])).rows[0];
      let slug = ex && ex.slug;
      if (!slug) { // prénom sans accents ; yaron, yaron-2, yaron-3…
        const base = prenom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'ami';
        const pris = new Set((await pool.query("select slug from public.ambassadors where slug = $1 or slug like $1 || '-%'", [base])).rows.map(r => r.slug));
        slug = base; for (let n = 2; pris.has(slug) || ['ambassadeur', 'api', 'www'].includes(slug); n++) slug = base + '-' + n;
      }
      await pool.query(`insert into public.ambassadors (id, first_name, last_name, email, phone, cp, city, slug) values ($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict (lower(email)) do update set first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone, cp = excluded.cp, city = excluded.city, slug = coalesce(public.ambassadors.slug, excluded.slug)`,
        [uid(), prenom, nom, email, tel, cp, ville, slug]);
      const lien = 'https://ambassadeur.emounateha.fr/' + slug;
      try { // l'ambassadeur reçoit son lien
        await brevoSend({ to: email, toName: prenom + ' ' + nom, subject: 'Votre lien ambassadeur Émounatéha', html: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>@media only screen and (max-width:620px){.outer{padding:0 !important}.card{border-radius:0 !important;width:100% !important}.pad{padding:24px 18px !important}.bt{display:block !important;padding:14px 12px !important;text-align:center}}</style></head><body style="margin:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1"><tr><td align="center" class="outer" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td background="https://www.emounateha.fr/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('https://www.emounateha.fr/header2.jpg') center top/cover no-repeat;padding:14px 22px 18px;text-align:center"><div lang="he" dir="rtl" style="text-align:right;color:#e4cd8a;font-size:13px;line-height:1">בס״ד</div><img src="https://www.emounateha.fr/logo-complet-site.png?v=5" alt="Émounatéha — אמונתך" width="140" style="display:block;margin:4px auto 2px;width:140px;max-width:55%;height:auto;border:0"><div style="height:2px;width:50px;background:#c4a24a;margin:6px auto 5px"></div><div style="font-size:11px;line-height:1.4;color:#d8ecea">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div><div style="font-family:Cinzel,Georgia,serif;font-weight:700;font-size:12px;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;color:#f6e094;margin-top:8px;padding:0 6px">Accueillons Machia'h avec des actes de bonté et de bienveillance&nbsp;!</div></td></tr><tr><td class="pad" style="padding:32px 34px 28px;color:#14272a;font-size:15px;line-height:1.6"><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#1f6a72;text-align:center">Votre lien ambassadeur</h1><p style="margin:0 0 12px">Bonjour ${esc(prenom)},</p><p style="margin:0 0 12px">Merci de devenir ambassadeur d'Émounatéha ! Voici votre lien personnel. Partagez-le autour de vous : chaque don fait par ce lien vous est attribué.</p><p style="text-align:center;margin:26px 0"><a class="bt" href="${lien}" style="display:inline-block;background:#c9a84f;color:#14272a;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:99px">${lien.replace('https://', '')}</a></p><p style="color:#51666a;font-size:13.5px;margin:0 0 14px">Copiez ce lien dans vos groupes WhatsApp, vos statuts et vos réseaux. Merci pour votre engagement.</p><p style="margin:0">L'équipe Émounatéha</p></td></tr></table></td></tr></table></body></html>` });
      } catch (e) { console.error('mail ambassadeur', e.message); }
      try { // prévenir l'association
        const to = db.settings.replyTo || db.settings.senderEmail;
        if (to && !ex) await brevoSend({ to, subject: `Nouvel ambassadeur : ${prenom} ${nom}`, html: `<p>Nouvel ambassadeur inscrit.</p><ul><li><b>Nom :</b> ${esc(prenom)} ${esc(nom)}</li><li><b>Email :</b> ${esc(email)}</li><li><b>Téléphone :</b> ${esc(tel)}</li><li><b>Ville :</b> ${esc(cp)} ${esc(ville)}</li><li><b>Lien :</b> ${lien}</li></ul><p>À retrouver dans le CRM, page Ambassadeurs.</p>` });
      } catch (e) { console.error('mail ambassadeur (asso)', e.message); }
      return send(res, 200, { ok: true, lien, slug });
    }
    if (url.pathname === '/diffusion-archives.json') { // public : toutes les diffusions publiées, groupées par mois
      if (!pool) return send(res, 200, { months: [] });
      const today = (await jourHebraique(url.searchParams.get('geo'))).jour;   // idem : une diffusion « de demain » apparaît à Tset Hakokhavim
      const r = await pool.query('select id, day::text as day, name, youtube, (data is not null) as has_image from public.diffusion where day <= $1 order by day desc, created_at desc limit 400', [today]);
      const months = [];
      for (const x of r.rows) { const k = x.day.slice(0, 7); let m = months.find(y => y.key === k); if (!m) { m = { key: k, items: [] }; months.push(m); } m.items.push(x); }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }); return res.end(JSON.stringify({ months }));
    }
    if (url.pathname === '/diffusion.json') { // public : dernier document + dernière vidéo (indépendants : tant que la nouvelle vidéo n'est pas là, on garde la précédente)
      if (!pool) return send(res, 200, []);
      const today = (await jourHebraique(url.searchParams.get('geo'))).jour;   // le « jour » change à Tset Hakokhavim, pas à minuit
      const q = "select id, day::text as day, name, youtube, (data is not null) as has_image from public.diffusion where day <= $1 and ";
      const doc = (await pool.query(q + "data is not null order by day desc, created_at desc limit 1", [today])).rows[0];
      const vid = (await pool.query(q + "youtube <> '' order by day desc, created_at desc limit 1", [today])).rows[0];
      if (!doc && !vid) return send(res, 200, []);
      const item = { id: (doc || vid).id, day: (doc || vid).day, name: (doc || vid).name, youtube: vid ? vid.youtube : '', has_image: !!doc };
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify([item]));
    }
    if (/^\/diffusion\/[a-f0-9]+\.jpg$/.test(url.pathname) && pool) { // public : l'image
      const r = await pool.query('select data from public.diffusion where id = $1', [url.pathname.slice(11, -4)]);
      if (!r.rows.length) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' });
      return res.end(r.rows[0].data);
    }
    if (url.pathname === '/holidays.json') return await api(req, res, new URL('/api/holidays?all=1', 'http://x')); // public : fêtes à venir pour le site
    // --- pages et routes de connexion (publiques)
    if (url.pathname === '/login') return reply(res, 200, loginPage());
    if (url.pathname === '/forgot') return reply(res, 200, forgotPage());
    if (url.pathname === '/auth/forgot' && req.method === 'POST') {
      const b = await readBody(req), email = String(b.email || '').trim().toLowerCase();
      if (pool && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        const token = crypto.randomBytes(24).toString('hex');
        const r = await pool.query("update public.crm_users set invite_hash = $1, invite_expires = now() + interval '1 hour' where lower(email) = $2 and password_hash is not null returning email", [sha(token), email]);
        if (r.rows.length) { const base = (db.settings.publicUrl || '').replace(/\/$/, '') || ((SERVERLESS ? 'https://' : 'http://') + req.headers.host); try { await sendReset(base, email, token); } catch (e) { console.error('reset mail', e.message); } }
      }
      return reply(res, 200, '{"ok":true}', 'application/json'); // même réponse, que le compte existe ou non
    }
    if (url.pathname === '/auth/logout') return reply(res, 302, '', 'text/plain', { location: '/login', 'set-cookie': cookie('', 0, isHttps(req)) });
    if (url.pathname === '/auth/login' && req.method === 'POST') {
      const b = await readBody(req); await new Promise(r => setTimeout(r, 400));
      const r = pool ? await pool.query('select email, password_hash from public.crm_users where lower(email) = lower($1) and password_hash is not null', [String(b.email || '').trim()]) : { rows: [] };
      if (!r.rows.length || !checkPw(String(b.password || ''), r.rows[0].password_hash)) return reply(res, 401, JSON.stringify({ error: 'Email ou mot de passe incorrect' }), 'application/json');
      return reply(res, 200, '{"ok":true}', 'application/json', { 'set-cookie': cookie(makeSession(r.rows[0].email), 30 * 86400, isHttps(req)) });
    }
    if (url.pathname.startsWith('/invite/') && req.method === 'GET') {
      const r = pool ? await pool.query('select email from public.crm_users where invite_hash = $1 and invite_expires > now()', [sha(url.pathname.slice(8))]) : { rows: [] };
      return r.rows.length ? reply(res, 200, invitePage(r.rows[0].email, url.pathname.slice(8))) : reply(res, 410, authPage('Lien expiré', '<h1>Lien expiré</h1><p>Ce lien d\'invitation n\'est plus valable. Demandez une nouvelle invitation.</p>'));
    }
    if (url.pathname === '/auth/set-password' && req.method === 'POST') {
      const b = await readBody(req), pw1 = String(b.password || '');
      if (pw1.length < 10) return reply(res, 400, JSON.stringify({ error: '10 caractères minimum' }), 'application/json');
      const r = pool ? await pool.query('update public.crm_users set password_hash = $1, invite_hash = null, invite_expires = null where invite_hash = $2 and invite_expires > now() returning email', [hashPw(pw1), sha(String(b.token || ''))]) : { rows: [] };
      if (!r.rows.length) return reply(res, 410, JSON.stringify({ error: 'Lien expiré' }), 'application/json');
      return reply(res, 200, '{"ok":true}', 'application/json', { 'set-cookie': cookie(makeSession(r.rows[0].email), 30 * 86400, isHttps(req)) });
    }
    // --- zones protégées : session, ou mot de passe de secours (CRM_PASSWORD)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/crm')) {
      if (SERVERLESS && !envVar('CRM_PASSWORD') && (await usersCount()) === 0) return send(res, 503, { error: 'Aucun compte : définissez CRM_PASSWORD ou invitez un administrateur' });
      if (!(await authorized(req))) return url.pathname.startsWith('/api/') ? send(res, 401, { error: 'Connexion requise' }) : reply(res, 302, '', 'text/plain', { location: '/login' });
    }
    if (url.pathname === '/api/trafic' && req.method === 'GET') return await trafic(req, res, url);
    if (url.pathname === '/api/cerfa' || url.pathname.startsWith('/api/cerfa/')) return await cerfaProxy(req, res, url);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/u/')) {
      const c = db.contacts.find(x => x.id === url.pathname.slice(3));
      if (c) { c.status = 'unsubscribed'; save(); }
      return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;text-align:center;padding:80px 20px;color:#374151"><h2>Désinscription confirmée</h2><p>Vous ne recevrez plus d'emails de ${esc(db.settings.orgName)}.</p>`, 'text/html; charset=utf-8');
    }
    const isCrm = url.pathname === '/crm' || url.pathname.startsWith('/crm/');
    const base = isCrm ? CRM_DIR : PUBLIC;
    let rel = isCrm ? (url.pathname.slice(4) || '/') : url.pathname;
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(base, path.normalize(rel));
    if (file.startsWith(base) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    if (isCrm) {
      // la page du CRM n'est jamais gardée en mémoire, et ses fichiers portent un numéro de version (date du fichier) :
      // après une mise à jour, le navigateur reçoit toujours le menu ET le script qui vont ensemble
      if (path.basename(file) === 'index.html') {
        const ver = f => { try { return crypto.createHash('md5').update(fs.readFileSync(path.join(CRM_DIR, f))).digest('hex').slice(0, 10); } catch (e) { return '0'; } };   // empreinte du contenu : change à chaque modification du fichier
        const html = fs.readFileSync(file, 'utf8').replace('"/crm/app.js"', '"/crm/app.js?v=' + ver('app.js') + '"').replace('"/crm/style.css"', '"/crm/style.css?v=' + ver('style.css') + '"');
        return reply(res, 200, html, 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
      }
      return reply(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', { 'cache-control': url.searchParams.get('v') ? 'private, max-age=86400' : 'private, no-cache' });
    }
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
}


// ---------- Dons par e-mail : quelle campagne / quel modèle d'e-mail a déclenché quel don (provenance enregistrée avec le paiement dans Stripe) ----------
// Engagement par campagne, lu chez Brevo (30 derniers jours) : mails délivrés, ouverts, personnes qui ont cliqué, et parmi elles celles qui ont cliqué sur le bouton du mail.
// Un clic prouve que le mail a été vu ; l'ouverture seule est moins fiable (Apple Mail précharge les images).
const sansSuivi = u => { try { const x = new URL(u); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'sid'].forEach(k => x.searchParams.delete(k)); const q = x.searchParams.toString(); return (x.host + x.pathname.replace(/\/+$/, '') + (q ? '?' + q : '')).toLowerCase(); } catch (e) { return String(u || '').toLowerCase(); } };
async function engagementReport() {
  const ev = await brevoEvents(), tpls = new Map(db.templates.map(t => [t.id, t])), cts = new Map(db.contacts.map(c => [c.id, c])), out = {};
  for (const c of db.campaigns) out[c.id] = { envoyes: 0, suivis: 0, delivres: 0, ouverts: 0, cliques: 0, bouton: 0, liste: [] };
  for (const x of db.sends) {
    const o = out[x.campaignId]; if (!o || x.status === 'error') continue; o.envoyes++;
    const e = x.messageId ? ev.map.get(x.messageId) : null; if (!e) continue; o.suivis++;
    if (e.delivered || e.opened || e.clicks) o.delivres++;
    if (e.opened || e.clicks) o.ouverts++;
    if (!e.clicks) continue;
    const ct = cts.get(x.contactId), t = tpls.get(x.templateId), camp = db.campaigns.find(k => k.id === x.campaignId);
    let cta = ''; try { cta = sansSuivi(fill((camp && camp.buttonUrl) || (t && t.buttonUrl) || '', ct || {})); } catch (err) {}
    const liens = e.links.map(sansSuivi), surBouton = cta ? liens.includes(cta) : liens.some(l => /(^|\.)emounateha\.fr\//.test(l + '/') && !/emounateha\.fr\/u\//.test(l));
    o.cliques++; if (surBouton) o.bouton++;
    o.liste.push({ email: x.email, nom: ct ? [ct.firstName, ct.lastName].filter(Boolean).join(' ') : '', date: e.firstClick, clics: e.clicks, bouton: surBouton });
  }
  for (const o of Object.values(out)) o.liste.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { ok: ev.ok || !db.settings.brevoApiKey, cle: !!db.settings.brevoApiKey, campagnes: out };
}
async function attributionReport() {
  const out = { lignes: [], dons: [], total: { envois: 0, dons: 0, montant: 0, prelevements: 0, montantPrelev: 0 }, erreur: '' };
  let recus = [];
  try { const r = await fetch(DON_URL + '/api/admin/recus', { headers: cerfaSig('GET', '/api/admin/recus'), signal: AbortSignal.timeout(20000) }); const j = await r.json(); recus = (j.recus || []).filter(x => x.attr && (x.attr.c || x.attr.s)); if (!r.ok) out.erreur = j.error || 'Serveur des dons indisponible'; }
  catch (e) { out.erreur = 'Serveur des dons injoignable : ' + e.message; }
  const camps = new Map(db.campaigns.map(c => [c.id, c.name])), tpls = new Map(db.templates.map(t => [t.id, t.name || t.subject || t.id]));
  const nomC = id => camps.get(id) || ({ chabbat: 'Horaires de Chabbat', lettre: 'Copie de lettre au Rabbi' })[id] || id || '—', nomT = id => tpls.get(id) || (id === 'copie' ? 'Copie de lettre' : id || '—');
  const rows = new Map(), row = (c, t) => { const k = c + '|' + t; if (!rows.has(k)) rows.set(k, { campagneId: c, modeleId: t, campagne: nomC(c), modele: nomT(t), envois: 0, dons: 0, montant: 0, prelevements: 0, montantPrelev: 0 }); return rows.get(k); };
  for (const x of db.sends) if (x.status !== 'error' && x.campaignId) row(x.campaignId, x.templateId || '').envois++;
  const byId = new Map(db.sends.map(x => [x.id, x]));
  for (const d of recus) {
    const r = row(d.attr.c || '', d.attr.t || ''), suite = !!d.attrRepeat || (d.mensuel && (d.echeance || 1) > 1), s = d.attr.s ? byId.get(d.attr.s) : null;
    if (suite) { r.prelevements++; r.montantPrelev += d.montant || 0; } else { r.dons++; r.montant += d.montant || 0; }
    out.dons.push({ date: d.dateDon, email: d.email, nom: d.nom, montant: d.montant, mensuel: !!d.mensuel, suite, campagne: nomC(d.attr.c), modele: nomT(d.attr.t), envoyeA: s ? s.email : '', numero: d.numero });
  }
  out.lignes = [...rows.values()].filter(r => r.envois || r.dons || r.prelevements).map(r => ({ ...r, taux: r.envois ? Math.round(r.dons / r.envois * 1000) / 10 : null })).sort((a, b) => b.montant - a.montant || b.dons - a.dons || b.envois - a.envois);
  for (const r of out.lignes) { out.total.envois += r.envois; out.total.dons += r.dons; out.total.montant += r.montant; out.total.prelevements += r.prelevements; out.total.montantPrelev += r.montantPrelev; }
  out.dons.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

// ---------- CRM, onglet CERFA : relais vers le serveur des dons (don.emounateha.fr), requêtes signées ----------
const DON_URL = process.env.DON_URL || 'https://don.emounateha.fr';
function cerfaSig(method, p) {
  const ts = Date.now(), key = crypto.createHash('sha256').update('emounateha-cerfa|' + (envVar('CERFA_SECRET') || DATABASE_URL)).digest();
  return { 'x-cerfa-ts': String(ts), 'x-cerfa-sig': crypto.createHmac('sha256', key).update(ts + '|' + method + '|' + p).digest('hex') };
}
async function cerfaProxy(req, res, url) {
  const J = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { error: 'Réponse inattendue du serveur des dons (' + r.status + ')' }; } };
  try {
    if (url.pathname === '/api/cerfa/siret') { const r = await fetch(DON_URL + '/api/siret?q=' + encodeURIComponent(url.searchParams.get('q') || '')); return send(res, r.status, await J(r)); }
    if (url.pathname === '/api/cerfa/config') { const r = await fetch(DON_URL + '/api/config'); return send(res, r.status, await J(r)); }
    if (url.pathname === '/api/cerfa' && req.method === 'GET') { const r = await fetch(DON_URL + '/api/admin/recus', { headers: cerfaSig('GET', '/api/admin/recus') }); return send(res, r.status, await J(r)); }
    if (url.pathname === '/api/cerfa/supprimer' && req.method === 'POST') {   // reçus de TEST uniquement
      const b = await readBody(req);
      const r = await fetch(DON_URL + '/api/admin/supprimer', { method: 'POST', headers: { ...cerfaSig('POST', '/api/admin/supprimer'), 'content-type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(30000) });
      return send(res, r.status, await J(r));
    }
    if (url.pathname === '/api/cerfa' && req.method === 'POST') {
      const b = await readBody(req);
      const r = await fetch(DON_URL + '/api/admin/recu', { method: 'POST', headers: { ...cerfaSig('POST', '/api/admin/recu'), 'content-type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(110000) });
      return send(res, r.status, await J(r));
    }
    if (url.pathname === '/api/cerfa/pdf') {
      const f = url.searchParams.get('f') || '', r = await fetch(DON_URL + '/api/admin/pdf?f=' + encodeURIComponent(f), { headers: cerfaSig('GET', '/api/admin/pdf') });
      if (!r.ok) return send(res, r.status, await J(r));
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="' + f.replace(/[^\w.-]/g, '') + '"', 'cache-control': 'private, no-store' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    return send(res, 404, { error: 'inconnu' });
  } catch (e) { return send(res, 502, { error: 'Serveur des dons injoignable : ' + e.message }); }
}

if (require.main === module) {
  const server = http.createServer(handle);
  loadDb().then(() => {
    server.listen(PORT, '127.0.0.1', () => console.log(`CRM Emounateha → http://localhost:${PORT} (${pool ? 'Supabase' : 'fichier local'})`));
    setInterval(() => tick().catch(console.error), 60000);
    setInterval(() => syncYoutube().catch(e => console.error('YouTube', e.message)), 10 * 60000);
  }).catch(e => { console.error('Démarrage impossible :', e.message); process.exit(1); });
}
module.exports = handle;
module.exports.loadDb = loadDb;
module.exports.chabadZmanim = chabadZmanim;
module.exports.campaignPlan = (id) => { const c = db.campaigns.find(x => x.id === id); return c ? { plan: campaignPlan(c), stats: campaignStats(c) } : null; };
module.exports.sendChabbatTest = async (to, cityId, mode) => { const city = cityById(cityId); const dow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getDay(); const wk = await hebcalWeek(city, 8, (4 - dow + 7) % 7); /* un test se lit comme le mail du jeudi, même envoyé un autre jour */ const c = { id: 'test', firstName: 'Yarone', lastName: 'Jami', email: to, tags: ['civ:M'] }; const t = chabbatTemplate(city, wk, mode || 'weekly', c); const r = await brevoSend({ to, subject: '[TEST] ' + t.subject, html: renderEmail(t, c) }); return { subject: t.subject, result: r.simulated ? 'simulé (pas de clé Brevo)' : 'envoyé' }; };
module.exports.chabbatHtml = async (cityId, mode) => { const city = cityById(cityId); const wk = await hebcalWeek(city); const c = { id: 'preview', firstName: 'Yarone', lastName: 'Jami', email: 'exemple@email.com', tags: ['civ:M'] }; const t = chabbatTemplate(city, wk, mode || 'weekly', c); return { subject: t.subject, html: renderEmail(t, c) }; };
module.exports.previewAll = { renderEmail: (...a) => renderEmail(...a), sendReset: (...a) => sendReset(...a), sendInvite: (...a) => sendInvite(...a), getDb: () => db, cities: () => CITIES.map(c => c[0]) };
