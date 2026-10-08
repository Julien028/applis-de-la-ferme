# Applis de la ferme

Un seul site pour les petits outils de la ferme (dose de semis, puis irrigation
enrouleur et ce qu'on ajoutera), avec un espace par exploitation et un compte par personne.
Il remplace à terme les sites séparés `dose-de-semis` et `calcul-irrigation-enrouleur`.

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
- On commence par la dose de semis ; la vitesse d'enrouleur viendra ensuite.

## Où est quoi

| Élément | Contenu |
|---|---|
| `public/index.html` | Accueil : connexion, mon mot de passe, comptes de l'exploitation (chef), exploitations (administrateur), cases des applis. |
| `public/irrigation-enrouleur/` | Irrigation enrouleur (reprise de `../calcul-irrigation-enrouleur`) : enrouleurs et largeurs rangés dans l'espace (`/api/reglages/enrouleurs`, `largVille`), modifiables par le chef seulement. |
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
- Clés de l'appareil : `applis.moi` (qui est connecté), `dose-de-semis.semences` (semences sans
  compte), `dose-de-semis.semences@<id exploitation>` (copie hors ligne, effacée à la déconnexion).

## Reste à faire

1. Mise en ligne (avec l'accord de Julien) : créer la base D1 et le projet Pages, appliquer le
   schéma, créer le compte `julien` en ligne, publier, créer le dépôt GitHub.
2. Reprendre les semences de l'ancien espace `bretonvilliers` (base D1 `dose-de-semis`) et
   rediriger l'ancienne adresse dose-de-semis.bretonvilliers28.workers.dev vers le nouveau site
   (en emportant les semences gardées dans les téléphones).
3. Irrigation enrouleur (`../calcul-irrigation-enrouleur`), avec ses enrouleurs dans l'espace
   de l'exploitation.
