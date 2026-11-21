// Met les carnets d'Édouard recopiés (sauvegardes/entretien/Recopie/*.json) dans le site.
// Usage : node scripts/import-entretien.cjs <id exploitation> <id du compte signataire> sortie.sql
// puis : npx wrangler d1 execute applis-de-la-ferme --remote --file=sortie.sql
// Une machine déjà présente (même nom) n'est pas recréée ; ses entretiens ne sont ajoutés que
// s'ils n'y sont pas déjà (même jour, même travail) : on peut relancer sans doublons.
// Les fichiers « Relevés - X.json » sont rattachés à la machine X (correspondances ci-dessous).
"use strict";
const fs = require("fs"), path = require("path");
const [E, signataire, sortie] = process.argv.slice(2);
if (!E || !signataire || !sortie) { console.error("Usage : node scripts/import-entretien.cjs <id exploitation> <id compte> sortie.sql"); process.exit(1); }
const DOSSIER = path.join(__dirname, "../sauvegardes/entretien/Recopie");
const MEMES = JSON.parse(fs.existsSync(path.join(DOSSIER, "correspondances.json")) ? fs.readFileSync(path.join(DOSSIER, "correspondances.json"), "utf8") : "{}");
const q = v => v === null || v === undefined || v === "" ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const machines = new Map();
// Les fiches d'abord, puis les relevés, puis la révision (qui se range sur des machines connues)
const ordre = f => f.startsWith("Révision") ? 2 : f.startsWith("Relevés - ") ? 1 : 0;
for (const f of fs.readdirSync(DOSSIER).filter(f => f.endsWith(".json") && f !== "correspondances.json").sort((a, b) => ordre(a) - ordre(b))) {
  const d = JSON.parse(fs.readFileSync(path.join(DOSSIER, f), "utf8"));
  // Liste de révision (hiver 2025-2026) : une entrée par ligne, sur la machine concernée
  if (Array.isArray(d.lignes)) {
    const annee = (/(\d{4})\s*$/.exec(d.titre || f.replace(/\.json$/, "")) || [])[1];
    for (const l of d.lignes) {
      const nom = MEMES[l.machine] || l.machine, m = machines.get(nom);
      if (!m || !annee) { console.log("ligne de révision sans machine connue :", JSON.stringify(l)); continue; }
      const sous = /\(([^)]+)\)/.exec(l.machine);
      m.entretiens.push({ jour: annee, compteur: null, ou: null, pieces: null,
        travail: "Révision " + (d.titre || "").replace(/^Révision\s*/i, "") + (sous ? " (" + sous[1] + ")" : "") + " : " + l.travail + (l.fait === false ? " — à faire" : l.fait === null ? " — fait ? (à vérifier)" : "") });
    }
    continue;
  }
  if (!d.nom || !Array.isArray(d.entretiens)) { console.log("ignoré :", f); continue; }
  const nom = MEMES[d.nom] || d.nom;
  const m = machines.get(nom) || { nom, categorie: d.categorie, infos: "", pieces: "", liens: "", entretiens: [] };
  if (!f.startsWith("Relevés - ")) { m.categorie = d.categorie; m.infos = d.infos || ""; m.pieces = d.pieces || ""; m.liens = d.liens || ""; }
  if ((MEMES.categories || {})[nom]) m.categorie = MEMES.categories[nom];
  m.entretiens.push(...d.entretiens);
  machines.set(nom, m);
}
const sql = [];
let n = 0;
for (const m of machines.values()) {
  sql.push(`INSERT INTO materiel (exploitation_id, nom, categorie, infos, pieces, liens, modifie_par)
  SELECT ${E}, ${q(m.nom)}, ${q(m.categorie || "Outils")}, ${q(m.infos)}, ${q(m.pieces)}, ${q(m.liens)}, ${signataire}
  WHERE NOT EXISTS (SELECT 1 FROM materiel WHERE exploitation_id = ${E} AND nom = ${q(m.nom)});`);
  for (const x of m.entretiens) {
    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(x.jour || "") || !x.travail) { console.log("entrée ignorée (" + m.nom + ") :", JSON.stringify(x)); continue; }
    const id = `(SELECT id FROM materiel WHERE exploitation_id = ${E} AND nom = ${q(m.nom)})`;
    sql.push(`INSERT INTO entretiens (exploitation_id, materiel_id, jour, compteur, travail, ou, pieces, saisi_par)
  SELECT ${E}, ${id}, ${q(x.jour)}, ${typeof x.compteur === "number" ? x.compteur : "NULL"}, ${q(x.travail)}, ${q(x.ou)}, ${q(x.pieces)}, ${signataire}
  WHERE NOT EXISTS (SELECT 1 FROM entretiens WHERE materiel_id = ${id} AND jour = ${q(x.jour)} AND travail = ${q(x.travail)});`);
    n++;
  }
}
fs.writeFileSync(sortie, sql.join("\n") + "\n");
console.log(machines.size + " machines, " + n + " entretiens →", sortie);
