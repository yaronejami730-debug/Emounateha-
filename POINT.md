# Point d'étape — site Émounatéha, paiement Stripe et reçus CERFA

*État au 8 novembre 2026. Branche : `paiement-cerfa` (locale, **non publiée**).*

---

## 1. Où on en est, en trois lignes

- **Le site public** a été enrichi et **mis en ligne** (pages d'actions, vidéos par colis, photos aux œufs blancs, bouton d'appel, SEO).
- **Le paiement Stripe + le reçu CERFA** fonctionnent **en local, en mode test**, sur une branche à part. Rien de cela n'est en ligne.
- **Il manque** surtout : la validation juridique du CERFA, l'envoi réel des emails, le branchement au CRM/base de données, et la mise en ligne sécurisée du paiement.

---

## 2. Les branches (pour ne pas se mélanger)

| Branche | Contenu | Publiée ? |
|---|---|---|
| `main` | Le site en ligne `www.emounateha.fr` | **Oui** (dernier commit publié : `5f7133c`) |
| `paiement` | Ancien paiement AlloDons (session depuis le site) | Oui, déjà fusionnée dans `main` |
| `horaires` | Page horaires | Oui, déjà fusionnée |
| `ambassadeur` | Page « Devenir ambassadeur » | **Non**, locale, à ne pas publier sans accord |
| **`paiement-cerfa`** | **Stripe + CERFA + configuration des donateurs** (ce dossier) | **Non**, locale |

Le dossier de la branche `paiement-cerfa` est : `/Users/yarone/Emounateha-paiement-cerfa`
→ c'est celui à **ouvrir dans Antigravity** pour travailler sur le paiement sans toucher au site.
Tout le code est dans le sous-dossier `local-stripe-test/`.

---

## 3. Ce qui est fait

### 3.1 Sur le site (en ligne, branche `main`)
- **Quatre pages d'actions** : Réinsertion sociale, Vêtements & soins, Un toit sur la tête, Soutien moral & financier (texte explicatif, vidéo à la une, appel au don). Les quatre cartes de l'accueil y mènent. Elles sont dans le sitemap.
- **Page Colis** : vidéos de la chaîne YouTube Émounatéha rangées **automatiquement par fête** (d'après le titre), lecteur en grand avec bouton « Participer à ce colis » et don AlloDons intégré (Hanouka, Pessa'h et Pourim ont leur page AlloDons dédiée). Photos de colis plus petites et **œufs blancs** partout (4 photos refaites).
- **Bouton d'appel** (téléphone qui bouge) dans la barre du haut et dans le menu sous « Contact ». Appel normal, pas WhatsApp.
- Surbrillance du bouton « Écrire une lettre au Rabbi », aperçu vidéo au survol corrigé, icônes des actions plus petites, horaires en Bree Serif, pied de page en **SIREN** (sans le `00010`).
- **SEO** : titres, descriptions, Open Graph, données structurées, sitemap, robots.txt. Search Console : domaine `emounateha.fr` validé (DNS), sitemap envoyé, **indexation demandée** pour les 8 pages d'origine.

### 3.2 Sur le site mais **non publié** (reste en local sur `main`)
- Le **classement des 29 vidéos** de la chaîne dans les bonnes pages (`server.js`, route `/api/action-videos`) : en ligne il n'y a encore que la version précédente (peu de vidéos par page).
- Les 4 pages d'actions régénérées (date du jour dans la barre, effet au défilement).
- *Ces modifications sont dans le dossier principal `/Users/yarone/Emounateha`, non commitées.*

### 3.3 Paiement et reçus (branche `paiement-cerfa`, local, mode test)
- **Page de don** `/` : parcours en écrans (montant → coordonnées → paiement), barre d'action fixe en bas sur téléphone, formulaire calqué sur AlloDons (26 / 52 / 126 / 252 / 770 / 1 540 €, autre montant, **ponctuel ou mensuel**, affectation du don), autocomplétion des adresses (Base Adresse Nationale, IGN), bouton « Données au hasard » pour tester.
- **Paiement Stripe** : carte, **Apple Pay et Google Pay** (boutons express). Le serveur vérifie toujours auprès de Stripe que le paiement a réussi avant de créer le reçu.
- **Reçu CERFA en PDF** à l'identique de celui d'AlloDons, avec : logo Émounatéha (PNG transparent), signature, numéro d'ordre, **toutes les mentions** (identité complète de l'organisme, case 200 / 238 bis / 978, forme et nature du don, date, mode de versement à 3 cases, contrepartie, signature, mentions légales, conservation, sanctions, RGPD).
- **Back-office** `/backoffice/` : générer un reçu **sans paiement** (virement, chèque, espèces).
- **Email** : le reçu PDF est joint à un email. Sans SMTP configuré, il est enregistré en fichier `.eml` (à ouvrir dans Mail).
- **Don mensuel** : abonnement Stripe, première échéance avec reçu.
- Tunnel HTTPS temporaire pour tester sur le téléphone (Cloudflare). Seule la page de don y est ouverte : le back-office et la création de reçus sont bloqués hors de l'ordinateur.

---

## 4. Ce qu'on avait déjà avant (à ne pas refaire)
- Site, CRM de relance (Brevo), diffusion de la Torah (Tanya), horaires de Chabbat, page Hanouka, paiement AlloDons par session.
- **AlloDons** continue de gérer les dons du site en ligne (reçu fiscal instantané). Le Stripe de la branche `paiement-cerfa` est une **alternative en test**, pas encore branchée au site.

---

## 5. Ce qui manque (par priorité)

### À faire avant toute mise en ligne du paiement
1. **Validation juridique du CERFA** par l'expert-comptable ou l'administration : les mentions, le texte « Œuvre ou organisme d'intérêt général », la signature par image, le **formulaire des entreprises** (aujourd'hui : même formulaire avec la case 238 bis, titre adapté ; à confirmer).
2. **Numérotation réelle** : retirer le préfixe `TEST-` (format type `A2026/00394` chez AlloDons), numéros uniques et chronologiques, stockés en base.
3. **Stockage** : aujourd'hui les reçus et le compteur sont dans un fichier local. Il faut les mettre dans la base (Supabase) et les rattacher au CRM.
4. **Envoi réel des emails** (Brevo ou SMTP) avec le PDF en pièce jointe.
5. **Webhook Stripe** : pour les dons mensuels (un reçu à chaque prélèvement) et pour ne jamais perdre un paiement si le téléphone se déconnecte.
6. **Hébergement du serveur** : le PDF est fabriqué avec Chrome ; sur Vercel il faut une variante adaptée, ou un petit serveur séparé.
7. **Passage en clés Stripe réelles** (`sk_live` / `pk_live`), enregistrement du domaine `www.emounateha.fr` pour Apple Pay **en mode réel**, et dépôt du fichier de vérification Apple dans `/.well-known/` du site.
8. **Sécurité du back-office** : mot de passe / connexion (il est aujourd'hui seulement réservé à l'ordinateur local).
9. **RGPD** : politique de confidentialité, durée de conservation (6 ans pour les reçus), information du donateur, registre des traitements. Mention sur l'API d'adresses (IGN) si l'autocomplétion est gardée.

### Côté contenu et site
- **Réinsertion sociale** et **Vêtements & soins** : aucune vidéo trouvée sur la chaîne. Il faut tes vidéos (ou leurs liens).
- Publier le classement des 29 vidéos (voir 3.2).
- Demander l'indexation Search Console des 4 nouvelles pages d'actions.
- Fiche Google Business Profile à créer (texte à préparer).

### Idées en attente de ta décision
- **Mesure d'intention anonyme** (compteurs sans cookie : colis, hébergement, mensuel…) et boutons « Je veux aider / J'ai besoin d'aide » : proposition faite, **en attente de tes trois réponses**.

---

## 6. Points d'attention connus
- **Apple Pay / Google Pay** : le bouton ne se charge **que si Link est activé** sur le compte Stripe, et si l'on n'ajoute pas les réglages d'affichage `buttonTheme` / `layout` (ils bloquent le chargement). Link est donc activé ; sa ligne « paiement rapide avec Link » apparaît dans le formulaire de carte.
- Apple Pay exige un **domaine HTTPS réel** (pas `localhost`). En test, c'est l'adresse du tunnel qui est enregistrée chez Stripe ; elle change à chaque nouveau tunnel.
- Le logo « rond » garde ses lettres **bleu-vert** « ÉMOUNATÉHA » : c'est le dessin d'origine. Il se recolore en doré si tu préfères.
- Les clés Stripe de test sont dans `local-stripe-test/.env` (ignoré par Git, **jamais commité**). Les clés ont été collées dans la conversation : par prudence, les remplacer ("rouler") dans le tableau de bord Stripe avant toute vraie utilisation.
- La signature (`signature.png`) et les reçus générés sont aussi exclus de Git.

---

## 7. Relancer le test en local

```bash
cd /Users/yarone/Emounateha-paiement-cerfa/local-stripe-test
npm install                  # une seule fois
cp .env.example .env         # puis y coller les clés Stripe de TEST
node server.js               # page de don : http://127.0.0.1:3100/
                             # back-office  : http://127.0.0.1:3100/backoffice/
python3 build.py             # reconstruit les pages à partir du site
python3 tools/make_logo.py <logo_rond.jpg> && node tools/lockup.js   # reconstruit le logo transparent
```

Carte de test Stripe : `4242 4242 4242 4242`, date future, CVC `123`.
Le tunnel HTTPS pour le téléphone : `cloudflared tunnel --url http://127.0.0.1:3100` (puis enregistrer l'adresse chez Stripe pour Apple Pay).
