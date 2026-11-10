// Cloudflare Pages Function for /api/* (the "Before you go" form). All the logic is in lib/leads.mjs.
import { handleLead } from '../../lib/leads.mjs';

export async function onRequest(context) {
  return handleLead(context.request, context.env);
}
