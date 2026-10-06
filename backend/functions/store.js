'use strict';

const { LeadError } = require('./lead');
const config = require('./config');

async function saveLead(db, validated, now = Date.now()) {
  const ref = db.collection(config.collection).doc(validated.id);
  const rateRef = db.collection('leadRateLimits').doc(validated.rateKey);
  return db.runTransaction(async tx => {
    const [existing, rateDoc] = await Promise.all([tx.get(ref), tx.get(rateRef)]);
    if (existing.exists) {
      if (existing.data().fingerprint !== validated.fingerprint) throw new LeadError(409, 'request_id_reused');
      return { id: ref.id, duplicate: true };
    }
    const rate = rateDoc.exists ? rateDoc.data() : {};
    const day = new Date(now).toISOString().slice(0, 10);
    const dailyCount = rate.day === day ? rate.count : 0;
    if (now - (rate.lastAt || 0) < 30000 || dailyCount >= 20) throw new LeadError(429, 'please_try_later');
    tx.create(ref, {
      lead: validated.lead, fingerprint: validated.fingerprint, createdAt: now,
      crm: { state: 'pending', attempts: 0 }, sheet: { state: 'pending', attempts: 0 },
      leaseUntil: 0, nextAttemptAt: now
    });
    tx.set(rateRef, { day, count: dailyCount + 1, lastAt: now });
    return { id: ref.id, duplicate: false };
  });
}

async function acquire(db, ref, now = Date.now()) {
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const record = snap.data();
    if (record.nextAttemptAt === null || record.nextAttemptAt > now || record.leaseUntil > now) return null;
    tx.update(ref, { leaseUntil: now + config.leaseMs, nextAttemptAt: now + config.leaseMs });
    return record;
  });
}

module.exports = { saveLead, acquire };
