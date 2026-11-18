# Ce qui reste à faire — Émounatéha

*Écrit le 17 novembre 2026 au soir, à reprendre à la prochaine séance.*

## Fait et mis en ligne ce soir (pour mémoire)

- Sidour : « Méïn Chalosh » dans un onglet à part, flèches de page dorées regroupées sous la page.
- Menu : « Actualité » ajoutée ; menu du haut plus lisible sur ordinateur.
- Actions : cartes 1-2-3 plus fines, bloc « Aidez-nous à les aider » compact, bouton « Partager ».
- Soutien moral : vidéo du Club ’Haï à la place de la vidéo YouTube.
- Un toit sur la tête : « Mission Hébergement » + Faire un don / Offrir un colis.
- Or du logo hébreu sur tous les fonds dorés.
- Accueil : bouton musique à gauche d'« אמונתך », plus de « fumée » sous la bannière (téléphone).
- Torah : 5 onglets carrés égaux.
- Horaires : pastille de date entière.
- Club ’Haï : ב״ה en haut à droite, « Retour au site » et « Partager » sous le logo.
- ב״ה en haut à droite de toutes les pages (site, pages de don, pages légales, Sidour).
- Colis et page de paiement : bouton « Partager » avec la bonne adresse.
- Aperçus WhatsApp : image propre pour Actualités et pour le Sidour.

## Fait le 18 novembre, EN LOCAL, pas encore en ligne

- Menu burger affiché aussi de 801 à 1100 px de large (tablette, téléphone à l'horizontale, petite fenêtre) : fini l'écriture de 8 px. Vérifié sur 9 pages × 5 tailles.
- ב״ה : même style que l'accueil sur la carte de visite, « Écrire au Rabbi » et la page Hanouka ; contrôlé sur 18 pages × 11 tailles d'écran.
- « Actualité » dans le menu de la page ambassadeur.
- Contrôle après déploiement : refait tout seul un second passage 30 s plus tard si le premier échoue.
- Page Hanouka : à l'horizontale, la page défile et « Aller sur le site » est atteignable ; le prix « 130 € » tient dans le bouton sur les petits écrans.
- Accueil, roue des actions : sur les téléphones de 400 px et moins, les sous-titres courbes sont retirés (ils se montaient dessus) ; on garde le titre de chaque pastille. NON revu sur capture.
- Colis : « chaque semaine » n'est plus coupé sur 320 px.
- 10 images d'aperçu WhatsApp en format large 1200×630 prêtes dans `public/apercus/large/`, PAS branchées (décision n° 1).

## Trouvé par l'audit téléphones du 18 novembre, pas encore corrigé

- Téléphone à l'horizontale : les bandeaux du haut (Hanouka + Club + menu) prennent 36 % de l'écran sur l'accueil.
- Accueil, « Parole du Rabbi » : sur 320 px le texte touche la photo ; la signature « Rabbi de Loubavitch » est en 7 px.
- Petits textes sous 11 px : onglets de la Torah (9,2 px), onglets des colis (8,8 px), « Recevoir les horaires par e-mail » (8,6 px), carte de visite (8,5 px), bandeaux du haut sur 320 px.
- Boutons un peu petits pour le doigt (moins de 36 px) : bouton d'appel de la barre (34), flèche du carrousel (28), bouton musique (30), « Partager » (34), flèches de date des Horaires (27).
- Détails : dernière ligne du pied de page collée au bord, titre du Sidour coupé sur 320 px, adresse d'exemple coupée en plein mot sur la page ambassadeur.
- `ecriture.css` contient une accolade `}` en trop (ligne 30), présente depuis longtemps : elle fait probablement ignorer la règle suivante. À regarder avant d'y toucher.
- Audit du site en ligne : 80 liens et ressources, 23 aperçus de partage, aucun cassé.

## À décider par Yarone

1. **Images d'aperçu WhatsApp** : elles font 1080×1350. WhatsApp peut les recadrer et couper le titre. Les refaire en 1200×630 ?
2. ~~Menu sur petite fenêtre~~ : fait en local le 18 novembre (menu burger).
3. **Carte Rabbénou Tam dans le Sidour** : quel contenu (biographie, Zman Rabbénou Tam, autre) ?
4. **Cagnottes indépendantes** : où les mettre ? Proposition : une page « Cagnottes » avec un bouton.
5. **Case « Afficher mon nom parmi les membres »** (Club) : elle ne sert plus depuis que la liste des membres est supprimée. La retirer ?
6. **Événement « Donate » du pixel Meta** : le garder, ou garder seulement le pixel ?
7. **ב״ה sur le back-office** (page d'administration) : l'ajouter ? Les autres pages sont faites.
8. ~~« Actualité » sur la page ambassadeur~~ : fait en local le 18 novembre.
9. **Image de départ de la vidéo de Soutien moral** : c'est une image prise au hasard. En choisir une autre ?
10. **Colis de Simhat Torah** : il n'a pas d'adresse de don à lui, son bouton « Partager » envoie la page générale des colis. Lui créer une adresse ?
11. **Musique de l'accueil** : c'est un essai. Garder ce morceau ?

## À vérifier par Yarone

- **Pixel Meta** : dans le Gestionnaire d'événements, « Tester les événements », ouvrir `www.emounateha.fr/?fbclid=essai`, accepter le bandeau, voir « PageView ». « Donate » se vérifie au premier vrai don.
- **Webhook Stripe réel** : il doit écouter `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`.
- **Prochaine mensualité réelle du Club** : vers le 16 décembre 2026, vérifier qu'un reçu part.
- **Vrais téléphones** : les captures sont faites aux tailles d'écran des iPhone 11, 14, 17, Samsung S24 et iPhone SE, pas sur les vrais appareils. Regarder sur un vrai iPhone et un vrai Samsung.

## À faire côté technique

- **Sidour** : 207 pages manquent (136 sur 343). Il faut les scans.
- **Titre d'un besoin qui « ne se met pas à jour »** : lequel, et où ? (le site garde les titres en mémoire 20 à 60 secondes).
- **Pages sans bandeau de consentement** : carte de visite et simulateur.
- **`POINT.md`** date du 8 novembre et n'est plus à jour.
