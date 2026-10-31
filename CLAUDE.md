# Applis de la ferme

Un seul site pour les petits outils de la ferme (dose de semis, puis irrigation
enrouleur et ce qu'on ajoutera), avec un espace par exploitation et un compte par personne.
Il a remplacé le 08/10/2026 les sites séparés `dose-de-semis` et `calcul-irrigation-enrouleur`
(sites, base, dossiers et dépôts GitHub supprimés ; copie de l'ancienne base dans `sauvegardes/`).

Julien Pichot n'est pas développeur. Réponds en français, explique ce que tu fais en
mots simples, et évite le jargon quand un mot courant suffit.

## Décisions (Julien, 08/10/2026)

- Nom et adresse : **applis-de-la-ferme** → https://applis-de-la-ferme.pages.dev
  (à ne plus changer une fois installé sur les téléphones).
- En **page Cloudflare (Pages + Functions)**, comme le site des heures et le cahier du soir,
  pas en Worker. Base D1 `applis-de-la-ferme` (WEUR), sessions par cookie, mots de passe
  hachés (PBKDF2). Compte Cloudflare `bretonvilliers28@gmail.com`, GitHub `Julien028`,
  dépôt privé `Julien028/applis-de-la-ferme`, branche `master`.
- Comptes : **un compte par personne**, rattaché à une exploitation.
  - **chef d'exploitation** (`chef`) : administrateur de son exploitation ; crée les comptes
    des salariés (mot de passe provisoire, à changer à la 1re connexion), les désactive,
    leur redonne un mot de passe ; modifie les données des applis (semences…).
  - **salarié** (`salarie`) : le chef coche (colonne `droits`) **les applis qu'il peut ouvrir** (`acces` :
    dose, irrigation, pluie, gnr, tracteurs ; décidé le 31/10/2026, absent = toutes) et **ce qu'il peut noter ou
    modifier** : pluie, pleins GNR, heures tracteurs (cochés par défaut), PMG seulement, semences, enrouleurs.
    Le serveur vérifie tout (PMG seul : il ne garde que le PMG ; un droit ne vaut que si l'appli est ouverte).
  - **administrateur du site** (`super_admin`, Julien) : crée les exploitations
    (Dimancheville, autres agriculteurs) et leur premier chef. Pas d'inscription libre.
  - Un compte ne se supprime pas, il se désactive.
- Sans connexion, les outils marchent quand même (données dans l'appareil).
- Cinq applis : dose de semis, irrigation enrouleur, pluviométrie, suivi du GNR, heures des tracteurs. D'autres viendront selon les idées.

## Où est quoi

| Élément | Contenu |
|---|---|
| `public/index.html` | Accueil : connexion, mon compte (nom, identifiant, mot de passe), comptes et nom de l'exploitation (chef), cadre à part « Exploitations extérieures » pour l'administrateur du site (créer une ferme + son chef, renommer, suspendre ; sa propre ferme n'y figure pas, 10/10/2026), cases des applis. |
| `public/irrigation-enrouleur/` | Irrigation enrouleur, une seule page (onglet Villechèvre retiré le 08/10/2026) : calcul dose ↔ vitesse avec menus enrouleur puis buse (remplissent débit et largeur, temps pour tout le tuyau) ; « Mes enrouleurs » = {nom, diametre, tuyau, buses:[{buse, pression, debit, largeur}]}, modèles Beinlich Ø135/Ø125 et Perrot Ø110 à 8 bars, rangés dans l'espace (`/api/reglages/enrouleurs`), modifiables par le chef seulement. |
| `public/dose-de-semis/` | La dose de semis (reprise de `../dose-de-semis`). La connexion se fait à l'accueil ; la page lit `applis.moi` dans l'appareil et vérifie `/api/moi`. |
| `public/pluviometrie/` | Pluviométrie (08/10/2026) : pluviomètres créés par le chef, saisie rapide du jour, tableau jours × mois (décades, jours de pluie, total, cumul), historique (histogramme par mois + moyenne des autres années, totaux par année), export tableur. Connexion obligatoire. |
| `public/gnr/` | Suivi du GNR (31/10/2026, Bretonvilliers seulement, pas de répartition par entité) : pleins des tracteurs (menu déroulant, litres, compteur d'heures facultatif → L/h, type de travail, index de la pompe facultatif), comparaison compteur de la pompe ↔ pleins notés (index des livraisons, comme sur la porte de la cuve, et des pleins), livraisons à la cuve par le marchand (chef : litres, prix HT/L, fournisseur), niveau estimé = relevé de jauge + livraisons − pleins, par tracteur, par mois, export. |
| `public/tracteurs/` | Heures des tracteurs (31/10/2026) : sorties (tracteur, jour, compteur départ/retour ou heures, pour qui/où — Bretonvilliers, Guillaume, ETA… —, travail), tableaux pour qui × tracteur, export. Même liste de tracteurs que le GNR (table `engins` : nom, immatriculation, n° de série ; gérée par le chef via `/api/gnr/engins`). Les deux 720 et les deux 722 se distinguent par leur numéro Fendt (n°1 à n°4) et leur plaque. |
| `public/commun/` | Styles et petits outils communs au GNR et aux heures des tracteurs ; `pdf.js` + `vendor/` (html2canvas, jsPDF, repris du site des heures) pour « Enregistrer en PDF ». |
| `public/fiche/` | Fiche A4 et export Excel (31/10/2026) : `?type=gnr|tracteurs&du&au&engin&qui`, ouverte depuis la carte « Fiche PDF » des deux pages (raccourcis ce mois, mois dernier, année, campagne dès le 1er septembre). GNR : bilan, par engin, engins × mois (+ livré), livraisons, compteur de la pompe, détail. Heures : bilan, pour qui × tracteur, tracteurs × mois, détail ; `&format=excel` télécharge le tableur (CSV) ; cases de signature si la fiche est pour un tiers (Guillaume, Dimancheville…). |
| `functions/api/[[chemin]].js` | Toutes les adresses `/api/…`, qui appellent `src/api.js`. |
| `src/api.js`, `src/session.js` | Règles du serveur (code standard, sans dépendance à l'hébergeur). |
| `db/schema.sql` | Tables : exploitations, comptes (avec `droits`), sessions, echecs, semences, reglages (enrouleurs, gnr_stock), pluviometres, releves_pluie, engins, gnr_pleins, gnr_livraisons, heures_engins. Migrations à passer une fois en ligne : `db/migrations/`. |
| `public/icone.svg`, `favicon.ico`, `icone-*.png`, `apple-touch-icon.png`, `manifest.webmanifest` | Icône du site (grange et silo sur fond vert, choisie le 10/10/2026), pour les favoris et l'écran d'accueil ; PNG et ICO fabriqués depuis le SVG avec sharp. |
| `scripts/premiere-exploitation.mjs` | Crée la 1re exploitation et son chef administrateur du site (une fois). |

## Essai sur l'ordinateur

`npm run db:schema:local`, puis
`node scripts/premiere-exploitation.mjs "Ferme de Bretonvilliers" "Julien Pichot" julien`,
puis `npx wrangler pages dev --port 8796`. Codes de test dans `.essai-local.txt` (non publié).

## Règles à ne pas perdre en chemin

- Pratique sur téléphone avant tout.
- Une exploitation ne voit jamais les données d'une autre (tout est filtré par `exploitation_id`).
- Chaque modification de semence est signée (`modifie_par`) et datée.
- Récapitulatif des semences : colonnes PMG et dose, en lecture seule (elles viennent du calcul, décidé par Julien le 08/10/2026) ; toucher une ligne ouvre la semence dans le calcul.
- Clés de l'appareil : `applis.moi` (qui est connecté), `dose-de-semis.semences` (semences sans
  compte), `dose-de-semis.semences@<id exploitation>` (copie hors ligne, effacée à la déconnexion).

## En ligne

- Publier : `git push` puis `npm run deploy` (pas de publication automatique depuis GitHub).
- Une modification du schéma : l'appliquer en ligne avec `npm run db:schema` (tout est en
  `CREATE … IF NOT EXISTS`), et en local avec `npm run db:schema:local`.
- Piège : changer `database_id` dans `wrangler.toml` repart d'une base locale vide (recréer
  les comptes de test).

## Idées pour la suite

- Pluie 2026 reprise du site des heures le 08/10/2026 (49 relevés, pluviomètre « Bretonvilliers ») ; pluie 2025 saisie le 27/10/2026 depuis la feuille papier (78 relevés, 629 mm, totaux mensuels identiques ; 23 avril lu 10 mm, confirmé par le total). Scan gardé dans `sauvegardes/pluviometrie/` (ordinateur et OneDrive, pas GitHub). Supprimer un pluviomètre : le chef retape son nom (vérifié aussi par le serveur).

- Cahier GNR (porte de la cuve) recopié le 31/10/2026 : 120 pleins du 13/11/2025 au 31/10/2026 (26 702 L), livraisons 6/11/2025 9 655 L (index pompe 375 824) et 16/10/2026 5 000 L (index 399 619), index 401 982 le 31/10. Le cahier ne distingue pas les deux 720 ni les deux 722 : rangés sous « 720 (les deux, avant nov. 2026) » et « 722 (sans précision, avant nov. 2026) », mis de côté. Plaques d'après les cartes grises (Dropbox ETA.SUZANNE/MATERIELS/Cartes grises) : 720 n°1 FW-060-RW, 720 n°2 FW-873-RV, 722 n°3 FV-736-KH, 722 n°4 FV-617-KH, et un 3e 722 GE-701-EW (« 722 One », propriétaire AGCO Finance, leasing jusqu'à début 2027). Photos, recopie et script d'import (`import-cahier.cjs` → SQL) dans `sauvegardes/gnr/` ; en ligne, passer d'abord `db/migrations/2026-10-31-gnr-pompe-plaques.sql` seulement si les tables GNR existent déjà sans ces colonnes.
- Une troisième appli, selon les idées de Julien.
- Mentions légales si le site est proposé à d'autres agriculteurs.
