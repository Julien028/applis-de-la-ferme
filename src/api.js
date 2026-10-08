// Applis de la ferme — API commune
// =================================
// Sous /api/ (functions/api/[[chemin]].js) : connexion, comptes des personnes,
// exploitations, et les données des applis (pour l'instant : semences de la
// dose de semis). Base Cloudflare D1 « applis-de-la-ferme » (db/schema.sql).
// Tout repose sur des outils standard (fetch, Web Crypto, SQL) : rien à réécrire
// si l'on change un jour d'hébergeur.
//
// Rôles : chef (chef d'exploitation, administrateur de son exploitation),
// salarie (consulte, calcule). super_admin : l'administrateur du site, qui crée
// les exploitations et leur premier chef.

import { hacher, verifier, nouveauJeton, cookieSession, lireJeton, EXPIRATION, motDePasseProvisoire } from './session.js';

const TAILLE_MAX_SEMENCE = 8000;      // une semence pèse quelques centaines d'octets
const MAX_SEMENCES = 1000;            // par exploitation
const CLES_REGLAGES = ['enrouleurs', 'largVille']; // irrigation enrouleur
const TAILLE_MAX_REGLAGE = 50000;
// Ce qu'un salarié peut modifier, coché par le chef (le chef peut tout)
export const DROITS = ['pluie', 'pmg', 'semences', 'enrouleurs'];
function lireDroits(brut) {
  let d = {};
  try { d = JSON.parse(brut || '{}') || {}; } catch {}
  return Object.fromEntries(DROITS.map(k => [k, !!d[k]]));
}
const droitsDe = m => m.role === 'chef' ? Object.fromEntries(DROITS.map(k => [k, true])) : lireDroits(m.droits);
const peut = (m, droit) => droitsDe(m)[droit];
function droitsDepuis(corps, defaut) {
  if (!corps || typeof corps !== 'object') return JSON.stringify(defaut);
  return JSON.stringify(Object.fromEntries(DROITS.map(k => [k, !!corps[k]])));
}
const TAILLE_MAX_NOM = 60;
const MAX_ECHECS = 10;                // essais ratés tolérés…
const FENETRE_ECHECS = '-15 minutes'; // …sur cette durée

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}
const erreur = (status, message, extra = {}) => json({ erreur: message, ...extra }, status);
const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function verifierMotDePasse(mdp) {
  if (typeof mdp !== 'string' || mdp.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (mdp.length > 200) return 'Le mot de passe est trop long.';
  return null;
}

// Identifiant de connexion : minuscules sans accent, chiffres, points et tirets
export function identifiantValide(s) {
  return /^[a-z0-9][a-z0-9.-]{1,38}[a-z0-9]$/.test(s);
}

async function connecte(request, env) {
  const jeton = lireJeton(request);
  if (!jeton) return null;
  const c = await env.DB.prepare(
    `SELECT c.id, c.identifiant, c.nom, c.role, c.super_admin, c.doit_changer, c.exploitation_id, c.droits,
            e.nom AS exploitation_nom, s.expire_le
       FROM sessions s JOIN comptes c ON c.id = s.compte_id JOIN exploitations e ON e.id = c.exploitation_id
      WHERE s.jeton = ? AND s.expire_le > datetime('now') AND c.actif = 1 AND e.actif = 1`
  ).bind(jeton).first();
  if (!c) return null;
  // Prolongation, au plus une fois par mois, pour ne pas écrire à chaque clic
  const { prolonger } = await env.DB.prepare("SELECT ? < datetime('now', '+335 days') AS prolonger").bind(c.expire_le).first();
  if (prolonger) await env.DB.prepare("UPDATE sessions SET expire_le = datetime('now', ?) WHERE jeton = ?").bind(EXPIRATION, jeton).run();
  return { ...c, jeton };
}

const moiPourNavigateur = m => ({
  compte: { id: m.id, nom: m.nom, identifiant: m.identifiant, role: m.role },
  exploitation: { id: m.exploitation_id, nom: m.exploitation_nom },
  superAdmin: !!m.super_admin,
  doitChanger: !!m.doit_changer,
  droits: droitsDe(m)
});

function lireDonnees(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const t = JSON.stringify(brut);
  return t.length > TAILLE_MAX_SEMENCE ? null : t;
}

function semencePourNavigateur(l) {
  let donnees = {};
  try { donnees = JSON.parse(l.donnees) || {}; } catch {}
  return { id: l.id, version: l.version, donnees, modifie_le: l.modifie_le, modifie_par: l.modifie_par_nom ?? null };
}

const compteExiste = (env, identifiant) => env.DB.prepare('SELECT 1 FROM comptes WHERE identifiant = ?').bind(identifiant).first();

// Crée un compte avec un mot de passe provisoire (montré une seule fois)
async function creerCompte(env, { exploitationId, identifiant, nom, role, creePar, droits = '{"pluie":true}' }) {
  const mdp = motDePasseProvisoire();
  const c = await env.DB.prepare(
    `INSERT INTO comptes (exploitation_id, identifiant, nom, role, mot_de_passe, doit_changer, cree_par, droits)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?) RETURNING id, identifiant, nom, role, actif, droits`
  ).bind(exploitationId, identifiant, nom, role, await hacher(mdp), creePar, droits).first();
  return { ...c, droits: lireDroits(c.droits), motDePasse: mdp };
}

function lireNouveauCompte(corps) {
  const nom = texte(corps.nom, 80);
  const identifiant = texte(corps.identifiant, 40).toLowerCase();
  if (!nom) return { pb: 'Le nom est obligatoire.' };
  if (!identifiantValide(identifiant)) return { pb: 'Identifiant : de 3 à 40 caractères, lettres minuscules sans accent, chiffres, points et tirets.' };
  return { nom, identifiant };
}

export async function api(request, env, url) {
  const methode = request.method;
  // Une écriture doit venir de nos propres pages : même origine, et du JSON
  if (methode !== 'GET') {
    const origine = request.headers.get('origin');
    if (origine && origine !== url.origin) return erreur(403, 'Origine refusée.');
    if (methode !== 'DELETE' && !(request.headers.get('content-type') || '').includes('application/json')) return erreur(415, 'JSON attendu.');
  }
  const corps = (methode === 'POST' || methode === 'PUT' || methode === 'PATCH') ? await request.json().catch(() => ({})) : {};
  const p = url.pathname.split('/').filter(Boolean).slice(1); // sans « api »

  // ---------- connexion ----------
  if (p[0] === 'connexion' && methode === 'POST') {
    const identifiant = texte(corps.identifiant, 40).toLowerCase();
    const mdp = String(corps.motDePasse ?? '');
    if (!identifiant || !mdp) return erreur(400, 'Identifiant et mot de passe obligatoires.');
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM echecs WHERE identifiant = ? AND le > datetime('now', ?)")
      .bind(identifiant, FENETRE_ECHECS).first();
    if (n >= MAX_ECHECS) return erreur(429, 'Trop d\'essais ratés. Réessayez dans un quart d\'heure.');
    const c = await env.DB.prepare(
      `SELECT c.* FROM comptes c JOIN exploitations e ON e.id = c.exploitation_id
        WHERE c.identifiant = ? AND c.actif = 1 AND e.actif = 1`).bind(identifiant).first();
    if (!c || !await verifier(mdp, c.mot_de_passe)) {
      await env.DB.prepare('INSERT INTO echecs (identifiant) VALUES (?)').bind(identifiant).run();
      await env.DB.prepare("DELETE FROM echecs WHERE le < datetime('now', '-1 day')").run();
      return erreur(401, 'Identifiant ou mot de passe incorrect.');
    }
    const jeton = nouveauJeton();
    await env.DB.prepare("INSERT INTO sessions (jeton, compte_id, expire_le) VALUES (?, ?, datetime('now', ?))")
      .bind(jeton, c.id, EXPIRATION).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expire_le < datetime('now')").run();
    const moi = await env.DB.prepare('SELECT nom AS exploitation_nom FROM exploitations WHERE id = ?').bind(c.exploitation_id).first();
    return json(moiPourNavigateur({ ...c, ...moi }), 200, { 'set-cookie': cookieSession(jeton) });
  }

  if (p[0] === 'deconnexion' && methode === 'POST') {
    const jeton = lireJeton(request);
    if (jeton) await env.DB.prepare('DELETE FROM sessions WHERE jeton = ?').bind(jeton).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieSession('') });
  }

  // Tout le reste demande d'être connecté
  const moi = await connecte(request, env);
  if (!moi) return erreur(401, 'Non connecté.');
  const chef = moi.role === 'chef';

  if (p[0] === 'moi' && p.length === 1 && methode === 'GET') return json(moiPourNavigateur(moi));

  // Chacun change son propre mot de passe (obligatoire après un mot de passe provisoire)
  if (p[0] === 'moi' && p[1] === 'mot-de-passe' && methode === 'PATCH') {
    const c = await env.DB.prepare('SELECT mot_de_passe FROM comptes WHERE id = ?').bind(moi.id).first();
    if (!await verifier(String(corps.actuel ?? ''), c.mot_de_passe)) return erreur(403, 'Mot de passe actuel incorrect.');
    const pb = verifierMotDePasse(corps.nouveau);
    if (pb) return erreur(400, pb);
    if (corps.nouveau === corps.actuel) return erreur(400, 'Choisissez un mot de passe différent de l\'actuel.');
    await env.DB.prepare('UPDATE comptes SET mot_de_passe = ?, doit_changer = 0 WHERE id = ?').bind(await hacher(corps.nouveau), moi.id).run();
    // Les autres appareils de la personne sont déconnectés
    await env.DB.prepare('DELETE FROM sessions WHERE compte_id = ? AND jeton <> ?').bind(moi.id, moi.jeton).run();
    return json({ ok: true });
  }

  // Chacun change son nom affiché et son identifiant de connexion
  if (p[0] === 'moi' && p.length === 1 && methode === 'PATCH') {
    const nom = texte(corps.nom, 80);
    const identifiant = texte(corps.identifiant, 40).toLowerCase();
    if (!nom) return erreur(400, 'Le nom est obligatoire.');
    if (!identifiantValide(identifiant)) return erreur(400, 'Identifiant : de 3 à 40 caractères, lettres minuscules sans accent, chiffres, points et tirets.');
    if (identifiant !== moi.identifiant && await compteExiste(env, identifiant)) return erreur(409, 'Cet identifiant est déjà pris. Ajoutez une initiale ou un chiffre.');
    await env.DB.prepare('UPDATE comptes SET nom = ?, identifiant = ? WHERE id = ?').bind(nom, identifiant, moi.id).run();
    return json(moiPourNavigateur({ ...moi, nom, identifiant }));
  }

  // Le chef d'exploitation renomme son exploitation
  if (p[0] === 'exploitation' && p.length === 1 && methode === 'PATCH') {
    if (!chef) return erreur(403, 'Réservé au chef d\'exploitation.');
    const nom = texte(corps.nom, 80);
    if (!nom) return erreur(400, 'Le nom de l\'exploitation est obligatoire.');
    await env.DB.prepare('UPDATE exploitations SET nom = ? WHERE id = ?').bind(nom, moi.exploitation_id).run();
    return json(moiPourNavigateur({ ...moi, exploitation_nom: nom }));
  }

  // ---------- comptes de l'exploitation (chef d'exploitation) ----------
  if (p[0] === 'comptes') {
    if (!chef) return erreur(403, 'Réservé au chef d\'exploitation.');
    if (p.length === 1 && methode === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, identifiant, nom, role, actif, doit_changer, cree_le, droits FROM comptes WHERE exploitation_id = ? ORDER BY actif DESC, role, nom'
      ).bind(moi.exploitation_id).all();
      return json(results.map(c => ({ ...c, droits: lireDroits(c.droits) })));
    }
    if (p.length === 1 && methode === 'POST') {
      const n = lireNouveauCompte(corps);
      if (n.pb) return erreur(400, n.pb);
      const role = corps.role === 'chef' ? 'chef' : 'salarie';
      if (await compteExiste(env, n.identifiant)) return erreur(409, 'Cet identifiant est déjà pris (peut-être dans une autre exploitation). Ajoutez une initiale ou un chiffre.');
      return json(await creerCompte(env, { exploitationId: moi.exploitation_id, ...n, role, creePar: moi.id, droits: droitsDepuis(corps.droits, { pluie: true }) }), 201);
    }
    const id = Number(p[1]);
    const c = Number.isInteger(id) && await env.DB.prepare('SELECT * FROM comptes WHERE id = ? AND exploitation_id = ?').bind(id, moi.exploitation_id).first();
    if (!c) return erreur(404, 'Compte introuvable.');
    if (c.id === moi.id) return erreur(400, 'Pour votre propre compte, utilisez « Mon mot de passe ».');
    // Mot de passe oublié : un nouveau provisoire, et la personne est déconnectée partout
    if (p[2] === 'reinitialiser' && methode === 'POST') {
      const mdp = motDePasseProvisoire();
      await env.DB.prepare('UPDATE comptes SET mot_de_passe = ?, doit_changer = 1 WHERE id = ?').bind(await hacher(mdp), id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE compte_id = ?').bind(id).run();
      return json({ id, nom: c.nom, identifiant: c.identifiant, motDePasse: mdp });
    }
    // Désactiver / réactiver, changer de rôle, cocher ce qu'il peut modifier
    if (p.length === 2 && methode === 'PATCH') {
      const actif = corps.actif === undefined ? c.actif : (corps.actif ? 1 : 0);
      const role = corps.role === undefined ? c.role : (corps.role === 'chef' ? 'chef' : 'salarie');
      const droits = corps.droits === undefined ? c.droits : droitsDepuis(corps.droits, {});
      await env.DB.prepare('UPDATE comptes SET actif = ?, role = ?, droits = ? WHERE id = ?').bind(actif, role, droits, id).run();
      if (!actif) await env.DB.prepare('DELETE FROM sessions WHERE compte_id = ?').bind(id).run();
      return json({ ok: true });
    }
    return erreur(405, 'Méthode non prise en charge.');
  }

  // ---------- semences (dose de semis) ----------
  if (p[0] === 'semences') {
    if (p.length === 1 && methode === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT s.*, c.nom AS modifie_par_nom FROM semences s LEFT JOIN comptes c ON c.id = s.modifie_par
          WHERE s.exploitation_id = ? ORDER BY s.id`).bind(moi.exploitation_id).all();
      return json(results.map(semencePourNavigateur));
    }
    const toutModifier = peut(moi, 'semences');
    if (!toutModifier && !(methode === 'PUT' && peut(moi, 'pmg'))) return erreur(403, 'Vous ne pouvez pas modifier les semences.');

    // Création d'une ou plusieurs semences (plusieurs : rangement de celles d'un appareil)
    if (p.length === 1 && methode === 'POST') {
      const liste = Array.isArray(corps.liste) ? corps.liste : [corps.donnees];
      const textes = liste.map(lireDonnees);
      if (!textes.length || textes.some(t => !t)) return erreur(400, 'Semence illisible ou trop grosse.');
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM semences WHERE exploitation_id = ?').bind(moi.exploitation_id).first();
      if (n + textes.length > MAX_SEMENCES) return erreur(400, 'Trop de semences dans cet espace.');
      const crees = [];
      for (const t of textes) {
        const l = await env.DB.prepare('INSERT INTO semences (exploitation_id, donnees, modifie_par) VALUES (?, ?, ?) RETURNING *')
          .bind(moi.exploitation_id, t, moi.id).first();
        crees.push(semencePourNavigateur(l));
      }
      return json(crees, 201);
    }

    const id = Number(p[1]);
    if (!Number.isInteger(id) || p.length !== 2) return erreur(404, 'Introuvable.');
    const l = await env.DB.prepare('SELECT * FROM semences WHERE id = ? AND exploitation_id = ?').bind(id, moi.exploitation_id).first();
    if (!l) return erreur(404, 'Cette semence n\'existe plus.');

    if (methode === 'PUT') {
      let t = lireDonnees(corps.donnees);
      if (!t) return erreur(400, 'Semence illisible ou trop grosse.');
      // Droit « PMG » seulement : on ne garde que le PMG, le reste ne bouge pas
      if (!toutModifier) {
        let avant = {};
        try { avant = JSON.parse(l.donnees) || {}; } catch {}
        t = JSON.stringify({ ...avant, pmg: String(corps.donnees.pmg ?? avant.pmg ?? '').slice(0, 20) });
      }
      // Modifiée entre-temps sur un autre appareil : on renvoie la version à jour
      if (Number(corps.version) !== l.version) return erreur(409, 'Modifiée sur un autre appareil.', { semence: semencePourNavigateur(l) });
      const maj = await env.DB.prepare(
        "UPDATE semences SET donnees = ?, version = version + 1, modifie_le = datetime('now'), modifie_par = ? WHERE id = ? AND version = ? RETURNING *"
      ).bind(t, moi.id, id, l.version).first();
      if (!maj) return erreur(409, 'Modifiée sur un autre appareil.', { semence: semencePourNavigateur(l) });
      return json(semencePourNavigateur(maj));
    }
    if (methode === 'DELETE') {
      if (!toutModifier) return erreur(403, 'Vous ne pouvez pas supprimer de semence.');
      await env.DB.prepare('DELETE FROM semences WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    return erreur(405, 'Méthode non prise en charge.');
  }

  // ---------- réglages des applis (irrigation enrouleur…) ----------
  if (p[0] === 'reglages' && p.length === 2) {
    const cle = p[1];
    if (!CLES_REGLAGES.includes(cle)) return erreur(404, 'Réglage inconnu.');
    const l = await env.DB.prepare(
      'SELECT r.*, c.nom AS modifie_par_nom FROM reglages r LEFT JOIN comptes c ON c.id = r.modifie_par WHERE r.exploitation_id = ? AND r.cle = ?'
    ).bind(moi.exploitation_id, cle).first();
    const pourNavigateur = x => x ? { valeur: JSON.parse(x.valeur), version: x.version, modifie_le: x.modifie_le, modifie_par: x.modifie_par_nom ?? null } : { valeur: null, version: 0 };
    if (methode === 'GET') return json(pourNavigateur(l));
    if (methode !== 'PUT') return erreur(405, 'Méthode non prise en charge.');
    if (!peut(moi, 'enrouleurs')) return erreur(403, 'Vous ne pouvez pas modifier les enrouleurs.');
    if (corps.valeur === undefined) return erreur(400, 'Valeur manquante.');
    const t = JSON.stringify(corps.valeur);
    if (t.length > TAILLE_MAX_REGLAGE) return erreur(400, 'Réglage trop gros.');
    // Modifié entre-temps sur un autre appareil : on renvoie la version à jour
    if (Number(corps.version) !== (l ? l.version : 0)) return erreur(409, 'Modifié sur un autre appareil.', pourNavigateur(l));
    const maj = l
      ? await env.DB.prepare("UPDATE reglages SET valeur = ?, version = version + 1, modifie_le = datetime('now'), modifie_par = ? WHERE exploitation_id = ? AND cle = ? AND version = ? RETURNING *")
          .bind(t, moi.id, moi.exploitation_id, cle, l.version).first()
      : await env.DB.prepare('INSERT INTO reglages (exploitation_id, cle, valeur, modifie_par) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *')
          .bind(moi.exploitation_id, cle, t, moi.id).first();
    if (!maj) return erreur(409, 'Modifié sur un autre appareil.', pourNavigateur(l));
    return json(pourNavigateur(maj));
  }

  // ---------- pluviométrie ----------
  // Les pluviomètres de l'exploitation : tout le monde les voit, le chef les crée et les renomme
  if (p[0] === 'pluviometres') {
    if (p.length === 1 && methode === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, nom, actif FROM pluviometres WHERE exploitation_id = ? ORDER BY actif DESC, id').bind(moi.exploitation_id).all();
      return json(results);
    }
    if (!chef) return erreur(403, 'Réservé au chef d\'exploitation.');
    if (p.length === 1 && methode === 'POST') {
      const nom = texte(corps.nom, TAILLE_MAX_NOM);
      if (!nom) return erreur(400, 'Donnez un nom au pluviomètre.');
      const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM pluviometres WHERE exploitation_id = ?').bind(moi.exploitation_id).first();
      if (n >= 20) return erreur(400, 'Vingt pluviomètres au plus.');
      return json(await env.DB.prepare('INSERT INTO pluviometres (exploitation_id, nom) VALUES (?, ?) RETURNING id, nom, actif').bind(moi.exploitation_id, nom).first(), 201);
    }
    const id = Number(p[1]);
    const pl = Number.isInteger(id) && await env.DB.prepare('SELECT * FROM pluviometres WHERE id = ? AND exploitation_id = ?').bind(id, moi.exploitation_id).first();
    if (!pl) return erreur(404, 'Pluviomètre introuvable.');
    if (p.length === 2 && methode === 'PATCH') {
      const nom = corps.nom === undefined ? pl.nom : texte(corps.nom, TAILLE_MAX_NOM);
      if (!nom) return erreur(400, 'Donnez un nom au pluviomètre.');
      const actif = corps.actif === undefined ? pl.actif : (corps.actif ? 1 : 0);
      await env.DB.prepare('UPDATE pluviometres SET nom = ?, actif = ? WHERE id = ?').bind(nom, actif, id).run();
      return json({ id, nom, actif });
    }
    return erreur(405, 'Méthode non prise en charge.');
  }

  // Relevés : /api/pluie/<pluviomètre>?annee=2026 (un an), /api/pluie/<pluviomètre>/mois (historique)
  if (p[0] === 'pluie') {
    const id = Number(p[1]);
    const pl = Number.isInteger(id) && await env.DB.prepare('SELECT * FROM pluviometres WHERE id = ? AND exploitation_id = ?').bind(id, moi.exploitation_id).first();
    if (!pl) return erreur(404, 'Pluviomètre introuvable.');
    if (p.length === 2 && methode === 'GET') {
      const annee = /^\d{4}$/.test(url.searchParams.get('annee') || '') ? url.searchParams.get('annee') : String(new Date().getUTCFullYear());
      const { results } = await env.DB.prepare(
        `SELECT r.jour, r.mm, r.saisi_le, c.nom AS saisi_par FROM releves_pluie r LEFT JOIN comptes c ON c.id = r.saisi_par
          WHERE r.pluviometre_id = ? AND r.jour >= ? AND r.jour <= ? ORDER BY r.jour`).bind(id, annee + '-01-01', annee + '-12-31').all();
      return json(results);
    }
    // Totaux par mois, toutes années : pour l'histogramme et la comparaison
    if (p[2] === 'mois' && methode === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT substr(jour, 1, 4) AS annee, CAST(substr(jour, 6, 2) AS INTEGER) AS mois,
                ROUND(SUM(mm), 1) AS total, SUM(CASE WHEN mm > 0 THEN 1 ELSE 0 END) AS jours
           FROM releves_pluie WHERE pluviometre_id = ? GROUP BY annee, mois ORDER BY annee, mois`).bind(id).all();
      return json(results);
    }
    // Saisir ou corriger un relevé ; mm vide = effacer le relevé du jour
    if (p.length === 2 && methode === 'PUT') {
      if (!peut(moi, 'pluie')) return erreur(403, 'Vous ne pouvez pas saisir la pluviométrie.');
      const jour = String(corps.jour || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || isNaN(Date.parse(jour + 'T00:00:00Z'))) return erreur(400, 'Date invalide.');
      if (corps.mm === null || corps.mm === '') {
        await env.DB.prepare('DELETE FROM releves_pluie WHERE pluviometre_id = ? AND jour = ?').bind(id, jour).run();
        return json({ jour, mm: null });
      }
      const mm = Math.round(Number(String(corps.mm).replace(',', '.')) * 10) / 10;
      if (!(mm >= 0) || mm > 500) return erreur(400, 'Hauteur de pluie invalide (en mm, entre 0 et 500).');
      await env.DB.prepare(
        `INSERT INTO releves_pluie (pluviometre_id, jour, mm, saisi_par) VALUES (?, ?, ?, ?)
         ON CONFLICT (pluviometre_id, jour) DO UPDATE SET mm = excluded.mm, saisi_par = excluded.saisi_par, saisi_le = datetime('now')`
      ).bind(id, jour, mm, moi.id).run();
      return json({ jour, mm, saisi_par: moi.nom });
    }
    return erreur(405, 'Méthode non prise en charge.');
  }

  // ---------- exploitations (administrateur du site) ----------
  if (p[0] === 'exploitations') {
    if (!moi.super_admin) return erreur(403, 'Réservé à l\'administrateur du site.');
    if (p.length === 1 && methode === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT e.id, e.nom, e.actif, e.cree_le,
                (SELECT COUNT(*) FROM comptes c WHERE c.exploitation_id = e.id AND c.actif = 1) AS comptes,
                (SELECT COUNT(*) FROM semences s WHERE s.exploitation_id = e.id) AS semences
           FROM exploitations e ORDER BY e.nom`).all();
      return json(results);
    }
    // Nouvelle exploitation avec son chef d'exploitation (mot de passe provisoire)
    if (p.length === 1 && methode === 'POST') {
      const nomExpl = texte(corps.nom, 80);
      if (!nomExpl) return erreur(400, 'Le nom de l\'exploitation est obligatoire.');
      const n = lireNouveauCompte(corps.chef || {});
      if (n.pb) return erreur(400, 'Chef d\'exploitation — ' + n.pb);
      if (await compteExiste(env, n.identifiant)) return erreur(409, 'Cet identifiant est déjà pris. Ajoutez une initiale ou un chiffre.');
      const e = await env.DB.prepare('INSERT INTO exploitations (nom) VALUES (?) RETURNING id, nom').bind(nomExpl).first();
      const c = await creerCompte(env, { exploitationId: e.id, ...n, role: 'chef', creePar: moi.id });
      return json({ exploitation: e, chef: c }, 201);
    }
    const id = Number(p[1]);
    const e = Number.isInteger(id) && await env.DB.prepare('SELECT * FROM exploitations WHERE id = ?').bind(id).first();
    if (!e) return erreur(404, 'Exploitation introuvable.');
    // Renommer, ou suspendre / rouvrir un espace (rien n'est effacé)
    if (p.length === 2 && methode === 'PATCH') {
      if (corps.nom !== undefined) {
        const nom = texte(corps.nom, 80);
        if (!nom) return erreur(400, 'Le nom de l\'exploitation est obligatoire.');
        await env.DB.prepare('UPDATE exploitations SET nom = ? WHERE id = ?').bind(nom, id).run();
        if (corps.actif === undefined) return json({ ok: true, nom });
      }
      if (e.id === moi.exploitation_id) return erreur(400, 'Vous ne pouvez pas suspendre votre propre exploitation.');
      const actif = corps.actif ? 1 : 0;
      await env.DB.prepare('UPDATE exploitations SET actif = ? WHERE id = ?').bind(actif, id).run();
      if (!actif) await env.DB.prepare('DELETE FROM sessions WHERE compte_id IN (SELECT id FROM comptes WHERE exploitation_id = ?)').bind(id).run();
      return json({ ok: true });
    }
  }

  return erreur(404, 'Introuvable.');
}
