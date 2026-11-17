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

## À décider par Yarone

1. **Images d'aperçu WhatsApp** : elles font 1080×1350. WhatsApp peut les recadrer et couper le titre. Les refaire en 1200×630 ?
2. **Menu sur petite fenêtre (801 à 1100 px de large)** : l'écriture reste petite (8,4 à 11,5 px). Y afficher le menu burger ?
3. **Carte Rabbénou Tam dans le Sidour** : quel contenu (biographie, Zman Rabbénou Tam, autre) ?
4. **Cagnottes indépendantes** : où les mettre ? Proposition : une page « Cagnottes » avec un bouton.
5. **Case « Afficher mon nom parmi les membres »** (Club) : elle ne sert plus depuis que la liste des membres est supprimée. La retirer ?
6. **Événement « Donate » du pixel Meta** : le garder, ou garder seulement le pixel ?
7. **ב״ה** : l'aligner aussi sur la carte de visite, « Écrire au Rabbi », la page Hanouka et le back-office (ils ont le leur, d'une taille un peu différente) ?
8. **« Actualité » sur ambassadeur.emounateha.fr** : l'ajouter aussi à son menu ?
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
- **Contrôle après déploiement** : son premier passage échoue une fois juste après une mise en ligne, puis passe. Le faire réessayer tout seul.
- **Titre d'un besoin qui « ne se met pas à jour »** : lequel, et où ? (le site garde les titres en mémoire 20 à 60 secondes).
- **Pages sans bandeau de consentement** : carte de visite et simulateur.
- **`POINT.md`** date du 8 novembre et n'est plus à jour.
