// Applis de la ferme — « Enregistrer en PDF » (repris du site des heures) : la fiche est
// photographiée (html2canvas) puis rangée en pages A4 (jsPDF), coupées entre deux lignes,
// jamais au milieu. Les deux outils (licence MIT) sont dans commun/vendor et ne se chargent
// qu'au premier clic.
"use strict";

function chargerScript(src){
  return new Promise((ok, ko) => {
    if(document.querySelector('script[src="'+src+'"]')) return ok();
    const s=Object.assign(document.createElement("script"), {src, onload:ok, onerror:()=>ko(new Error("L'outil PDF n'a pas pu se charger. Vérifiez le réseau."))});
    document.head.append(s);
  });
}

// racine : la feuille à mettre en pages ; elle doit faire la largeur d'une page A4 moins les marges.
async function enregistrerPDF({nom, racine, marge=10}){
  await chargerScript("/commun/vendor/html2canvas.min.js");
  await chargerScript("/commun/vendor/jspdf.umd.min.js");
  const L=210, H=297;
  document.body.classList.add("photo");            // mise en page d'impression le temps de la photo
  window.scrollTo(0,0);
  await new Promise(r=>setTimeout(r,80));
  try{
    const pdf=new window.jspdf.jsPDF({orientation:"portrait", unit:"mm", format:"a4"});
    const c=await window.html2canvas(racine, {scale:2, backgroundColor:"#ffffff", logging:false});
    const echelle=c.width/racine.getBoundingClientRect().width;
    const mmParPx=(L-2*marge)/c.width, hauteurPage=(H-2*marge)/mmParPx;
    // Endroits où l'on peut couper : sous chaque bloc ou ligne de tableau.
    const haut=racine.getBoundingClientRect().top;
    const coupes=[...racine.querySelectorAll(".bloc, h2, tr, .pied")]
      .map(el=>Math.round((el.getBoundingClientRect().bottom-haut)*echelle)).sort((a,b)=>a-b);
    let debut=0, page=0;
    while(debut<c.height-2){
      let fin=Math.min(c.height, debut+hauteurPage);
      if(fin<c.height) fin=coupes.filter(y=>y>debut+40 && y<=fin).pop()||fin;
      const m=document.createElement("canvas"); m.width=c.width; m.height=fin-debut;
      m.getContext("2d").drawImage(c, 0, debut, c.width, fin-debut, 0, 0, c.width, fin-debut);
      if(page++) pdf.addPage();
      pdf.addImage(m.toDataURL("image/jpeg",0.92), "JPEG", marge, marge, L-2*marge, (fin-debut)*mmParPx);
      pdf.setFontSize(8); pdf.setTextColor(120); pdf.text("page "+page, L-marge, H-4, {align:"right"});
      debut=fin;
    }
    pdf.save(nom);
  } finally { document.body.classList.remove("photo"); }
}

// Un nom de fichier sans accents ni espaces.
const nomFichier = (...m) => m.join("-").normalize("NFD").replace(/[̀-ͯ]/g,"")
  .replace(/[^A-Za-z0-9-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").toLowerCase()+".pdf";
