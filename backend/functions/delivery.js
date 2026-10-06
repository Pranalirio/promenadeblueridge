'use strict';

const config = require('./config');
const { leadratPayload, sheetHeaders, sheetRow, crmOutcome } = require('./lead');
const { acquire } = require('./store');

async function sendCrm(record, id, apiKey, fetchImpl = fetch) {
  if (!apiKey || /[\r\n]/.test(apiKey)) return { state: 'rejected', reason: 'key_missing_or_invalid' };
  try {
    // No automatic HTTP retries: LeadRat has not documented an idempotency key.
    const response = await fetchImpl(config.leadratUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(leadratPayload(record, id))
    });
    let body = null;
    const raw = await response.text();
    try { body = raw.trim() ? JSON.parse(raw) : null; }
    catch { return { state: 'review', httpStatus: response.status, reason: 'unrecognized_response' }; }
    return { state: crmOutcome(response.status, body), httpStatus: response.status };
  } catch {
    // Timeout/network failure may happen AFTER CRM accepted a lead. Do not
    // blindly POST again and create duplicate customer enquiries.
    return { state: 'review', reason: 'delivery_outcome_unknown' };
  }
}

async function writeSheet(record, id, client) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/`;
  const range = suffix => encodeURIComponent(`'${config.sheetTab}'!${suffix}`);
  const request = options => client.request({ ...options, timeout: 15000, retry: false });
  const header = await request({ url: base + range('A1:J1') });
  const actual = header.data.values?.[0] || [];
  if (!sheetHeaders.every((value, i) => actual[i] === value)) throw new Error('sheet_headers_mismatch');
  const ids = await request({ url: base + range('J2:J') });
  const index = (ids.data.values || []).findIndex(row => row[0] === id);
  if (index >= 0) {
    // Find by persistent Lead ID on every retry instead of trusting a row number.
    const updated = await request({ url: base + range(`A${index + 2}:J${index + 2}`) + '?valueInputOption=RAW',
      method: 'PUT', data: { values: [sheetRow(record, id)] } });
    if (updated.data.updatedRows !== 1) throw new Error('sheet_write_unconfirmed');
  } else {
    const appended = await request({ url: base + range('A:J') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      method: 'POST', data: { values: [sheetRow(record, id)] } });
    if (appended.data.updates?.updatedRows !== 1) throw new Error('sheet_write_unconfirmed');
  }
}

async function deliver(db, ref, dependencies) {
  const record = await acquire(db, ref);
  if (!record) return;
  let crm = record.crm;
  // A previous worker died between marking a send and recording its outcome.
  if (crm.state === 'sending') {
    crm = { ...crm, state: 'review', reason: 'previous_delivery_outcome_unknown' };
  } else if (crm.state === 'pending') {
    const attempts = crm.attempts + 1;
    await ref.update({ crm: { state: 'sending', attempts } });
    crm = { ...await dependencies.sendCrm(record, ref.id), attempts };
    if (crm.state === 'pending' && attempts >= config.maxDeliveryAttempts) crm.state = 'review';
  }
  await ref.update({ crm });
  record.crm = crm;
  let sheet = record.sheet;
  if (sheet.state !== 'delivered' || sheet.crmState !== crm.state) {
    const attempts = sheet.attempts + 1;
    try {
      await dependencies.writeSheet(record, ref.id);
      sheet = { state: 'delivered', attempts, crmState: crm.state };
    } catch {
      sheet = { state: attempts >= config.maxDeliveryAttempts ? 'review' : 'pending', attempts };
    }
  }
  const retry = crm.state === 'pending' || sheet.state === 'pending';
  const attempts = Math.max(crm.attempts, sheet.attempts);
  await ref.update({ crm, sheet, leaseUntil: 0, updatedAt: Date.now(),
    nextAttemptAt: retry ? Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6)) : null });
  if (crm.state === 'review' || crm.state === 'rejected' || sheet.state === 'review') {
    // Reference/status only; never log names, phones, tokens, API keys or responses.
    dependencies.warn('lead_delivery_needs_review', { leadId: ref.id, crm: crm.state, sheet: sheet.state });
  }
}

module.exports = { sendCrm, writeSheet, deliver };
