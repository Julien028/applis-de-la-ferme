// Programme et commande phyto : reprend un « Programme Phyto Rxxxx.xlsx » (feuilles Quantité et Programme)
// en une campagne de l'appli, et relie les produits que Julien a regroupés lui-même (« Unix max/Kayak »).
//   node scripts/import-programme-phyto.cjs <programme.xlsx> <campagne> <id exploitation> <id compte> <stock.json> sortie.sql
// La campagne N démarre le 1er septembre N-1. Les surfaces sont celles écrites dans le fichier (ligne 4 de la feuille Quantité), telles quelles.
// Un nom du fichier absent du stock reste un nom libre (« pas en stock ») ; dans un groupe « A/B », un nom absent
// est ajouté au stock à 0 pour garder le nom commercial, et relié aux autres.
"use strict";
const fs = require("fs"), zlib = require("zlib");
// 7e argument facultatif : surfaces de la campagne (Geofolia), en JSON {"Blé tendre": 64.03, …}, à la place de celles du fichier
const [xlsx, campagne, expl, compte, stockJson, sortie, surfacesJson] = process.argv.slice(2);
if (!sortie) { console.error("Usage : node scripts/import-programme-phyto.cjs programme.xlsx 2026 1 1 stock.json sortie.sql"); process.exit(1); }

/* ---- lecture du .xlsx (zip + XML), sans dépendance ---- */
function dezip(fichier) {
  const b = fs.readFileSync(fichier), fichiers = {};
  let fin = b.length - 22; while (b.readUInt32LE(fin) !== 0x06054b50) fin--;
  let p = b.readUInt32LE(fin + 16); const n = b.readUInt16LE(fin + 10);
  for (let i = 0; i < n; i++) {
    const meth = b.readUInt16LE(p + 10), taille = b.readUInt32LE(p + 20), ln = b.readUInt16LE(p + 28), lx = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32), loc = b.readUInt32LE(p + 42);
    const nom = b.toString("utf8", p + 46, p + 46 + ln);
    const d = loc + 30 + b.readUInt16LE(loc + 26) + b.readUInt16LE(loc + 28), brut = b.subarray(d, d + taille);
    fichiers[nom] = meth === 8 ? zlib.inflateRawSync(brut).toString("utf8") : brut.toString("utf8");
    p += 46 + ln + lx + lc;
  }
  return fichiers;
}
const ent = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function feuilles(fichier) {
  const z = dezip(fichier);
  const partagees = [...(z["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => ent([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join("")));
  const rels = Object.fromEntries([...z["xl/_rels/workbook.xml.rels"].matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const res = {};
  for (const m of z["xl/workbook.xml"].matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const cible = rels[m[2]].replace(/^\//, ""), xml = z[cible.startsWith("xl/") ? cible : "xl/" + cible];
    const lignes = {};
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (c[4] || "").match(/<v>([\s\S]*?)<\/v>/), t = (c[3].match(/t="(\w+)"/) || [])[1];
      let val = v ? v[1] : ""; if (t === "s") val = partagees[Number(val)]; else if (t === "inlineStr") val = ent(((c[4] || "").match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      if (val === "") continue;
      const col = [...c[1]].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      (lignes[c[2]] = lignes[c[2]] || [])[col] = typeof val === "string" ? ent(val).trim() : val;
    }
    res[ent(m[1]).trim()] = lignes;
  }
  return res;
}

/* ---- noms : le fichier → le stock ---- */
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
// Correspondances validées par Julien le 25/11/2026 (et noms d'engrais du local)
const ALIAS = {
  "challenge": "Challenge 600", "actirob": "Actirob B", "335": "Ammonitrate 33.5%", "kcl": "Chlorure de potassium",
  "24n18s": "24 N-18 SO3", "solution38145s": "Solution 38N-14,5S", "18n46p": "Phosphate d'ammoniaque 18-46",
  "14n48p": "Polyphosphate d'ammonium 14-48", "karatezeon": "Karate Avec Technologie Zeon", "pampa6od": "Pampa Premium 6 Od",
  "mixin": "Mix-In", "seactiv": "Seactiv Vital Max", "agoleopro": "AG Oléopro", "fertoleobore": "Fertoléo bore",
};
const stock = JSON.parse(fs.readFileSync(stockJson, "utf8")).items;
const parNorm = new Map(stock.map(p => [norm(p.nom), p]));
// Noms corrigés d'après la liste E-Phy (orthographe du bidon)
const RENOM = { trikkaexpert: "Trika Expert", meddaxmax: "Medax Max" };
const duStock = nom => parNorm.get(norm(nom)) || (ALIAS[norm(nom)] && parNorm.get(norm(ALIAS[norm(nom)])));

const F = feuilles(xlsx);
const Q = F["Quantité"], P = F["Programme"];
if (!Q) throw new Error("Pas de feuille « Quantité ».");
const COLS = [["Blé tendre", 9], ["Blé dur", 10], ["Orge d'hiver", 11], ["Colza", 12], ["Pois", 13], ["Maïs", 14], ["Pomme de terre", 15], ["Oignons", 16], ["Betteraves", 17]];
const surfaces = surfacesJson ? JSON.parse(surfacesJson) : Object.fromEntries(COLS.map(([c, i]) => [c, Number((Q[4] || [])[i]) || 0]));

/* ---- stades, depuis la feuille Programme (blocs de 3 colonnes : Stade | Produit | Dose) ---- */
const BLOCS = { "Blé tendre": 0, "Blé dur": 3, "Colza": 6, "Maïs": 9, "Orge d'hiver": 12, "Pomme de terre": 15, "Pois": 18 };
const stades = {};   // culture → [{noms:[norm…], stade}]
if (P) for (const [cu, c0] of Object.entries(BLOCS)) {
  let st = "";
  Object.keys(P).map(Number).filter(r => r >= 4).sort((a, b) => a - b).forEach(r => {
    const l = P[r]; if (l[c0]) st = String(l[c0]).trim(); const pr = l[c0 + 1]; if (!pr || !st) return;
    (stades[cu] = stades[cu] || []).push({ noms: String(pr).split("/").map(norm).filter(Boolean), stade: st });
  });
}
const stadesDe = (cu, parts) => [...new Set((stades[cu] || []).filter(x => x.noms.some(n => parts.some(p => p && n && (p.startsWith(n) || n.startsWith(p))))).map(x => x.stade))].join(", ");

/* ---- lignes de la feuille Quantité ---- */
let famille = "";
const cultures = Object.fromEntries(COLS.map(([c]) => [c, []]));
const nouveaux = new Map(), groupes = [], libres = new Set(), alias = new Set();
for (const r of Object.keys(Q).map(Number).filter(r => r >= 7).sort((a, b) => a - b)) {
  const l = Q[r]; if (l[0]) famille = String(l[0]).trim(); const nomXls = l[1]; if (!nomXls || typeof nomXls !== "string") continue;
  const parts = nomXls.split("/").map(s => s.trim()).filter(Boolean).map(n => RENOM[norm(n)] || n);
  const trouves = parts.map(n => { const p = duStock(n); if (p && norm(p.nom) !== norm(n)) alias.add(n + " → " + p.nom); return { n, p }; });
  const enStock = trouves.filter(t => t.p);
  // Groupe « A/B » : les noms absents du stock y entrent à 0, puis tous sont reliés
  let nomLigne;
  if (parts.length > 1 && enStock.length) {
    const membres = trouves.map(t => t.p ? t.p.nom : (nouveaux.get(norm(t.n)) || (nouveaux.set(norm(t.n), { nom: t.n, u: enStock[0].p.u, fam: enStock[0].p.fam, cat: enStock[0].p.cat }), t.n)) && (t.p ? t.p.nom : t.n));
    groupes.push(membres);
    nomLigne = membres[0];
  } else if (enStock.length) nomLigne = enStock[0].p.nom;
  else { nomLigne = parts[0]; libres.add(parts[0]); }
  const ref = duStock(nomLigne) || nouveaux.get(norm(nomLigne));
  const engrais = /ENGRAIS/i.test(famille), semence = /SEMENCE/i.test(famille);
  const u = semence ? "dose" : engrais && ref && (ref.u === "kg" || ref.u === "t") ? "t" : engrais && !ref ? "t" : (ref ? ref.u : "L");
  for (const [cu, i] of COLS) {
    const d = Number(l[i]); if (!d) continue;
    cultures[cu].push({ produit: nomLigne, stade: stadesDe(cu, parts.map(norm)), dose: Math.round(d * 10000) / 10000, u, pct: 100 });
  }
}
const sql = v => v == null || v === "" ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'";
const out = [];
for (const x of nouveaux.values())
  out.push(`INSERT OR IGNORE INTO phyto_produits (exploitation_id, nom, q, u, fam, cat, statut, modifie_par) VALUES (${+expl}, ${sql(x.nom)}, 0, ${sql(x.u)}, ${sql(x.fam)}, ${sql(x.cat)}, 'autorise', ${+compte});`);
for (const g of groupes)
  out.push(`UPDATE phyto_produits SET groupe = ${sql(g[0])} WHERE exploitation_id = ${+expl} AND nom IN (${g.map(sql).join(", ")}) COLLATE NOCASE;`);
const donnees = { cultures: COLS.map(([c], i) => ({ id: "c" + campagne + "-" + i, nom: c, surface: surfaces[c] || null, lignes: cultures[c] })) };
out.push(`INSERT INTO phyto_campagnes (exploitation_id, campagne, debut, donnees, modifie_par) VALUES (${+expl}, ${sql(campagne)}, ${sql((Number(campagne) - 1) + "-09-01")}, ${sql(JSON.stringify(donnees))}, ${+compte})
  ON CONFLICT (exploitation_id, campagne) DO UPDATE SET debut = excluded.debut, donnees = excluded.donnees, modifie_par = excluded.modifie_par, modifie_le = datetime('now');`);
fs.writeFileSync(sortie, out.join("\n") + "\n");
console.log(`Campagne ${campagne} : ${donnees.cultures.length} cultures, ${donnees.cultures.reduce((s, c) => s + c.lignes.length, 0)} lignes.`);
console.log("Surfaces du fichier :", JSON.stringify(surfaces));
console.log("Groupes repris du fichier (" + groupes.length + ") :", groupes.map(g => g.join(" ≈ ")).join(" | "));
console.log("Ajoutés au stock à 0 (" + nouveaux.size + ") :", [...nouveaux.values()].map(x => x.nom).join(", "));
console.log("Correspondances de noms :", [...alias].join(" | "));
console.log("Noms libres, pas en stock :", [...libres].join(", "));
