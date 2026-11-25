// Programme et commande phyto : retrouve le n° AMM de chaque produit du stock dans la liste officielle E-Phy (Anses),
// par le nom commercial ou un « second nom commercial ». Garde aussi l'AMM du produit de référence (génériques)
// et des permis de commerce parallèle : deux produits qui ont la même AMM de référence sont des produits similaires.
//   node scripts/ephy-amm.cjs <dossier E-Phy dézippé (utf8)> <stock.json : [{id, nom, cat}]> sortie.sql rapport.txt
// Données E-Phy - Anses, https://www.data.gouv.fr (fichier decisionamm-intrant-format-csv-…-utf8.zip).
"use strict";
const fs = require("fs"), path = require("path");
const [dossier, stockJson, sortie, rapport] = process.argv.slice(2);
if (!rapport) { console.error("Usage : node scripts/ephy-amm.cjs dossier-ephy stock.json sortie.sql rapport.txt"); process.exit(1); }
const lire = f => { const t = fs.readFileSync(path.join(dossier, f), "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean); const en = t[0].split(";").map(s => s.trim()); return t.slice(1).map(l => { const c = l.split(";"); return Object.fromEntries(en.map((k, i) => [k, (c[i] || "").trim()])); }); };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const dateIso = d => /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? d.slice(6) + "-" + d.slice(3, 5) + "-" + d.slice(0, 2) : null;

const index = new Map();   // nom normalisé → [{amm, ref, nom, etat, retrait}]
const ajouter = (nom, x) => { const k = norm(nom); if (!k) return; (index.get(k) || index.set(k, []).get(k)).push(x); };
for (const p of lire("produits_utf8.csv")) {
  const x = { amm: p["numero AMM"], ref: p["Numéro AMM du produit de référence"] || "", nom: p["nom produit"], etat: p["Etat d’autorisation"], retrait: dateIso(p["Date de retrait du produit"]), type: p["type produit"] };
  ajouter(p["nom produit"], x);
  (p["seconds noms commerciaux"] || "").split("|").forEach(n => ajouter(n.trim(), { ...x, second: n.trim() }));
}
for (const p of lire("permis_de_commerce_parallele_utf8.csv"))
  ajouter(p["Nom du produit"], { amm: p["N° Permis"], ref: p["N° AMM de référence français"] || "", nom: p["Nom du produit"], etat: p["Etat d’autorisation"], retrait: null, pcp: true });

const brut = JSON.parse(fs.readFileSync(stockJson, "utf8")), stock = Array.isArray(brut) ? (brut[0] && brut[0].results ? brut[0].results : brut) : brut.items;
const sql = v => v == null || v === "" ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'";
const out = [], lignes = [], sans = [];
for (const s of stock) {
  if (s.cat === "Engrais") continue;
  let c = index.get(norm(s.nom)) || [];
  // Variante sans les mots de conditionnement (« Fs », « Sc », « Ec »…) si rien ne correspond
  if (!c.length) c = index.get(norm(s.nom.replace(/\b(fs|sc|ec|od|wg|sg|cs|ew|me|se|sl|ema)\b/ig, ""))) || [];
  if (!c.length) { sans.push(s.nom); continue; }
  const auto = c.filter(x => /AUTORIS/i.test(x.etat));
  const choix = (auto.length ? auto : c).sort((a, b) => String(b.retrait || "9999").localeCompare(String(a.retrait || "9999")))[0];
  const amms = [...new Set((auto.length ? auto : c).map(x => x.amm))];
  out.push(`UPDATE phyto_produits SET amm = ${sql(choix.amm)}, amm_ref = ${sql(choix.ref || null)} WHERE id = ${s.id};`);
  lignes.push(`${s.nom} → AMM ${choix.amm}${choix.ref ? " (réf. " + choix.ref + ")" : ""} · E-Phy : ${choix.nom}${choix.second ? " (2nd nom « " + choix.second + " »)" : ""}${choix.pcp ? " [permis de commerce parallèle]" : ""} · ${choix.etat}${choix.retrait ? " le " + choix.retrait : ""}${amms.length > 1 ? " · ⚠ plusieurs AMM : " + amms.join(", ") : ""}`);
}
fs.writeFileSync(sortie, out.join("\n") + "\n");
// Groupes que l'AMM forme d'elle-même
const racine = new Map();
stock.forEach(s => { const l = out.find(o => o.endsWith(`WHERE id = ${s.id};`)); if (!l) return; const amm = l.match(/amm = '([^']+)'/)[1], ref = (l.match(/amm_ref = '([^']+)'/) || [])[1]; const k = ref || amm; (racine.get(k) || racine.set(k, []).get(k)).push(s.nom); });
const groupes = [...racine.values()].filter(g => g.length > 1);
fs.writeFileSync(rapport, [
  `Données E-Phy - Anses (liste du 24/11/2026). ${lignes.length} produits retrouvés, ${sans.length} sans correspondance.`,
  "", "== Groupes formés par la même AMM (ou le même produit de référence) ==", ...groupes.map(g => "  " + g.join(" ≈ ")),
  "", "== Produits retrouvés ==", ...lignes.map(l => "  " + l),
  "", "== Sans correspondance dans E-Phy (nom à vérifier) ==", "  " + sans.join(", "), ""].join("\n"));
console.log(lignes.length + " retrouvés, " + sans.length + " sans correspondance, " + groupes.length + " groupes par AMM.");
