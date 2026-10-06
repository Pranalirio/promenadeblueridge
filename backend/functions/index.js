'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { GoogleAuth } = require('google-auth-library');
const config = require('./config');
const { LeadError, validateLead } = require('./lead');
const { saveLead } = require('./store');
const { sendCrm, writeSheet, deliver } = require('./delivery');

initializeApp({ projectId: config.projectId });
const db = getFirestore();
const apiKey = defineSecret('LEADRAT_API_KEY');
const sheetsAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const options = { region: config.region, serviceAccount: config.serviceAccount,
  minInstances: 0, maxInstances: 2, memory: '256MiB', cpu: 1, concurrency: 1 };

exports.submitVerifiedLead = onRequest({ ...options, invoker: 'public', timeoutSeconds: 30 }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Vary', 'Origin');
  if (!config.origins.includes(req.get('Origin'))) return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
  res.set('Access-Control-Allow-Origin', req.get('Origin'));
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'json_required' });
  if ((req.rawBody?.length || 0) > 16000) return res.status(413).json({ ok: false, error: 'request_too_large' });
  try {
    const bearer = req.get('Authorization') || '';
    if (!/^Bearer \S+$/.test(bearer)) throw new LeadError(401, 'phone_verification_required');
    let token;
    try { token = await getAuth().verifyIdToken(bearer.slice(7), true); }
    catch (error) {
      if (['auth/internal-error', 'auth/insufficient-permission'].includes(error.code)) throw new LeadError(503, 'service_unavailable');
      throw new LeadError(401, 'phone_verification_required');
    }
    const validated = validateLead(req.body, token);
    const saved = await saveLead(db, validated);
    // This confirms durable receipt, not delivery to every downstream service.
    return res.status(202).json({ ok: true, status: 'received', leadId: saved.id });
  } catch (error) {
    if (!(error instanceof LeadError)) logger.error('lead_storage_unavailable');
    if (error.status === 429) res.set('Retry-After', '60');
    return res.status(error instanceof LeadError ? error.status : 503).json({
      ok: false, error: error instanceof LeadError ? error.code : 'service_unavailable'
    });
  }
});

async function processLead(ref) {
  const dependencies = {
    sendCrm: (record, id) => sendCrm(record, id, apiKey.value()),
    writeSheet: async (record, id) => writeSheet(record, id, await sheetsAuth.getClient()),
    warn: (message, details) => logger.warn(message, details)
  };
  try { await deliver(db, ref, dependencies); }
  catch { logger.error('lead_worker_failed', { leadId: ref.id }); }
}

exports.deliverVerifiedLead = onDocumentCreated({ ...options,
  document: `${config.collection}/{leadId}`, secrets: [apiKey], timeoutSeconds: 120, retry: false
}, event => event.data ? processLead(event.data.ref) : undefined);

exports.retryVerifiedLeads = onSchedule({ ...options, maxInstances: 1,
  schedule: 'every 5 minutes', timeZone: 'Asia/Kolkata', secrets: [apiKey], timeoutSeconds: 240
}, async () => {
  const pending = await db.collection(config.collection).where('nextAttemptAt', '>=', 0)
    .where('nextAttemptAt', '<=', Date.now()).orderBy('nextAttemptAt').limit(3).get();
  for (const document of pending.docs) await processLead(document.ref);
});
