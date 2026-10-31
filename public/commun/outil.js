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
  engins.slice().sort((a,b)=>a.nom.localeCompare(b.nom,"fr",{numeric:true})).forEach(e=>{ const o=document.createElement("option"); o.value=e.id; o.textContent=e.nom+(e.plaque?" · "+e.plaque:""); select.appendChild(o); });
  if([...select.options].some(o=>o.value===avant)) select.value=avant;
}
// Liste des tracteurs pour le chef : renommer, mettre de côté
function gererEngins(ul, engins, recharger){
  ul.innerHTML="";
  if(!engins.length){ ul.innerHTML="<li><span class=\"vide\">Aucun tracteur pour l'instant.</span></li>"; return; }
  engins.slice().sort((a,b)=>(b.actif-a.actif)||a.nom.localeCompare(b.nom,"fr",{numeric:true})).forEach(e=>{
    const li=document.createElement("li"); const s=document.createElement("span"); s.textContent=e.nom+(e.actif?"":" (mis de côté)");
    if(e.plaque||e.serie){ const k=document.createElement("small"); k.textContent=[e.plaque, e.serie?"n° de série "+e.serie:""].filter(Boolean).join(" · "); s.append(document.createElement("br"), k); }
    li.appendChild(s);
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
    li.append(r,a); ul.appendChild(li);
  });
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
