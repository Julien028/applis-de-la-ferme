// Programme et commande phyto : lit un « État des stocks synthétique » de Geofolia (PDF passé par « pdftotext -raw »)
// et en tire le stock au début ou à la fin de la période, pour servir de stock de départ à une campagne.
//   pdftotext -raw "Etat des stocks synthétique.pdf" etat.txt
//   node scripts/stock-geofolia.cjs etat.txt avant|apres "AAAA-MM-JJ" sortie.json
// « avant » = colonne « Stock avant le … », « apres » = colonne « Stock après le … ».
// Sortie : {date, source, items:[{nom, q, u, fam}]}
"use strict";
const fs = require("fs");
const [txt, colonne, date, sortie] = process.argv.slice(2);
if (!sortie || !/^(avant|apres)$/.test(colonne)) { console.error("Usage : node scripts/stock-geofolia.cjs etat.txt avant|apres AAAA-MM-JJ sortie.json"); process.exit(1); }
const FAMILLES = ["Engrais de fond", "Engrais annuels", "Engrais foliaires", "Amendements minéraux", "Biostimulant / engrais", "Insecticides", "Adjuvants", "Herbicides",
  "Fongicides", "Régulateurs", "Molluscicides/Helicides", "Semences", "Plants", "Oligo"];
const NB = /\d{1,3}(?: \d{3})*,\d{2}/g;
const items = [];
for (const ligne of fs.readFileSync(txt, "utf8").split(/\r?\n/)) {
  const m = ligne.match(/^(.*?)\s((?:\d{1,3}(?: \d{3})*,\d{2}\s+)+)(t|kg|L|D|g)\s/);
  if (!m) continue;
  const fam = FAMILLES.find(f => m[1].endsWith(" " + f)); if (!fam) continue;
  const nom = m[1].slice(0, -fam.length - 1).trim();
  const nbs = m[2].match(NB).map(s => Number(s.replace(/ /g, "").replace(",", ".")));
  const q = colonne === "avant" ? nbs[0] : nbs[nbs.length - 1];
  items.push({ nom, q, u: m[3] === "D" ? "dose" : m[3], fam });
}
fs.writeFileSync(sortie, JSON.stringify({ date, source: "Geofolia, état des stocks (" + colonne + ")", items }, null, 1));
console.log(items.length + " produits, stock " + colonne + " → " + sortie);
