-- 31/10/2026 : immatriculation et n° de série des engins, type de travail et index de la pompe
-- sur les pleins, index de la pompe sur les livraisons.
-- À passer UNIQUEMENT sur une base où les tables GNR ont été créées avant ces colonnes
-- (la base locale d'essai). Une base neuve les reçoit déjà par db/schema.sql.
ALTER TABLE engins ADD COLUMN plaque TEXT;
ALTER TABLE engins ADD COLUMN serie TEXT;
ALTER TABLE gnr_pleins ADD COLUMN travail TEXT;
ALTER TABLE gnr_pleins ADD COLUMN index_pompe REAL;
ALTER TABLE gnr_livraisons ADD COLUMN index_pompe REAL;
