-- 08/10/2026 : cases à cocher des salariés, et pluviométrie.
-- À passer UNE fois sur la base en ligne (la colonne n'existe pas encore) :
--   npx wrangler d1 execute applis-de-la-ferme --remote --file db/migrations/2026-10-08-droits-pluviometrie.sql
-- puis npm run db:schema (crée les tables pluviometres et releves_pluie).
ALTER TABLE comptes ADD COLUMN droits TEXT NOT NULL DEFAULT '{"pluie":true}';
