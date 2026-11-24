// Applis de la ferme — petits outils communs aux pages « avec compte » (GNR, heures des tracteurs).
"use strict";
const $ = id => document.getElementById(id);
const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const fmt = (x,d=1) => isFinite(x) ? Number(x).toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d}) : "—";
const num = x => String(x).replace(".",",");                 // nombre pour le tableur
const csv = v => /[;"\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);
const deux = n => String(n).padStart(2,"0");
function aujourdhui(){ const d=new Date(); return d.getFullYear()+"-"+deux(d.getMonth()+1)+"-"+deux(d.getDate()); }
const dateCourte = j => j ? j.slice(8)+"/"+j.slice(5,7)+(j.slice(0,4)!==String(new Date().getFullYear()) ? "/"+j.slice(2,4) : "") : "";

let moi = null;
const chef = () => !!moi && moi.compte.role==="chef";
// La liste des tracteurs : l'administrateur du site seulement (24/11/2026)
const adminSite = () => !!moi && !!moi.superAdmin;
const peut = d => chef() || !!(moi && moi.droits && moi.droits[d]);
const voit = a => chef() || !(moi && moi.droits && moi.droits.acces) || !!moi.droits.acces[a];

async function appel(methode, chemin, corps){
  let r;
  try{ r=await fetch(chemin,{method:methode,credentials:"same-origin",headers:corps?{"content-type":"application/json"}:{},body:corps?JSON.stringify(corps):undefined}); }
  catch(e){ throw {status:0,message:"Pas de réseau."}; }
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw {status:r.status,message:data.erreur||"Erreur.",data};
  return data;
}
function etat(t, attente){ const e=$("etat"); e.textContent=t||""; e.className="etat"+(attente?" attente":""); }
function message(id, txt, cls){ const m=$(id); m.textContent=txt||""; m.className="msg "+(cls||""); m.hidden=!txt; }

// Copie dans l'appareil, par exploitation, pour consulter sans réseau
const cleCache = k => "outil@"+(moi?moi.exploitation.id:0)+":"+k;
function garder(k, v){ try{ localStorage.setItem(cleCache(k), JSON.stringify(v)); }catch(e){} }
function relire(k){ try{ return JSON.parse(localStorage.getItem(cleCache(k))); }catch(e){ return null; } }
function garderChoix(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
function lireChoix(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

function telecharger(nom, lignes){
  const blob=new Blob(["﻿"+lignes.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=nom;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function remplirEngins(select, engins){
  const avant=select.value; select.innerHTML="";
  engins.slice().sort(rangEngin).forEach(e=>{ const o=document.createElement("option"); o.value=e.id; o.textContent=e.nom+(e.plaque?" · "+e.plaque:""); select.appendChild(o); });
  if([...select.options].some(o=>o.value===avant)) select.value=avant;
}
// Ordre des tracteurs choisi par l'administrateur (« ordre »), sinon ordre alphabétique
const rangEngin = (a,b) => ((a.ordre ?? 1e9) - (b.ordre ?? 1e9)) || a.nom.localeCompare(b.nom,"fr",{numeric:true});
// Liste des tracteurs pour l'administrateur du site : classer, modifier, mettre de côté, supprimer
function gererEngins(ul, engins, recharger){
  ul.innerHTML="";
  if(!engins.length){ ul.innerHTML="<li><span class=\"vide\">Aucun tracteur pour l'instant.</span></li>"; return; }
  const liste=engins.slice().sort((a,b)=>(b.actif-a.actif)||rangEngin(a,b));
  const classer = async ids => { try{ await appel("PATCH","/api/gnr/engins/ordre",{ids}); await recharger(); }catch(x){ alert(x.message); } };
  // Boutons du haut : remettre dans l'ordre alphabétique
  const tete=document.createElement("li"); tete.className="teteEngins";
  const t=document.createElement("span"); t.className="leger"; t.textContent="▲ ▼ pour remonter ceux qu'on prend le plus : l'ordre sert aussi dans les menus.";
  const alpha=document.createElement("button"); alpha.className="lien"; alpha.type="button"; alpha.textContent="Classer A → Z";
  alpha.addEventListener("click", ()=>{ if(confirm("Remettre les tracteurs dans l'ordre alphabétique ?")) classer(engins.slice().sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{numeric:true})).map(e=>e.id)); });
  tete.append(t, alpha); ul.appendChild(tete);
  const actifs=liste.filter(e=>e.actif);
  liste.forEach(e=>{
    const li=document.createElement("li"); const s=document.createElement("span"); s.textContent=e.nom+(e.actif?"":" (mis de côté)");
    if(e.plaque||e.serie){ const k=document.createElement("small"); k.textContent=[e.plaque, e.serie?"n° de série "+e.serie:""].filter(Boolean).join(" · "); s.append(document.createElement("br"), k); }
    li.appendChild(s);
    const boutons=[];
    if(e.actif){
      const i=actifs.indexOf(e);
      const fleche=(txt, titre, j)=>{ const b=document.createElement("button"); b.className="fleche"; b.type="button"; b.textContent=txt; b.title=titre; b.setAttribute("aria-label", titre+" "+e.nom);
        b.disabled = j<0 || j>=actifs.length;
        b.addEventListener("click", ()=>{ const ids=actifs.map(x=>x.id); [ids[i],ids[j]]=[ids[j],ids[i]]; classer(ids.concat(liste.filter(x=>!x.actif).map(x=>x.id))); });
        return b; };
      boutons.push(fleche("▲","Monter",i-1), fleche("▼","Descendre",i+1));
    }
    const r=document.createElement("button"); r.className="lien"; r.type="button"; r.textContent="Modifier";
    r.addEventListener("click", async ()=>{
      const n=prompt("Nom :", e.nom); if(n===null) return;
      const p=prompt("Immatriculation (vide si aucune) :", e.plaque||""); if(p===null) return;
      const v=prompt("Numéro de série (facultatif) :", e.serie||""); if(v===null) return;
      try{ await appel("PATCH","/api/gnr/engins/"+e.id,{nom:n, plaque:p, serie:v}); await recharger(); }catch(x){ alert(x.message); } });
    const a=document.createElement("button"); a.className="lien"; a.type="button"; a.textContent=e.actif?"Mettre de côté":"Reprendre";
    a.addEventListener("click", async ()=>{
      if(e.actif && !confirm("Mettre « "+e.nom+" » de côté ? Il ne sera plus proposé dans les menus ; ses pleins et ses heures sont gardés.")) return;
      try{ await appel("PATCH","/api/gnr/engins/"+e.id,{actif:!e.actif}); await recharger(); }catch(x){ alert(x.message); } });
    const s2=document.createElement("button"); s2.className="lien"; s2.type="button"; s2.textContent="Supprimer"; s2.style.color="#B4472B";
    s2.addEventListener("click", async ()=>{
      const np=e.nb_pleins||0, ns=e.nb_sorties||0;
      const perte = np||ns ? "Ses "+np+" plein(s) de GNR et ses "+ns+" sortie(s) notées seront effacés aussi. Pour les garder, utilisez plutôt « Mettre de côté »." : "Rien n'est noté sur ce tracteur.";
      const n=prompt("Supprimer « "+e.nom+" » pour de bon ? On ne pourra pas revenir en arrière.\n"+perte+"\n\nPour confirmer, retapez son nom :"); if(n===null) return;
      try{ await appel("DELETE","/api/gnr/engins/"+e.id,{confirmation:n}); await recharger(); }catch(x){ alert(x.message); } });
    const act=document.createElement("div"); act.className="actionsEngin"; act.append(...boutons, r, a, s2);
    li.append(act); ul.appendChild(li);
  });
}

// Carte « Export PDF / Excel » : période (raccourcis), tracteur, pour qui → ouvre /fiche/ (Excel : le tableur se télécharge aussitôt)
function preparerFiche(type){
  const an=new Date().getFullYear(), m=new Date().getMonth();
  const jour=(a,mo,j)=>a+"-"+deux(mo+1)+"-"+deux(j), fin=(a,mo)=>new Date(a,mo+1,0).getDate();
  const periodes={
    "Ce mois": [jour(an,m,1), aujourdhui()],
    "Mois dernier": (()=>{ const a=m?an:an-1, mo=m?m-1:11; return [jour(a,mo,1), jour(a,mo,fin(a,mo))]; })(),
    "Cette année": [an+"-01-01", aujourdhui()],
    "Année dernière": [(an-1)+"-01-01", (an-1)+"-12-31"],
    "Campagne": m>=8 ? [an+"-09-01", aujourdhui()] : [(an-1)+"-09-01", aujourdhui()]
  };
  const boite=$("fRaccourcis"); boite.innerHTML="";
  Object.entries(periodes).forEach(([lib,[du,au]])=>{
    const b=document.createElement("button"); b.type="button"; b.className="puce"; b.textContent=lib;
    b.addEventListener("click", ()=>{ $("fDu").value=du; $("fAu").value=au; boite.querySelectorAll(".puce").forEach(x=>x.classList.toggle("choisi", x===b)); });
    boite.appendChild(b);
  });
  if(!$("fDu").value){ $("fDu").value=periodes["Cette année"][0]; $("fAu").value=periodes["Cette année"][1]; boite.children[2].classList.add("choisi"); }
  const ouvrir=format=>{
    if($("fDu").value>$("fAu").value){ alert("La date de début est après la date de fin."); return; }
    const q=new URLSearchParams({type, du:$("fDu").value, au:$("fAu").value});
    if($("fEngin").value) q.set("engin", $("fEngin").value);
    if($("fQui") && $("fQui").value) q.set("qui", $("fQui").value);
    if(format) q.set("format", format);
    location.href="/fiche/?"+q;
  };
  $("fOk").onclick=()=>ouvrir(""); $("fExcel").onclick=()=>ouvrir("excel");
}
// Menu « tous / un engin » de la carte Fiche PDF (tous les engins, même mis de côté)
function remplirFiltreEngins(select, engins, tous){
  const avant=select.value; select.innerHTML="";
  const o=document.createElement("option"); o.value=""; o.textContent=tous; select.appendChild(o);
  engins.slice().sort((a,b)=>(b.actif-a.actif)||rangEngin(a,b)).forEach(e=>{ const x=document.createElement("option"); x.value=e.id; x.textContent=e.nom; select.appendChild(x); });
  if([...select.options].some(x=>x.value===avant)) select.value=avant;
}

function deconnecte(){ moi=null; $("pasConnecte").hidden=false; $("contenu").hidden=true; $("qui").textContent=""; try{ localStorage.removeItem("applis.moi"); }catch(e){} }
function sansAcces(){ $("pasAcces").hidden=false; $("contenu").hidden=true; }

// Démarrage commun : qui est connecté, a-t-il accès à cet outil ?
async function demarrer(appli, suite){
  try{ moi=JSON.parse(localStorage.getItem("applis.moi")); if(!moi||!moi.compte) moi=null; }catch(e){}
  try{ moi=await appel("GET","/api/moi"); localStorage.setItem("applis.moi", JSON.stringify(moi)); }
  catch(e){ if(e.status===401) moi=null; else if(moi) etat("Hors ligne", true); }
  if(!moi) return deconnecte();
  const q=$("qui"); q.innerHTML="<b></b> · <span></span>"; q.firstChild.textContent=moi.exploitation.nom; q.lastChild.textContent=moi.compte.nom;
  if(!voit(appli)) return sansAcces();
  $("contenu").hidden=false;
  suite();
}
