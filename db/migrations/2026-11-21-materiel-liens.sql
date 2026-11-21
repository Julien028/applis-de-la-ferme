-- La table materiel existait déjà en ligne sans la colonne liens (créée le 20/11/2026).
ALTER TABLE materiel ADD COLUMN liens TEXT;
