// Range des photos de feuilles papier dans un PDF, une photo par page A4.
// Usage : node scripts/scans-en-pdf.cjs sortie.pdf photo1.jpg photo2.jpg@270 …
// « @90 », « @180 », « @270 » : tourner la photo (en degrés, sens des aiguilles d'une montre).
// Les photos sont réduites (1800 px) pour garder un fichier léger ; les originaux restent à côté.
"use strict";
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "../../Site-ferme/04-code/site/node_modules/sharp"));
// jsPDF (même fichier que le site) ; le dossier est en « module », on le charge donc à la main.
const module_ = { exports: {} };
require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "../public/commun/vendor/jspdf.umd.min.js"), "utf8"),
  { module: module_, exports: module_.exports, console, setTimeout, clearTimeout, atob, btoa, TextEncoder, TextDecoder });
const { jsPDF } = module_.exports;

(async () => {
  const [sortie, ...photos] = process.argv.slice(2);
  if (!sortie || !photos.length) { console.error("Usage : node scripts/scans-en-pdf.cjs sortie.pdf photo.jpg[@90] …"); process.exit(1); }
  let pdf = null;
  for (const p of photos) {
    const [fichier, angle] = p.split("@");
    const img = await sharp(fichier).rotate().rotate(Number(angle) || 0)
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = img.info;
    const orientation = w > h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    else pdf.addPage("a4", orientation);
    const L = orientation === "portrait" ? 210 : 297, H = orientation === "portrait" ? 297 : 210, marge = 6;
    const e = Math.min((L - 2 * marge) / w, (H - 2 * marge) / h);
    pdf.addImage(img.data.toString("base64"), "JPEG", (L - w * e) / 2, (H - h * e) / 2, w * e, h * e);
  }
  fs.writeFileSync(sortie, Buffer.from(pdf.output("arraybuffer")));
  console.log("PDF :", sortie, "(" + photos.length + " page(s))");
})();
