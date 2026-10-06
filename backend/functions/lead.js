'use strict';

const { createHash } = require('node:crypto');
const config = require('./config');

class LeadError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const hash = value => createHash('sha256').update(value).digest('hex');

function text(value, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new LeadError(400, 'invalid_details');
  const clean = value.trim();
  if (clean.length > max || /[\u0000-\u0008\u000b-\u001f]/u.test(clean) || (required && !clean)) {
    throw new LeadError(400, 'invalid_details');
  }
  return clean;
}

function validateLead(body, token, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LeadError(400, 'invalid_details');
  // A client-provided verified:true flag is deliberately ignored.
  if (!token?.uid || token.firebase?.sign_in_provider !== 'phone' || !/^\+91[6-9]\d{9}$/.test(token.phone_number || '')) {
    throw new LeadError(401, 'phone_verification_required');
  }
  const age = Math.floor(now / 1000) - token.auth_time;
  if (!Number.isFinite(age) || age < -60 || age > 1800) throw new LeadError(401, 'verify_phone_again');
  const requestId = text(body.requestId, 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new LeadError(400, 'invalid_request_id');
  }
  const name = text(body.name, 100, true).replace(/\s+/g, ' ');
  if (name.length < 2 || !/^[\p{L}][\p{L}\p{M} .'’\-]*$/u.test(name)) throw new LeadError(400, 'invalid_name');
  const phone = text(body.phone, 16, true);
  if (!/^(?:\+91)?[6-9]\d{9}$/.test(phone)) throw new LeadError(400, 'invalid_phone');
  if ((phone.startsWith('+') ? phone : '+91' + phone) !== token.phone_number) {
    throw new LeadError(400, 'verified_phone_mismatch');
  }
  const configuration = text(body.configuration, 40, true);
  if (!['3 BHK', '4 BHK', '4 BHK - Type A', '4 BHK - Type B', 'Both / Not sure'].includes(configuration)) {
    throw new LeadError(400, 'invalid_configuration');
  }
  const formType = text(body.form_type, 30, true);
  if (!['hero_enquiry', 'contact_enquiry', 'enquiry', 'costsheet', 'brochure', 'plan', 'sitevisit', 'auto'].includes(formType)) {
    throw new LeadError(400, 'invalid_form');
  }
  if (body.consent !== true || body.consentVersion !== config.consentVersion) throw new LeadError(400, 'consent_required');
  const tracking = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) {
    tracking[key] = text(body[key], 300);
  }
  const lead = {
    name, phone: token.phone_number, configuration, formType,
    message: text(body.message, 1000), tracking, consentVersion: config.consentVersion
  };
  return {
    id: hash(token.uid + ':' + requestId.toLowerCase()),
    fingerprint: hash(JSON.stringify(lead)),
    rateKey: hash(token.phone_number), lead
  };
}

function leadratPayload(record, id) {
  const { lead, createdAt } = record;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(createdAt));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {
    name: lead.name, countryCode: '91', mobile: lead.phone.slice(3),
    project: config.projectName, source: 'Website', subSource: 'promenadeblueridge.com',
    submittedDate: `${p.day}-${p.month}-${p.year}`, submittedTime: `${p.hour}:${p.minute}:${p.second}`,
    notes: [
      'Mobile verified with Firebase OTP.', `Enquiry: ${lead.formType}.`,
      `Configuration: ${lead.configuration}.`, `Reference: ${id}.`,
      lead.message,
      ...Object.entries(lead.tracking).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
    ].filter(Boolean).join('\n'),
    additionalProperties: {
      EnquiredFor: 'Buy', Configuration: lead.configuration,
      NoOfBHK: lead.configuration.startsWith('3') ? '3' : lead.configuration.startsWith('4') ? '4' : '',
      OTPVerified: 'Yes', WebsiteLeadId: id, Campaign: lead.tracking.utm_campaign
    }
  };
}

const sheetHeaders = ['Date', 'Name', 'Mobile', 'Configuration', 'Project', 'Source', 'Campaign', 'OTP Verified', 'CRM Status', 'Lead ID'];
function sheetRow(record, id) {
  return [new Date(record.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    record.lead.name, record.lead.phone, record.lead.configuration, config.projectName,
    'Website', record.lead.tracking.utm_campaign, 'Yes', record.crm.state, id];
}

function crmOutcome(status, body) {
  if (status === 429) return 'pending';
  // The published LeadRat contract documents 200 OK. Negative application flags
  // override it; unfamiliar/ambiguous responses require a human check.
  if (status === 200 && body?.success !== false && body?.isSuccess !== false && body?.succeeded !== false && body?.ok !== false && !body?.error) return 'delivered';
  if ([400, 401, 403, 404, 422].includes(status)) return 'rejected';
  return 'review';
}

module.exports = { LeadError, hash, validateLead, leadratPayload, sheetHeaders, sheetRow, crmOutcome };
