/* Chiffrement des données au repos : AES-256-GCM (chiffrement + intégrité).
   La clé (DATA_KEY, 64 caractères hexadécimaux) reste dans .env, hors de Git. Sans elle, data.json et les PDF sont illisibles.
   Format d'un fichier chiffré : "EMV1" + IV (12 octets) + tag (16 octets) + données. Le nom du fichier est lié au chiffrement (AAD) :
   un fichier copié sous un autre nom est refusé. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MAGIC = Buffer.from('EMV1');

function ensureKey(envPath) {
  if (/^[0-9a-f]{64}$/i.test(process.env.DATA_KEY || '')) return;
  const k = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(envPath, `${fs.existsSync(envPath) && !/\n$/.test(fs.readFileSync(envPath, 'utf8')) ? '\n' : ''}DATA_KEY=${k}\n`, { mode: 0o600 });
  try { fs.chmodSync(envPath, 0o600); } catch (e) {}
  process.env.DATA_KEY = k;
  console.log('[sécurité] clé de chiffrement DATA_KEY créée dans .env (à sauvegarder : sans elle, les données chiffrées sont perdues).');
}
const key = () => Buffer.from(process.env.DATA_KEY, 'hex');
const isEncrypted = buf => buf.length > 32 && buf.subarray(0, 4).equals(MAGIC);
function encrypt(plain, name) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv); c.setAAD(Buffer.from(path.basename(name)));
  const ct = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
let allowPlain = false;                                                 // vrai seulement pendant la migration au démarrage
const setAllowPlain = b => { allowPlain = !!b; };
function decrypt(buf, name) {
  if (!isEncrypted(buf)) { if (allowPlain) return buf; throw new Error('Fichier non chiffré ou en-tête altéré : ' + path.basename(name)); }   // jamais de repli silencieux sur du clair
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAAD(Buffer.from(path.basename(name))); d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(32)), d.final()]);       // lève une erreur si le fichier a été modifié
}
function writeFile(file, plain) { const t = file + '.tmp'; fs.writeFileSync(t, encrypt(Buffer.isBuffer(plain) ? plain : Buffer.from(plain), file), { mode: 0o600 }); fs.renameSync(t, file); }
const readFile = file => decrypt(fs.readFileSync(file), file);
function migrateDir(dir) {                                             // chiffre ce qui était resté en clair
  let n = 0; for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (!fs.statSync(p).isFile() || /\.tmp$/.test(f)) continue; const raw = fs.readFileSync(p); if (!isEncrypted(raw)) { writeFile(p, raw); n++; } } return n;
}
module.exports = { setAllowPlain, ensureKey, isEncrypted, encrypt, decrypt, readFile, writeFile, migrateDir };
