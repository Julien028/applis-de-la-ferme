// Mots de passe et cookie de connexion — même méthode que le site des heures
// et le cochonnet. API Web Crypto standard (Workers, Node, navigateurs).

export const COOKIE = 'dose_session';
// On reste connecté sur son téléphone : un an, prolongé à l'usage
const DUREE_JOURS = 365;
export const EXPIRATION = `+${DUREE_JOURS} days`;
// 100 000 tours : le plafond accepté par les Workers pour PBKDF2
const TOURS = 100000;

const b64 = octets => btoa(String.fromCharCode(...new Uint8Array(octets)));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriver(motDePasse, sel, tours) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: tours }, cle, 256);
}

// Forme stockée : pbkdf2$tours$sel$empreinte. Le mot de passe n'est jamais gardé en clair.
export async function hacher(motDePasse) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${TOURS}$${b64(sel)}$${b64(await deriver(motDePasse, sel, TOURS))}`;
}

export async function verifier(motDePasse, stocke) {
  const [algo, tours, sel, attendu] = String(stocke).split('$');
  if (algo !== 'pbkdf2' || !attendu) return false;
  const obtenu = b64(await deriver(motDePasse, deB64(sel), Number(tours)));
  // Comparaison à temps constant
  let diff = obtenu.length ^ attendu.length;
  for (let i = 0; i < obtenu.length; i++) diff |= obtenu.charCodeAt(i) ^ attendu.charCodeAt(i % attendu.length);
  return diff === 0;
}

export function nouveauJeton() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
}

// Mot de passe facile à dicter : trois mots et deux chiffres (ex. « semoir-orge-talus-47 »)
const MOTS = ['semoir', 'orge', 'talus', 'sillon', 'grain', 'herse', 'colza', 'meule', 'silo', 'chaume',
  'labour', 'trefle', 'avoine', 'luzerne', 'tracteur', 'remorque', 'rouleau', 'plaine', 'haie', 'mare',
  'epi', 'paille', 'fourche', 'grange', 'verger', 'friche', 'motte', 'binage', 'semis', 'levee'];
export function motDePasseProvisoire() {
  const n = crypto.getRandomValues(new Uint32Array(4));
  const mot = i => MOTS[n[i] % MOTS.length];
  return `${mot(0)}-${mot(1)}-${mot(2)}-${String(n[3] % 90 + 10)}`;
}

export const cookieSession = jeton =>
  `${COOKIE}=${jeton}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${jeton ? DUREE_JOURS * 86400 : 0}`;

export function lireJeton(request) {
  const brut = request.headers.get('cookie') || '';
  const trouve = brut.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  const jeton = trouve ? trouve.slice(COOKIE.length + 1) : '';
  return /^[0-9a-f]{64}$/.test(jeton) ? jeton : '';
}
