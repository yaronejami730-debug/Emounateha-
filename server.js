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

fs.mkdirSync(DATA_DIR, { recursive: true });

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
if (DATABASE_URL) { const { Pool } = require('pg'); pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 }); }

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
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261102230000_crm_schema.sql'), 'utf8');
    await pool.query(sql);
    const st = await pool.query('select data from public.settings where id = 1');
    const any = await pool.query('select (select count(*) from public.templates) t, (select count(*) from public.contacts) c');
    if (st.rows.length || +any.rows[0].t || +any.rows[0].c) {
      loaded = { settings: st.rows[0]?.data || {} };
      for (const t of Object.keys(TABLES)) {
        const r = await pool.query(`select * from public.${t}` + (t === 'sends' ? ' order by at' : ' order by created_at'));
        loaded[t] = r.rows.map(x => fromRow(t, x));
        lastSnap[t] = new Map(loaded[t].map(o => [o.id, JSON.stringify(o)]));
      }
    } else { // migration de l'ancien stockage clé/valeur, si présent
      const old = await pool.query("select to_regclass('public.crm_kv') as r");
      if (old.rows[0].r) { const r = await pool.query('select key, value from public.crm_kv'); if (r.rows.length) { loaded = {}; for (const x of r.rows) loaded[x.key] = x.value; } }
    }
  }
  if (!loaded) { try { loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { loaded = defaultDb(); } }
  db = { ...defaultDb(), ...loaded, settings: { ...defaultDb().settings, ...(loaded.settings || {}) } };
  await persist();
}
let persisting = Promise.resolve();
function persist() {
  const snap = JSON.stringify(db);
  fs.writeFileSync(DB_FILE + '.tmp', snap); fs.renameSync(DB_FILE + '.tmp', DB_FILE); // copie locale de secours
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
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 150); }

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
  <tr><td class="hdr" background="${abase}/header.jpg" bgcolor="#1f6a72" style="background:#1f6a72 url('${abase}/header.jpg') center top/cover no-repeat;padding:26px 24px 30px;text-align:center;">
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
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
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
const nextMidnight = () => { const d = new Date(); d.setHours(24, 0, 5, 0); return d.toISOString(); };
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
    const h = new Date().getHours();
    if (!force && (h < s.hourFrom || h >= s.hourTo)) return { skipped: 'hors plage horaire' };
    if (s.pausedUntil && Date.now() < +new Date(s.pausedUntil)) return { skipped: 'limite Brevo atteinte, reprise demain' };
    await brevoToday(force);
    let budget = Math.min(s.dailyLimit - usedToday(), force ? 50 : s.perMinute);
    await brevoToday(force);
    if (s.dailyLimit - usedToday() <= 0) { s.pausedUntil = nextMidnight(); save(); return { skipped: 'limite du jour atteinte, reprise demain' }; }
    let n = 0, errors = 0;
    const todayStr = new Date().toISOString().slice(0, 10);
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
      return send(res, 200, merged.slice(0, url.searchParams.get('all') ? 80 : 8));
    } catch (e) { return send(res, 200, []); }
  }
  if (parts[0] === 'diffusion') {
    if (!pool) return send(res, 400, { error: 'Base de données requise' });
    if (m === 'GET') { const r = await pool.query('select id, day::text as day, name, youtube, length(data) as size from public.diffusion order by day desc, created_at desc limit 200'); return send(res, 200, r.rows); }
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
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
    const pw = envVar('CRM_PASSWORD');
    if (pw && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/crm'))) {
      const got = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      if (got.split(':').slice(1).join(':') !== pw) { res.writeHead(401, { 'www-authenticate': 'Basic realm="CRM Emounateha"' }); return res.end('Authentification requise'); }
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/u/')) {
      const c = db.contacts.find(x => x.id === url.pathname.slice(3));
      if (c) { c.status = 'unsubscribed'; save(); }
      return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:Arial;text-align:center;padding:80px 20px;color:#374151"><h2>Désinscription confirmée</h2><p>Vous ne recevrez plus d'emails de ${esc(db.settings.orgName)}.</p>`, 'text/html; charset=utf-8');
    }
    let p = url.pathname === '/' ? '/index.html' : (url.pathname === '/crm' || url.pathname === '/crm/') ? '/crm/index.html' : url.pathname;
    let file = path.join(PUBLIC, path.normalize(p));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, { error: e.message }); }
});
loadDb().then(() => {
  server.listen(PORT, '127.0.0.1', () => console.log(`CRM Emounateha → http://localhost:${PORT} (${pool ? 'Supabase' : 'fichier local'})`));
  setInterval(() => tick().catch(console.error), 60000);
}).catch(e => { console.error('Démarrage impossible :', e.message); process.exit(1); });
