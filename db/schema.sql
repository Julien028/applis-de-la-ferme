-- Applis de la ferme — base Cloudflare D1 « applis-de-la-ferme »
-- Appliquer : npx wrangler d1 execute applis-de-la-ferme --remote --file db/schema.sql
-- (sans --remote : base locale de test)

-- Une exploitation = un espace (Ferme de Bretonvilliers, Dimancheville…)
CREATE TABLE IF NOT EXISTS exploitations (
  id INTEGER PRIMARY KEY,
  nom TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un compte par personne, rattaché à une exploitation.
--   chef    : chef d'exploitation, administrateur de son exploitation
--             (crée les comptes des salariés, modifie les données des applis)
--   salarie : consulte et fait les calculs
-- super_admin = 1 : l'administrateur du site (Julien), qui crée les exploitations.
-- Le mot de passe n'est jamais gardé en clair. doit_changer = 1 après un mot de
-- passe provisoire. Un compte ne se supprime pas, il se désactive.
CREATE TABLE IF NOT EXISTS comptes (
  id INTEGER PRIMARY KEY,
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  identifiant TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('chef', 'salarie')),
  mot_de_passe TEXT NOT NULL,
  doit_changer INTEGER NOT NULL DEFAULT 1,
  actif INTEGER NOT NULL DEFAULT 1,
  super_admin INTEGER NOT NULL DEFAULT 0,
  -- Ce qu'un salarié peut modifier (cases cochées par le chef), en JSON :
  -- {"pluie":true,"pmg":false,"semences":false,"enrouleurs":false}. Le chef peut tout.
  droits TEXT NOT NULL DEFAULT '{"pluie":true}',
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  cree_par INTEGER REFERENCES comptes(id)
);
CREATE INDEX IF NOT EXISTS comptes_exploitation ON comptes (exploitation_id);

-- Connexions ouvertes (cookie), un an, prolongé à l'usage
CREATE TABLE IF NOT EXISTS sessions (
  jeton TEXT PRIMARY KEY,
  compte_id INTEGER NOT NULL REFERENCES comptes(id) ON DELETE CASCADE,
  expire_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_compte ON sessions (compte_id);

-- Essais de connexion ratés, pour freiner qui chercherait un mot de passe
CREATE TABLE IF NOT EXISTS echecs (
  identifiant TEXT NOT NULL,
  le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS echecs_identifiant ON echecs (identifiant, le);

-- Dose de semis : tous les chiffres d'une semence (espèce, variété, campagne,
-- PMG, objectif, quantité, surface à semer…) en JSON, comme dans la page.
CREATE TABLE IF NOT EXISTS semences (
  id INTEGER PRIMARY KEY,
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  donnees TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_par INTEGER REFERENCES comptes(id)
);
CREATE INDEX IF NOT EXISTS semences_exploitation ON semences (exploitation_id);

-- Réglages d'une appli pour l'exploitation, un par clé (ajouté le 08/10/2026) :
--   enrouleurs : liste des enrouleurs enregistrés (irrigation enrouleur)
--   largVille  : largeurs arrosées corrigées, par enrouleur et buse
CREATE TABLE IF NOT EXISTS reglages (
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  cle TEXT NOT NULL,
  valeur TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  modifie_par INTEGER REFERENCES comptes(id),
  PRIMARY KEY (exploitation_id, cle)
);

-- Pluviométrie (ajouté le 08/10/2026) : un ou plusieurs pluviomètres par exploitation,
-- créés par le chef ; un relevé par jour, en mm au dixième.
CREATE TABLE IF NOT EXISTS pluviometres (
  id INTEGER PRIMARY KEY,
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  nom TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS pluviometres_exploitation ON pluviometres (exploitation_id);

CREATE TABLE IF NOT EXISTS releves_pluie (
  pluviometre_id INTEGER NOT NULL REFERENCES pluviometres(id),
  jour TEXT NOT NULL,              -- AAAA-MM-JJ
  mm REAL NOT NULL CHECK (mm >= 0),
  saisi_par INTEGER REFERENCES comptes(id),
  saisi_le TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pluviometre_id, jour)
);
