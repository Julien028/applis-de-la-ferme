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
  - **salarié** (`salarie`) : consulte et fait les calculs, ne modifie pas les semences.
  - **administrateur du site** (`super_admin`, Julien) : crée les exploitations
    (Dimancheville, autres agriculteurs) et leur premier chef. Pas d'inscription libre.
  - Un compte ne se supprime pas, il se désactive.
- Sans connexion, les outils marchent quand même (données dans l'appareil).
- Deux applis : dose de semis et irrigation enrouleur. D'autres viendront selon les idées.

## Où est quoi

| Élément | Contenu |
|---|---|
| `public/index.html` | Accueil : connexion, mon compte (nom, identifiant, mot de passe), comptes et nom de l'exploitation (chef), exploitations : créer, renommer, suspendre (administrateur), cases des applis. |
| `public/irrigation-enrouleur/` | Irrigation enrouleur, une seule page (onglet Villechèvre retiré le 08/10/2026) : calcul dose ↔ vitesse avec menus enrouleur puis buse (remplissent débit et largeur, temps pour tout le tuyau) ; « Mes enrouleurs » = {nom, tuyau, buses:[{buse, pression, debit, largeur}]}, modèles Beinlich Ø135/Ø125 et Perrot Ø110 à 8 bars, rangés dans l'espace (`/api/reglages/enrouleurs`), modifiables par le chef seulement. |
| `public/dose-de-semis/` | La dose de semis (reprise de `../dose-de-semis`). La connexion se fait à l'accueil ; la page lit `applis.moi` dans l'appareil et vérifie `/api/moi`. |
| `functions/api/[[chemin]].js` | Toutes les adresses `/api/…`, qui appellent `src/api.js`. |
| `src/api.js`, `src/session.js` | Règles du serveur (code standard, sans dépendance à l'hébergeur). |
| `db/schema.sql` | Tables : exploitations, comptes, sessions, echecs, semences, reglages (enrouleurs, largeurs). |
| `scripts/premiere-exploitation.mjs` | Crée la 1re exploitation et son chef administrateur du site (une fois). |

## Essai sur l'ordinateur

`npm run db:schema:local`, puis
`node scripts/premiere-exploitation.mjs "Ferme de Bretonvilliers" "Julien Pichot" julien`,
puis `npx wrangler pages dev --port 8796`. Codes de test dans `.essai-local.txt` (non publié).

## Règles à ne pas perdre en chemin

- Pratique sur téléphone avant tout.
- Une exploitation ne voit jamais les données d'une autre (tout est filtré par `exploitation_id`).
- Chaque modification de semence est signée (`modifie_par`) et datée.
- Récapitulatif des semences : PMG et dose sur chaque ligne ; toucher une ligne permet de les modifier (changer la dose recalcule l'objectif en grains/m²).
- Clés de l'appareil : `applis.moi` (qui est connecté), `dose-de-semis.semences` (semences sans
  compte), `dose-de-semis.semences@<id exploitation>` (copie hors ligne, effacée à la déconnexion).

## En ligne

- Publier : `git push` puis `npm run deploy` (pas de publication automatique depuis GitHub).
- Une modification du schéma : l'appliquer en ligne avec `npm run db:schema` (tout est en
  `CREATE … IF NOT EXISTS`), et en local avec `npm run db:schema:local`.
- Piège : changer `database_id` dans `wrangler.toml` repart d'une base locale vide (recréer
  les comptes de test).

## Idées pour la suite

- Une troisième appli, selon les idées de Julien.
- Mentions légales si le site est proposé à d'autres agriculteurs.
