"""Fabrique logo-asso.png (fond TRANSPARENT) à partir du logo d'origine propre (rond haute définition) :
   1) le rond est extrait de emounateha_profil_2048.jpg (fond blanc -> transparent, sans reste de couleur)
   2) « אמונתך » + filet + « EMOUNATEHA » sont recomposés avec de vraies polices (aucune découpe d'image sur fond bleu)
Usage : python3 tools/make_logo.py <logo_rond.jpg>"""
import sys, os, numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/emounateha_profil_2048.jpg')
im = Image.open(src).convert('RGB'); ImageDraw.Draw(im).rectangle((int(im.width*0.78), int(im.height*0.04), im.width, int(im.height*0.14)), fill=(255, 255, 255))  # retire « B''H »
a = np.asarray(im).astype(np.float32)
# « couleur vers transparence » (fond blanc) : l'encre garde sa vraie couleur, les bords sont doux
alpha = np.clip((255 - a).max(axis=-1) / 255.0 * 1.0, 0, 1)
alpha = np.where(alpha < 0.03, 0, alpha)
al = np.maximum(alpha, 1e-3)[..., None]
fg = np.clip(255 - (255 - a) / al, 0, 255)
# l'intérieur du rond (fond blanc entre les mains) doit rester BLANC et opaque : zone circulaire pleine
h, w = alpha.shape; yy, xx = np.ogrid[:h, :w]; cy, cx = h * 0.49, w * 0.50; r = min(h, w) * 0.355
disk = ((yy - cy) ** 2 + (xx - cx) ** 2) <= r ** 2
alpha = np.where(disk, np.maximum(alpha, 1.0), alpha); fg = np.where(disk[..., None], a, fg)
rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
emb = Image.fromarray(rgba); bb = emb.getbbox(); emb = emb.crop(bb)
side = max(emb.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(emb, ((side - emb.width) // 2, (side - emb.height) // 2))
sq.resize((1000, 1000), Image.LANCZOS).save(os.path.join(HERE, 'emblem.png'))
print('rond transparent :', sq.size)
