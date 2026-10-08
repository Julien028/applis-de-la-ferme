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
    `SELECT c.id, c.identifiant, c.nom, c.role, c.super_admin, c.doit_changer, c.exploitation_id,
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
  doitChanger: !!m.doit_changer
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
async function creerCompte(env, { exploitationId, identifiant, nom, role, creePar }) {
  const mdp = motDePasseProvisoire();
  const c = await env.DB.prepare(
    `INSERT INTO comptes (exploitation_id, identifiant, nom, role, mot_de_passe, doit_changer, cree_par)
     VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING id, identifiant, nom, role, actif`
  ).bind(exploitationId, identifiant, nom, role, await hacher(mdp), creePar).first();
  return { ...c, motDePasse: mdp };
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

  // ---------- comptes de l'exploitation (chef d'exploitation) ----------
  if (p[0] === 'comptes') {
    if (!chef) return erreur(403, 'Réservé au chef d\'exploitation.');
    if (p.length === 1 && methode === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT id, identifiant, nom, role, actif, doit_changer, cree_le FROM comptes WHERE exploitation_id = ? ORDER BY actif DESC, role, nom'
      ).bind(moi.exploitation_id).all();
      return json(results);
    }
    if (p.length === 1 && methode === 'POST') {
      const n = lireNouveauCompte(corps);
      if (n.pb) return erreur(400, n.pb);
      const role = corps.role === 'chef' ? 'chef' : 'salarie';
      if (await compteExiste(env, n.identifiant)) return erreur(409, 'Cet identifiant est déjà pris (peut-être dans une autre exploitation). Ajoutez une initiale ou un chiffre.');
      return json(await creerCompte(env, { exploitationId: moi.exploitation_id, ...n, role, creePar: moi.id }), 201);
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
    // Désactiver / réactiver, changer de rôle
    if (p.length === 2 && methode === 'PATCH') {
      const actif = corps.actif === undefined ? c.actif : (corps.actif ? 1 : 0);
      const role = corps.role === undefined ? c.role : (corps.role === 'chef' ? 'chef' : 'salarie');
      await env.DB.prepare('UPDATE comptes SET actif = ?, role = ? WHERE id = ?').bind(actif, role, id).run();
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
    if (!chef) return erreur(403, 'Seul le chef d\'exploitation peut modifier les semences.');

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
      const t = lireDonnees(corps.donnees);
      if (!t) return erreur(400, 'Semence illisible ou trop grosse.');
      // Modifiée entre-temps sur un autre appareil : on renvoie la version à jour
      if (Number(corps.version) !== l.version) return erreur(409, 'Modifiée sur un autre appareil.', { semence: semencePourNavigateur(l) });
      const maj = await env.DB.prepare(
        "UPDATE semences SET donnees = ?, version = version + 1, modifie_le = datetime('now'), modifie_par = ? WHERE id = ? AND version = ? RETURNING *"
      ).bind(t, moi.id, id, l.version).first();
      if (!maj) return erreur(409, 'Modifiée sur un autre appareil.', { semence: semencePourNavigateur(l) });
      return json(semencePourNavigateur(maj));
    }
    if (methode === 'DELETE') {
      await env.DB.prepare('DELETE FROM semences WHERE id = ?').bind(id).run();
      return json({ ok: true });
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
    // Suspendre ou rouvrir un espace (rien n'est effacé)
    if (p.length === 2 && methode === 'PATCH') {
      if (e.id === moi.exploitation_id) return erreur(400, 'Vous ne pouvez pas suspendre votre propre exploitation.');
      const actif = corps.actif ? 1 : 0;
      await env.DB.prepare('UPDATE exploitations SET actif = ? WHERE id = ?').bind(actif, id).run();
      if (!actif) await env.DB.prepare('DELETE FROM sessions WHERE compte_id IN (SELECT id FROM comptes WHERE exploitation_id = ?)').bind(id).run();
      return json({ ok: true });
    }
  }

  return erreur(404, 'Introuvable.');
}
