// Cloudflare Pages Function for every /admin/api/... request (My Shop's server part).
// All the logic lives in lib/admin-core.mjs so it can be tested on its own.
import { handle } from '../../../lib/admin-core.mjs';

export async function onRequest(context) {
  return handle(context.request, context.env);
}
