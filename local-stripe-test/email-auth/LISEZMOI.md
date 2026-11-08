# Logo dans Gmail (BIMI) — ce qu'il faut faire, dans l'ordre

*Domaine : `emounateha.fr` — DNS géré chez Hostinger — expéditeur des emails de don : `contact@emounateha.fr` (via Brevo).*

## État au 8 novembre 2026 (vérifié en lecture seule)
| Élément | État |
|---|---|
| DKIM Brevo (`brevo1/2._domainkey`) | ✅ en place |
| SPF | ❌ absent |
| DMARC | ⚠️ `p=none` (surveillance seulement) |
| BIMI | ❌ absent |
| Certificat de marque (VMC / CMC) | ❌ à acheter |

## Étape 1 — SPF (tout de suite, gratuit)
Hostinger → DNS → ajouter un enregistrement **TXT** sur `@` (le domaine lui-même) :
```
v=spf1 include:spf.brevo.com ~all
```
(S'il existe déjà un SPF, ne pas en créer un second : ajouter `include:spf.brevo.com` dans l'existant. Un domaine ne doit avoir qu'un seul SPF.)

## Étape 2 — DMARC en trois temps (gratuit)
Sur `_dmarc` (TXT). Aujourd'hui : `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`
1. Laisser `p=none` **2 à 4 semaines** après l'étape 1, et vérifier dans les rapports que les emails de Brevo passent (SPF et DKIM alignés).
2. Puis : `v=DMARC1; p=quarantine; pct=100; rua=mailto:rua@dmarc.brevo.com`
3. Enfin (recommandé) : `v=DMARC1; p=reject; pct=100; rua=mailto:rua@dmarc.brevo.com`

⚠️ Ne pas passer directement à `reject` : un email légitime mal signé serait perdu.
Gmail exige au minimum `quarantine` à 100 % pour afficher le logo.

## Étape 3 — Le logo (fichier `bimi-logo.svg`, dans ce dossier)
Format exigé : SVG « Tiny PS », carré, fond plein, sans image ni texte.
⚠️ **Le fichier fourni est une ébauche simplifiée** (anneaux doré et bleu-vert) : le vrai logo contient une photo et du texte, impossibles dans ce format. Pour le certificat, le logo vectoriel doit être **identique à la marque déposée** : à faire redessiner en vectoriel par un graphiste, ou à valider avec l'autorité de certification.
À héberger en HTTPS, par exemple : `https://www.emounateha.fr/bimi/logo.svg`.

## Étape 4 — Le certificat (payant)
- **VMC** : demande une marque déposée (INPI). Logo avec coche bleue dans Gmail.
- **CMC** : logo prouvé en usage depuis plus d'un an, sans marque déposée. Logo affiché sans la coche.
- Prix : environ 1 000 à 1 500 $ par an (DigiCert, Entrust, SSL.com…). Délai : quelques semaines.
Le fichier reçu (`.pem`) est à héberger en HTTPS, par exemple `https://www.emounateha.fr/bimi/certificat.pem`.

## Étape 5 — La ligne BIMI (une fois le certificat obtenu)
TXT sur `default._bimi` :
```
v=BIMI1; l=https://www.emounateha.fr/bimi/logo.svg; a=https://www.emounateha.fr/bimi/certificat.pem
```

## Vérifier
- DMARC / SPF / BIMI : https://bimigroup.org/bimi-generator/ et https://mxtoolbox.com
- Brevo : domaine « authentifié » dans Paramètres → Expéditeurs, domaines.
- Le logo met parfois quelques jours à apparaître après l'étape 5.
