// Programme et commande phyto : charge un inventaire du local (JSON) dans le stock d'une exploitation.
//   node scripts/import-stock-phyto.cjs <stock.json> <id exploitation> <id compte> sortie.sql
//   puis : npx wrangler d1 execute applis-de-la-ferme --remote --file=sortie.sql
// Le JSON : { date, source, items: [{ nom, q, u, fam, cat, statut, fin?, cmr? }] }.
// Relançable : un produit déjà présent (même nom exact) est mis à jour, rien n'est regroupé.
"use strict";
const fs = require("fs");
const [fichier, expl, compte, sortie] = process.argv.slice(2);
if (!fichier || !expl || !compte || !sortie) { console.error("Usage : node scripts/import-stock-phyto.cjs stock.json <exploitation> <compte> sortie.sql"); process.exit(1); }
const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
const items = Array.isArray(d) ? d : d.items;
const sql = v => v === null || v === undefined || v === "" ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const UNITES = ["L", "kg", "t"], STATUTS = ["autorise", "retire", "engrais", "nonphyto"];
const vus = new Set(), lignes = [];
for (const x of items) {
  const nom = String(x.nom || "").replace(/\s+/g, " ").trim();
  if (!nom) continue;
  if (vus.has(nom.toLowerCase())) { console.error("Nom en double, ignoré : " + nom); continue; }
  vus.add(nom.toLowerCase());
  const u = UNITES.includes(x.u) ? x.u : "L";
  const cat = x.cat === "Engrais" ? "Engrais" : "Phyto";
  const statut = STATUTS.includes(x.statut) ? x.statut : (cat === "Engrais" ? "engrais" : "autorise");
  const q = Number(x.q) || 0;
  lignes.push(`INSERT INTO phyto_produits (exploitation_id, nom, q, u, fam, cat, statut, fin, cmr, modifie_par) VALUES (${Number(expl)}, ${sql(nom)}, ${q}, ${sql(u)}, ${sql(x.fam)}, ${sql(cat)}, ${sql(statut)}, ${sql(x.fin)}, ${sql(x.cmr)}, ${Number(compte)})
  ON CONFLICT (exploitation_id, nom) DO UPDATE SET q = excluded.q, u = excluded.u, fam = excluded.fam, cat = excluded.cat, statut = excluded.statut, fin = excluded.fin, cmr = excluded.cmr, modifie_par = excluded.modifie_par, modifie_le = datetime('now');`);
}
fs.writeFileSync(sortie, lignes.join("\n") + "\n");
console.log(lignes.length + " produits → " + sortie);
