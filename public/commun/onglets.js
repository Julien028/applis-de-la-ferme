// Applis de la ferme — rangée d'onglets carrés en haut de chaque appli, pour passer de
// l'une à l'autre sans revenir à l'accueil. Se place tout en haut de la page ; l'appli
// ouverte est surlignée ; les applis que le compte n'a pas le droit d'ouvrir sont cachées.
(function(){
  "use strict";
  const APPLIS = [
    ["dose",       "/dose-de-semis/",        "Semis", "/dose-de-semis/apple-touch-icon.png"],
    ["irrigation", "/irrigation-enrouleur/", "Irrigation",    "/irrigation-enrouleur/icon-192.png"],
    ["pluie",      "/pluviometrie/",         "Pluie",         "🌧️"],
    ["gnr",        "/gnr/",                  "GNR",           "⛽"],
    ["tracteurs",  "/tracteurs/",            "Heures",        "🚜"],
    ["entretien",  "/entretien/",            "Entretien",     "🔧"],
    ["phyto",      "/phyto/",                "Phyto",         "🧪"],
  ];
  let moi = null;
  try{ moi = JSON.parse(localStorage.getItem("applis.moi")); }catch(e){}
  const acces = moi && moi.compte && moi.compte.role!=="chef" && moi.droits && moi.droits.acces ? moi.droits.acces : null;
  const ici = location.pathname;

  const css = document.createElement("style");
  css.textContent = `
.onglets-ferme{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 0 12px;padding:2px 0 4px;scrollbar-width:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.onglets-ferme::-webkit-scrollbar{display:none}
.onglets-ferme a{flex:1 1 0;min-width:44px;max-width:76px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1.5px solid #D6E0DA;border-radius:12px;background:#fff;color:#18241C;text-decoration:none;font-size:9.5px;font-weight:600;overflow:hidden;line-height:1.1;text-align:center;box-sizing:border-box;padding:4px 2px}
.onglets-ferme a .i{font-size:21px;line-height:1;height:24px;display:flex;align-items:center}
.onglets-ferme a img{width:24px;height:24px;border-radius:6px;object-fit:cover}
.onglets-ferme a.accueil{background:#2F5D3A;border-color:#2F5D3A;color:#fff}
.onglets-ferme a.ici{border-color:#18241C;border-width:2.5px;background:#F3F0E8}
@media print{.onglets-ferme{display:none}}
body.photo .onglets-ferme{display:none}`;
  document.head.appendChild(css);

  const nav = document.createElement("nav");
  nav.className = "onglets-ferme"; nav.setAttribute("aria-label", "Applis de la ferme");
  const onglet = (href, titre, icone, cls) => {
    const a = document.createElement("a"); a.href = href; if(cls) a.className = cls;
    const i = document.createElement("span"); i.className = "i";
    if(icone.startsWith("/")){ const img = document.createElement("img"); img.src = icone; img.alt = ""; i.appendChild(img); }
    else i.textContent = icone;
    a.append(i, titre); nav.appendChild(a); return a;
  };
  onglet("/", "Accueil", "🏠", "accueil");
  APPLIS.forEach(([cle, href, titre, icone]) => {
    if(acces && !acces[cle]) return;
    const a = onglet(href, titre, icone, ici.startsWith(href) ? "ici" : "");
    if(ici.startsWith(href)) a.setAttribute("aria-current", "page");
  });
  const placer = () => {
    document.body.insertBefore(nav, document.body.firstChild);
    const actif = nav.querySelector(".ici"); if(actif && actif.scrollIntoView) actif.scrollIntoView({block:"nearest", inline:"center"});
  };
  if(document.body) placer(); else document.addEventListener("DOMContentLoaded", placer);
})();
