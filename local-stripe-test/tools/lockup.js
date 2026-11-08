// assemble : rond + « אמונתך » + filet + « EMOUNATEHA » -> logo-asso.png (fond transparent)
const puppeteer = require('puppeteer-core'); const path = require('path'); const fs = require('fs');
const emb = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'emblem.png')).toString('base64');
const html = `<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@900&family=Cinzel:wght@600&display=swap" rel="stylesheet">
<style>html,body{margin:0;background:transparent}#l{display:inline-block;width:1000px;text-align:center;padding:10px 0 6px}
#l img{width:1000px;height:1000px;display:block}
.he{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:330px;line-height:1;margin-top:56px;direction:rtl;background:linear-gradient(180deg,#e2c477 0%,#b58c36 42%,#7d5c16 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.ln{width:560px;height:6px;margin:22px auto 26px;background:linear-gradient(90deg,transparent,#b58c36 18%,#d8b865 50%,#b58c36 82%,transparent)}
.la{font-family:'Cinzel',serif;font-weight:600;font-size:88px;letter-spacing:.34em;color:#6a5120;padding-left:.34em}</style>
<div id=l><img src="${emb}"><div class=he>אמונתך</div><div class=ln></div><div class=la>EMOUNATEHA</div></div>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const p = await b.newPage(); await p.setViewport({ width: 1040, height: 1800, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'networkidle0' }); await p.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 400));
  const el = await p.$('#l'); await el.screenshot({ path: path.join(__dirname, '..', 'logo-asso.png'), omitBackground: true }); await b.close(); console.log('logo-asso.png écrit');
})();
