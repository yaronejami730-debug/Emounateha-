/* Stockage persistant pour Vercel (fonctions sans disque durable).
   Le code reste identique à la version locale (fichiers) : à chaque requête, data.json (et le reçu demandé) est rechargé depuis Postgres
   dans /tmp, puis tout ce qui a changé est réécrit, le tout dans UNE transaction verrouillée (pg_advisory_xact_lock) :
   deux requêtes ne se croisent jamais (pas de doublon ni de trou dans la numérotation des reçus). Les fichiers sont déjà chiffrés (vault.js). */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { Pool } = require('pg');
const LOCK = 424242;
module.exports = function createStore({ DATA, RECUS }) {
  let url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant');
  // pooler Supabase : le mode « session » (5432) est limité à 15 clients ; le mode « transaction » (6543) convient (tout se fait dans une transaction)
  url = url.replace(/(pooler\.supabase\.com):5432\b/, '$1:6543');
  const pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 1000, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  pool.on('error', e => console.error('[store] connexion perdue', e.message));
  let ready = null;
  const ensure = () => ready || (ready = pool.query('create table if not exists don_kv (key text primary key, value bytea not null, updated_at timestamptz not null default now())').catch(e => { ready = null; throw e; }));
  // routes qui n'ont pas besoin des données (aucune connexion ouverte)
  const SANS = /^\/api\/(config|siret|vu)\b/;
  const same = (a, b) => a && b && Buffer.compare(a, b) === 0;
  // Copie gardée en mémoire avec son empreinte : data.json n'est retéléchargé que si l'empreinte en base a changé
  // (avant : téléchargé en entier à chaque requête, d'où une grosse consommation de bande passante Supabase).
  const md5 = b => crypto.createHash('md5').update(b).digest('hex');
  let cache = null; // { h, buf }
  return async (req, res, next) => {
    const p = req.path;
    if (!(p === '/webhook' || p.startsWith('/api/') || p.startsWith('/recus/') || p.startsWith('/u/')) || SANS.test(p)) return next();
    let c, t0 = Date.now() - 1000, base = null, done = false, pending = null;
    try {
      await ensure(); c = await pool.connect();
      await c.query('begin'); await c.query("set local lock_timeout = '25s'"); await c.query('select pg_advisory_xact_lock($1)', [LOCK]);
      const hr = await c.query("select md5(value) as h from don_kv where key = 'data.json'");
      if (!hr.rows[0]) { cache = null; try { fs.unlinkSync(DATA); } catch (e) {} }
      else {
        if (!cache || cache.h !== hr.rows[0].h) {
          const r = await c.query("select value from don_kv where key = 'data.json'");
          cache = { h: md5(r.rows[0].value), buf: r.rows[0].value };
        }
        base = cache.buf; fs.writeFileSync(DATA, base, { mode: 0o600 });
      }
      const m = p.match(/^\/recus\/([^/?]+)$/) || (p === '/api/admin/pdf' && req.query && req.query.f ? [0, encodeURIComponent(String(req.query.f))] : null);
      if (m) { const f = path.basename(decodeURIComponent(m[1])), rr = await c.query('select value from don_kv where key = $1', ['recus/' + f]); if (rr.rows[0]) fs.writeFileSync(path.join(RECUS, f), rr.rows[0].value, { mode: 0o600 }); }
    } catch (e) {
      console.error('[store] lecture impossible', e.message); try { if (c) { await c.query('rollback'); c.release(); } } catch (x) {}
      return res.status(503).json({ error: 'Stockage indisponible, réessayez dans un instant.' });
    }
    const finish = async ok => {
      if (done) return; done = true;
      try {
        if (ok) {
          if (fs.existsSync(DATA)) { const now = fs.readFileSync(DATA); if (!same(now, base)) { await c.query("insert into don_kv (key, value) values ('data.json', $1) on conflict (key) do update set value = excluded.value, updated_at = now()", [now]); pending = now; } }
          for (const f of fs.existsSync(RECUS) ? fs.readdirSync(RECUS) : []) { const fp = path.join(RECUS, f); if (fs.statSync(fp).mtimeMs >= t0) await c.query('insert into don_kv (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()', ['recus/' + f, fs.readFileSync(fp)]); }
          await c.query('commit');
          if (pending) cache = { h: md5(pending), buf: pending };   // seulement une fois l'écriture validée
        } else await c.query('rollback');
      } catch (e) { console.error('[store] écriture impossible', e.message); try { await c.query('rollback'); } catch (x) {} }
      finally { c.release(); }
    };
    const end = res.end;
    res.end = function (...a) { finish(res.statusCode < 500).then(() => end.apply(res, a)); return res; };   // la réponse ne part qu'une fois tout enregistré
    res.on('close', () => finish(false));
    next();
  };
};
