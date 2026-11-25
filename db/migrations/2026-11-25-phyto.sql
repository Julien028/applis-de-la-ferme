-- Programme et commande phyto (25/11/2026) : à passer une fois en ligne (déjà inclus dans schema.sql)
-- Stock du local : phytos et engrais, sous le nom commercial du bidon (comme dans Geofolia).
-- Deux noms commerciaux d'un même produit restent deux lignes (jamais de regroupement).
CREATE TABLE IF NOT EXISTS phyto_produits (
  id INTEGER PRIMARY KEY,
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  nom TEXT NOT NULL,
  q REAL NOT NULL DEFAULT 0,          -- quantité au local
  u TEXT NOT NULL DEFAULT 'L',        -- L, kg ou t
  fam TEXT,                           -- Herbicides, Fongicides, Engrais de fond…
  cat TEXT NOT NULL DEFAULT 'Phyto',  -- Phyto ou Engrais
  statut TEXT NOT NULL DEFAULT 'autorise', -- autorise, retire, engrais, nonphyto
  fin TEXT,                           -- date de fin d'utilisation (produit retiré), AAAA-MM-JJ
  cmr TEXT,                           -- « CMR 2 » si concerné
  fournisseur TEXT,                   -- chez qui on le commande (bon de commande par fournisseur)
  modifie_par INTEGER REFERENCES comptes(id),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exploitation_id, nom)
);
-- Une campagne : début (pour les produits retirés), assolement et programmes, en un seul document JSON
-- {"cultures":[{"id","nom","surface","lignes":[{"produit","dose","u","pct"}]}]}
CREATE TABLE IF NOT EXISTS phyto_campagnes (
  id INTEGER PRIMARY KEY,
  exploitation_id INTEGER NOT NULL REFERENCES exploitations(id),
  campagne TEXT NOT NULL,             -- ex. « 2027 »
  debut TEXT,                         -- début de campagne, AAAA-MM-JJ
  donnees TEXT NOT NULL DEFAULT '{"cultures":[]}',
  modifie_par INTEGER REFERENCES comptes(id),
  modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exploitation_id, campagne)
);

-- Ajouts du 25/11/2026 (si les tables existent déjà sans ces colonnes)
-- ALTER TABLE phyto_produits ADD COLUMN fournisseur TEXT;
-- ALTER TABLE phyto_produits ADD COLUMN amm TEXT;
-- ALTER TABLE phyto_produits ADD COLUMN groupe TEXT;
-- ALTER TABLE phyto_produits ADD COLUMN bidon REAL;
-- ALTER TABLE phyto_produits ADD COLUMN amm_ref TEXT;
