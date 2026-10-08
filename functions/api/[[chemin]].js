// Toutes les adresses /api/… passent ici (fonction Cloudflare Pages).
// La logique est dans src/api.js, du code standard qui ne dépend pas de l'hébergeur.
import { api, json } from '../../src/api.js';

export async function onRequest({ request, env }) {
  try {
    return await api(request, env, new URL(request.url));
  } catch (e) {
    console.error(e);
    return json({ erreur: 'Erreur du serveur, réessayez dans un instant.' }, 500);
  }
}
