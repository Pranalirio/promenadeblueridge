'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const { validateLead, leadratPayload, sheetHeaders, crmOutcome } = require('../lead');
const { saveLead } = require('../store');
const { sendCrm, writeSheet, deliver } = require('../delivery');
const now = Date.now();
// Synthetic fixtures only: no SMS, API keys, CRM writes or real customer data.
const token = { uid: 'test-user', phone_number: '+919000000000', auth_time: Math.floor(now / 1000), firebase: { sign_in_provider: 'phone' } };
const body = { requestId: '12345678-1234-4234-9234-123456789abc', name: 'Sample Person', phone: '9000000000',
  configuration: '3 BHK', form_type: 'brochure', consent: true, consentVersion: config.consentVersion,
  utm_campaign: '=1+1', message: 'Sample enquiry' };
const verified = () => validateLead(body, token, now);
const record = () => ({ lead: verified().lead, fingerprint: verified().fingerprint, createdAt: now,
  crm: { state: 'pending', attempts: 0 }, sheet: { state: 'pending', attempts: 0 }, nextAttemptAt: 0, leaseUntil: 0 });

function memoryDb() {
  const records = new Map();
  function doc(path, id) {
    return { id, key: path + '/' + id,
      update: async patch => records.set(path + '/' + id, { ...records.get(path + '/' + id), ...structuredClone(patch) }) };
  }
  return { records, collection: path => ({ doc: id => doc(path, id) }),
    runTransaction: async fn => {
      const writes = [];
      const result = await fn({
        get: async ref => ({ exists: records.has(ref.key), data: () => structuredClone(records.get(ref.key)) }),
        create: (ref, value) => { assert.equal(records.has(ref.key), false); writes.push([ref.key, value]); },
        set: (ref, value) => writes.push([ref.key, value]),
        update: (ref, value) => writes.push([ref.key, { ...records.get(ref.key), ...value }])
      });
      for (const [key, value] of writes) records.set(key, structuredClone(value));
      return result;
    }
  };
}

test('rejects a forged verified flag, unverified provider and test number outside India', () => {
  assert.throws(() => validateLead({ ...body, verified: true }, {}, now), /phone_verification_required/);
  assert.throws(() => validateLead(body, { ...token, firebase: { sign_in_provider: 'password' } }, now), /phone_verification_required/);
  assert.throws(() => validateLead(body, { ...token, phone_number: '+16505550137' }, now), /phone_verification_required/);
});
test('rejects phone mismatch, stale authentication, invalid names and missing consent', () => {
  assert.throws(() => validateLead({ ...body, phone: '9000000001' }, token, now), /verified_phone_mismatch/);
  assert.throws(() => validateLead(body, { ...token, auth_time: token.auth_time - 1801 }, now), /verify_phone_again/);
  assert.throws(() => validateLead({ ...body, name: 'Name 123' }, token, now), /invalid_name/);
  assert.throws(() => validateLead({ ...body, consent: false }, token, now), /consent_required/);
});
test('keeps project/source fixed and maps verified phone + campaign to CRM', () => {
  const validated = validateLead({ ...body, project: 'Untrusted project', source: 'Untrusted source' }, token, now);
  const payload = leadratPayload({ lead: validated.lead, createdAt: now }, validated.id);
  assert.equal(payload.project, config.projectName);
  assert.equal(payload.source, 'Website');
  assert.equal(payload.mobile, '9000000000');
  assert.equal(payload.countryCode, '91');
  assert.equal(payload.additionalProperties.Campaign, '=1+1');
  assert.match(payload.notes, /utm_campaign: =1\+1/);
  assert.match(payload.submittedDate, /^\d{2}-\d{2}-\d{4}$/);
});
test('durable retries with the same request ID create exactly one queued lead', async () => {
  const db = memoryDb();
  const first = await saveLead(db, verified(), now);
  const second = await saveLead(db, verified(), now + 1);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.id, second.id);
  assert.equal([...db.records.keys()].filter(x => x.startsWith('verifiedLeads/')).length, 1);
  await assert.rejects(saveLead(db, { ...verified(), fingerprint: 'different' }, now + 2), /request_id_reused/);
});
test('blocks rapid new enquiries while allowing an idempotent retry', async () => {
  const db = memoryDb();
  await saveLead(db, verified(), now);
  await assert.rejects(saveLead(db, { ...verified(), id: 'new-request' }, now + 100), /please_try_later/);
  await saveLead(db, { ...verified(), id: 'later-request' }, now + 31000);
});
test('requires meaningful HTTP acknowledgment; negative 200 responses are not success', () => {
  assert.equal(crmOutcome(200, { success: true }), 'delivered');
  assert.equal(crmOutcome(200, { isSuccess: false }), 'review');
  assert.equal(crmOutcome(403, {}), 'rejected');
  assert.equal(crmOutcome(429, {}), 'pending');
  assert.equal(crmOutcome(500, {}), 'review');
});
test('CRM network timeout is marked for review, with no automatic second POST', async () => {
  let calls = 0;
  const outcome = await sendCrm(record(), 'id', 'synthetic-test-key', async () => { calls++; throw new Error('timeout'); });
  assert.equal(outcome.state, 'review');
  assert.equal(calls, 1);
});
test('CRM request uses the fixed endpoint and server-side header; redirects are disabled', async () => {
  const outcome = await sendCrm(record(), 'id', 'synthetic-test-key', async (url, options) => {
    assert.equal(url, config.leadratUrl);
    assert.equal(options.headers['API-Key'], 'synthetic-test-key');
    assert.equal(options.redirect, 'error');
    assert.equal(JSON.parse(options.body).name, 'Sample Person');
    return { status: 200, text: async () => '{"success":true}' };
  });
  assert.equal(outcome.state, 'delivered');
});
test('unexpected HTML response does not become a confirmed CRM delivery', async () => {
  const outcome = await sendCrm(record(), 'id', 'synthetic-test-key', async () => ({ status: 200, text: async () => '<html>Sign in</html>' }));
  assert.equal(outcome.state, 'review');
});
test('Sheets retries find an existing Lead ID and update it without adding another row', async () => {
  const requests = [];
  await writeSheet(record(), 'the-id', { request: async options => {
    requests.push(options);
    if (requests.length === 1) return { data: { values: [sheetHeaders] } };
    if (requests.length === 2) return { data: { values: [['other-id'], ['the-id']] } };
    return { data: { updatedRows: 1 } };
  } });
  assert.equal(requests.length, 3);
  assert.equal(requests[2].method, 'PUT');
  assert.match(decodeURIComponent(requests[2].url), /A3:J3/);
  assert.match(requests[2].url, /valueInputOption=RAW/);
  assert.equal(requests[2].data.values[0][6], '=1+1');
  assert.equal(requests[2].retry, false);
});
test('Sheets header mismatch stops writes before modifying user data', async () => {
  let count = 0;
  await assert.rejects(writeSheet(record(), 'the-id', { request: async () => { count++; return { data: { values: [['wrong']] } }; } }), /sheet_headers_mismatch/);
  assert.equal(count, 1);
});
test('Sheets first delivery appends one row and requires a write acknowledgment', async () => {
  let count = 0;
  await writeSheet(record(), 'new-id', { request: async options => {
    count++;
    if (count === 1) return { data: { values: [sheetHeaders] } };
    if (count === 2) return { data: { values: [] } };
    assert.equal(options.method, 'POST');
    assert.equal(options.data.values[0][9], 'new-id');
    return { data: { updates: { updatedRows: 1 } } };
  } });
});
test('partial Sheets failure retries Sheets without sending CRM a second time', async () => {
  const db = memoryDb();
  const ref = db.collection(config.collection).doc('id');
  db.records.set(ref.key, record());
  let crmCalls = 0, sheetCalls = 0;
  const dependencies = {
    sendCrm: async () => { crmCalls++; return { state: 'delivered' }; },
    writeSheet: async () => { sheetCalls++; if (sheetCalls === 1) throw new Error('temporary failure'); },
    warn: () => {}
  };
  await deliver(db, ref, dependencies);
  assert.equal(db.records.get(ref.key).sheet.state, 'pending');
  await ref.update({ nextAttemptAt: 0 });
  await deliver(db, ref, dependencies);
  assert.equal(crmCalls, 1);
  assert.equal(sheetCalls, 2);
  assert.equal(db.records.get(ref.key).nextAttemptAt, null);
});
test('interrupted CRM send becomes review instead of creating a duplicate', async () => {
  const db = memoryDb();
  const ref = db.collection(config.collection).doc('id');
  db.records.set(ref.key, { ...record(), crm: { state: 'sending', attempts: 1 } });
  let crmCalls = 0;
  await deliver(db, ref, {
    sendCrm: async () => { crmCalls++; }, writeSheet: async () => {}, warn: () => {}
  });
  assert.equal(crmCalls, 0);
  assert.equal(db.records.get(ref.key).crm.state, 'review');
  assert.equal(db.records.get(ref.key).nextAttemptAt, null);
});
test('active worker lease and finished deliveries are not processed again', async () => {
  const db = memoryDb();
  const ref = db.collection(config.collection).doc('id');
  db.records.set(ref.key, { ...record(), leaseUntil: Date.now() + 500000 });
  const noWork = { sendCrm: async () => assert.fail('duplicate CRM send'), writeSheet: async () => assert.fail('duplicate Sheet write'), warn: () => {} };
  await deliver(db, ref, noWork);
  await ref.update({ leaseUntil: 0, nextAttemptAt: null });
  await deliver(db, ref, noWork);
});
