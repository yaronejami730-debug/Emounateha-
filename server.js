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
      address: '', donateUrl: 'https://www.allodons.fr/emounateha',
      phone: '06 69 67 07 70', social: 'emounateha_', minGapHours: 24,
      instagramUrl: 'https://www.instagram.com/emounateha', facebookUrl: 'https://www.facebook.com/share/1HhyHMPNPd/', tiktokUrl: 'https://www.tiktok.com/@emounateha', youtubeUrl: 'https://youtube.com/@emounateharaba-h4b'
    },
    contacts: [],
    templates: [{
      id: uid(), holiday: 'hanouka', name: 'Hanouka — Appel aux dons', subject: '{{prenom}}, allumez une lumière avec Émounatéha 🕎',
      preheader: 'Ensemble, rendons Hanouka lumineux pour les familles dans le besoin.',
      title: 'Allumons ensemble la lumière de Hanouka',
      body: DEFAULT_BODY, buttonText: 'Faire un don', buttonUrl: 'https://www.allodons.fr/emounateha',
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
if (DATABASE_URL) { const { Pool } = require('pg'); pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: process.env.VERCEL ? 1 : 3, idleTimeoutMillis: 20000 }); }

const TABLES = {
  contacts: { email: 'email', firstName: 'first_name', lastName: 'last_name', phone: 'phone', tags: 'tags', status: 'status', notes: 'notes', createdAt: 'created_at' },
  templates: { holiday: 'holiday', name: 'name', subject: 'subject', preheader: 'preheader', title: 'title', body: 'body', buttonText: 'button_text', buttonUrl: 'button_url', color: 'color', accent: 'accent', createdAt: 'created_at' },
  campaigns: { name: 'name', audienceTag: 'audience_tag', status: 'status', steps: 'steps', startDate: 'start_date', endDate: 'end_date', createdAt: 'created_at' },
  sends: { at: 'at', campaignId: 'campaign_id', contactId: 'contact_id', email: 'email', stepIndex: 'step_index', templateId: 'template_id', status: 'status', messageId: 'message_id', error: 'error', quota: 'quota' }
};
const JSONCOLS = new Set(['steps']);
const lastSnap = {}; // table -> Map(id -> json)
const toRow = (t, o) => Object.entries(TABLES[t]).map(([k, c]) => o[k] === undefined ? null : (JSONCOLS.has(c) ? JSON.stringify(o[k]) : o[k]));
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

function renderEmail(t, contact) {
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
    ? `<img src="${esc(logoSrc)}" alt="${esc(s.orgName)}" width="230" style="display:block;margin:0 auto;width:230px;height:auto;">`
    : '';
  const button = t.buttonText && t.buttonUrl
    ? `<table role="presentation" align="center" style="margin:28px auto 8px;"><tr><td style="background:${accent};border-radius:999px;">
        <a href="${esc(fill(t.buttonUrl, c))}" style="display:inline-block;padding:16px 38px;font-size:17px;font-weight:bold;color:#1f2937;text-decoration:none;font-family:Arial,sans-serif;">${esc(t.buttonText)}</a>
       </td></tr></table>` : '';
  const wa = (s.phone || '').replace(/\D/g, '').replace(/^0/, '33');
  const pill = (href, label) => `<a href="${esc(href)}" style="display:inline-block;margin:4px 3px;padding:10px 22px;background:#7b8a8d;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;border-radius:999px;">${label}</a>`;
  const ico = (href, name, alt) => `<a href="${esc(href)}" style="display:inline-block;margin:0 5px;text-decoration:none;"><img src="${abase}/icon-${name}.png" width="34" height="34" alt="${alt}" style="display:block;width:34px;height:34px;border:0;border-radius:17px;background:#7b8a8d;color:#ffffff;font-size:11px;"></a>`;
  const contactLine = '<div>' + [
    s.instagramUrl ? ico(s.instagramUrl, 'instagram', 'Instagram') : '',
    s.facebookUrl ? ico(s.facebookUrl, 'facebook', 'Facebook') : '',
    s.tiktokUrl ? ico(s.tiktokUrl, 'tiktok', 'TikTok') : '',
    s.youtubeUrl ? ico(s.youtubeUrl, 'youtube', 'YouTube') : '',
    s.phone ? ico('https://wa.me/' + wa, 'whatsapp', 'WhatsApp') : ''  // le numéro est dans le lien, pas affiché
  ].filter(Boolean).join('') + '</div>';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(fill(t.subject, c))}</title>
<style>
:root{color-scheme:light only;supported-color-schemes:light only}
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
</style></head>
<body class="wrap-out" bgcolor="#eef2f1" style="margin:0;padding:0;background:#eef2f1;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(fill(t.preheader, c))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;padding:24px 12px;"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">
  <tr><td class="hdr" background="${abase}/header2.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header2.jpg') center top/cover no-repeat;padding:26px 24px 30px;text-align:center;">
    <div style="text-align:right;color:${accent};font-size:13px;margin-bottom:6px;">בס״ד</div>
    ${logo}
    <div style="font-family:Georgia,serif;font-size:30px;font-weight:bold;color:${accent};letter-spacing:1px;margin-top:14px;">${esc(s.orgName.toUpperCase())}</div>
    <div style="font-size:22px;color:#fff;letter-spacing:6px;margin-top:2px;">אמונתך</div>
    <div style="height:2px;width:90px;background:${accent};margin:14px auto 12px;"></div>
    <div style="font-size:13px;color:#d8ecea;">Sensibiliser · Aider · Lutter · Distribuer · Favoriser</div></td></tr>
  <tr><td class="bgp" ${patAttr} style="${pat}padding:40px 36px 12px;">
    <h1 class="ttl" style="margin:0 0 22px;font-family:Georgia,serif;font-size:28px;line-height:1.25;color:${color};text-align:center;">${esc(fill(t.title, c))}</h1>
    ${paras}${button}
  </td></tr>
  <tr><td class="bgp" ${patAttr} style="${pat}padding:24px 36px 30px;text-align:center;border-top:1px solid #eef0f3;">
    <div style="margin:0 0 14px;text-align:center;">${contactLine}</div>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">${esc(s.orgName)} · Association à but non lucratif${s.address ? ' · ' + esc(s.address) : ''}</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">Vous recevez cet email car vous êtes en contact avec ${esc(s.orgName)}.<br>
    <a href="${esc(unsubUrl(c))}" style="color:#9ca3af;">Se désinscrire</a></p>
  </td></tr>
 </table></td></tr></table></body></html>`;
}

// ---------- Brevo ----------
async function brevoSend({ to, toName, subject, html }) {
  const s = db.settings;
  if (!s.brevoApiKey) return { simulated: true, messageId: 'sim-' + uid() };
  if (!s.senderEmail) throw new Error('Email expéditeur manquant (Réglages)');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': s.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: s.senderName || s.orgName, email: s.senderEmail },
      to: [{ email: to, name: toName || undefined }],
      ...(s.replyTo ? { replyTo: { email: s.replyTo, name: s.senderName || s.orgName } } : {}),
      subject, htmlContent: html
    })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.message || `Brevo HTTP ${res.status}`); e.quota = res.status === 429 || /limit|quota|credit/i.test(e.message); throw e; }
  return { messageId: j.messageId };
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
const usedToday = () => Math.max(sentToday(), brevoCache.n);
const nextMidnight = () => new Date(parisDay(Date.now() + 86400000) + 'T00:00:05+02:00').toISOString(); // minuit heure de Paris (le quota Brevo est de toute façon revérifié)
const sentToday = () => db.sends.filter(x => x.status !== 'error' && dayKey(x.at) === dayKey(Date.now())).length;

function dueSends(campaign) {
  const steps = campaign.steps || [];
  if (!steps.length) return [];
  const out = [];
  const tag = (campaign.audienceTag || '').trim().toLowerCase();
  const ok = db.sends.filter(x => x.status !== 'error');
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
  const t = db.templates.find(x => x.id === step.templateId);
  const rec = { id: uid(), at: now(), campaignId: campaign.id, contactId: contact.id, email: contact.email, stepIndex, templateId: step.templateId };
  try {
    if (!t) throw new Error('Template introuvable');
    const r = await brevoSend({ to: contact.email, toName: contact.firstName, subject: fill(t.subject, contact), html: renderEmail(t, contact) });
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
    for (const camp of db.campaigns.filter(c => c.status === 'running')) {
      // répartition sur la période : quota du jour = (restant + déjà envoyé aujourd'hui) / jours restants
      let campCap = Infinity;
      if (camp.endDate) {
        const daysLeft = Math.max(1, Math.round((new Date(camp.endDate) - new Date(todayStr)) / 86400000) + 1);
        const sentC = db.sends.filter(x => x.campaignId === camp.id && x.status !== 'error' && dayKey(x.at) === dayKey(Date.now())).length;
        campCap = Math.ceil((remaining(camp) + sentC) / daysLeft) - sentC;
      }
      const due = dueSends(camp);
      if (!due.length && !pendingCount(camp)) camp.status = 'done'; // plus rien à envoyer ni en attente de délai
      for (const d of due) {
        if (budget <= 0 || campCap <= 0) break;
        const r = await sendOne(camp, d);
        if (r.quota) { budget = 0; break; }
        if (r.status === 'error') { errors++; if (errors >= 3) { budget = 0; } } else { budget--; campCap--; n++; }
        await new Promise(r => setTimeout(r, 250));
      }
    }
    save();
    return { sent: n, errors };
  } finally { ticking = false; }
}

function remaining(camp) { // nombre de mails encore à envoyer
  const tag = (camp.audienceTag || '').trim().toLowerCase();
  let n = 0;
  for (const c of db.contacts) {
    if (c.status !== 'active') continue;
    if (tag && !(c.tags || []).map(t => t.toLowerCase()).includes(tag)) continue;
    const got = new Set(db.sends.filter(x => x.contactId === c.id && x.status !== 'error').map(x => x.templateId));
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
    const got = new Set(db.sends.filter(x => x.contactId === c.id && x.status !== 'error').map(x => x.templateId));
    if (steps.some(st => !got.has(st.templateId))) p++;
  }
  return p;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = req => new Promise((ok, ko) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 8e6) req.destroy(); });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } });
});

function publicSettings() {
  const { brevoApiKey, ...rest } = db.settings;
  return { ...rest, hasKey: !!brevoApiKey, keyHint: brevoApiKey ? '••••' + brevoApiKey.slice(-4) : '' };
}

function campaignStats(c) {
  const s = db.sends.filter(x => x.campaignId === c.id);
  return {
    sent: s.filter(x => x.status !== 'error').length,
    errors: s.filter(x => x.status === 'error').length,
    pending: pendingCount(c),
    steps: (c.steps || []).map((_, i) => s.filter(x => x.stepIndex === i && x.status !== 'error').length)
  };
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
  campaigns: ['name', 'audienceTag', 'steps', 'startDate', 'endDate']
};
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;
  const body = ['POST', 'PUT'].includes(m) ? await readBody(req) : {};

  if (parts[0] === 'state' && m === 'GET') {
    return send(res, 200, {
      settings: publicSettings(), contacts: db.contacts, templates: db.templates,
      campaigns: db.campaigns.map(c => ({ ...c, stats: campaignStats(c) })),
      today: { sent: usedToday(), limit: db.settings.dailyLimit, pausedUntil: db.settings.pausedUntil || null, queue: db.campaigns.filter(c => c.status === 'running').reduce((a, c) => a + remaining(c), 0) },
      sends: db.sends.slice(-60).reverse()
    });
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
  if (parts[0] === 'test-send' && m === 'POST') {
    const t = body.template; if (!t || !body.to) return send(res, 400, { error: 'template + to requis' });
    const fake = { id: 'test', firstName: body.firstName || 'Test', lastName: '', email: body.to };
    try {
      const r = await brevoSend({ to: body.to, toName: fake.firstName, subject: '[TEST] ' + fill(t.subject, fake), html: renderEmail(t, fake) });
      return send(res, 200, r);
    } catch (e) { return send(res, 400, { error: e.message }); }
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
    if (m === 'GET') { const r = await pool.query('select id, day::text as day, name, youtube from public.diffusion order by day desc, created_at desc limit 200'); return send(res, 200, r.rows); }
    if (m === 'POST') {
      const buf = Buffer.from(String(body.data || '').replace(/^data:[^,]+,/, ''), 'base64');
      if (buf.length < 1000 || buf.length > 6e6 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: 'Image JPEG requise (6 Mo max)' });
      const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || '') ? body.day : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      const id = uid();
      await pool.query('insert into public.diffusion (id, day, name, youtube, data) values ($1, $2, $3, $4, $5)', [id, day, String(body.name || '').slice(0, 120), /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(body.youtube || '') ? String(body.youtube).slice(0, 300) : '', buf]);
      return send(res, 200, { id, day });
    }
    if (m === 'DELETE' && parts[1]) { await pool.query('delete from public.diffusion where id = $1', [parts[1]]); return send(res, 200, { ok: true }); }
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
  if (parts[0] === 'tick' && m === 'POST') return send(res, 200, await tick(true));

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
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#eef2f1;font-family:Arial,sans-serif;"><table width="100%" style="padding:24px 12px"><tr><td align="center"><table width="560" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#1f6a72;padding:22px;text-align:center;color:#e4cd8a;font-family:Georgia,serif;font-size:26px;font-weight:bold">${esc(org)}</td></tr><tr><td style="padding:32px 30px;color:#111827;font-size:16px;line-height:1.6"><h2 style="font-family:Georgia,serif;color:#1f6a72;margin:0 0 12px">Réinitialiser votre mot de passe</h2><p>Une demande de réinitialisation a été faite pour votre accès au CRM. Ce lien est valable 1 heure.</p><p style="text-align:center;margin:26px 0"><a href="${link}" style="background:#c4a24a;color:#1b2b2d;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:99px;display:inline-block">Choisir un nouveau mot de passe</a></p><p style="font-size:13px;color:#6b7280">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe ne change pas.</p></td></tr></table></td></tr></table></body></html>`;
  return brevoSend({ to: email, subject: `Réinitialisation de votre mot de passe — ${org}`, html });
}
async function sendInvite(base, email, token) {
  const link = `${base}/invite/${token}`, org = db.settings.orgName || 'Émounatéha';
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#eef2f1;font-family:Arial,sans-serif;"><table width="100%" style="padding:24px 12px"><tr><td align="center"><table width="560" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#1f6a72;padding:22px;text-align:center;color:#e4cd8a;font-family:Georgia,serif;font-size:26px;font-weight:bold">${esc(org)}</td></tr><tr><td style="padding:32px 30px;color:#111827;font-size:16px;line-height:1.6"><h2 style="font-family:Georgia,serif;color:#1f6a72;margin:0 0 12px">Créez votre accès au CRM</h2><p>Vous avez été invité comme <b>super administrateur</b> du CRM d'${esc(org)}.</p><p>Cliquez sur le bouton pour choisir votre mot de passe. Ce lien est valable 7 jours.</p><p style="text-align:center;margin:26px 0"><a href="${link}" style="background:#c4a24a;color:#1b2b2d;text-decoration:none;font-weight:bold;padding:13px 28px;border-radius:99px;display:inline-block">Créer mon mot de passe</a></p><p style="font-size:13px;color:#6b7280">Si le bouton ne marche pas, copiez ce lien : ${link}</p></td></tr></table></td></tr></table></body></html>`;
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
    if (url.pathname === '/api/cron') { // déclenché toutes les minutes (pg_cron / planificateur externe)
      const key = envVar('CRON_SECRET');
      const got = (req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('key');
      if (!key || got !== key) return send(res, 401, { error: 'non autorisé' });
      return send(res, 200, await tick());
    }
    if (url.pathname === '/diffusion-archives.json') { // public : toutes les diffusions publiées, groupées par mois
      if (!pool) return send(res, 200, { months: [] });
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      const r = await pool.query('select id, day::text as day, name, youtube from public.diffusion where day <= $1 order by day desc, created_at desc limit 400', [today]);
      const months = [];
      for (const x of r.rows) { const k = x.day.slice(0, 7); let m = months.find(y => y.key === k); if (!m) { m = { key: k, items: [] }; months.push(m); } m.items.push(x); }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }); return res.end(JSON.stringify({ months }));
    }
    if (url.pathname === '/diffusion.json') { // public : dernières diffusions publiées
      if (!pool) return send(res, 200, []);
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      const r = await pool.query('select id, day::text as day, name, youtube from public.diffusion where day <= $1 order by day desc, created_at desc limit 3', [today]);
      return send(res, 200, r.rows);
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
    if (isCrm) return reply(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', { 'cache-control': 'private, max-age=120' });
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
}

if (require.main === module) {
  const server = http.createServer(handle);
  loadDb().then(() => {
    server.listen(PORT, '127.0.0.1', () => console.log(`CRM Emounateha → http://localhost:${PORT} (${pool ? 'Supabase' : 'fichier local'})`));
    setInterval(() => tick().catch(console.error), 60000);
  }).catch(e => { console.error('Démarrage impossible :', e.message); process.exit(1); });
}
module.exports = handle;
