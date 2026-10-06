'use strict';

module.exports = Object.freeze({
  projectId: 'promenade-leads',
  region: 'asia-south1',
  serviceAccount: 'promenade-leads-backend@promenade-leads.iam.gserviceaccount.com',
  projectName: 'The Promenade Residences - Blue Ridge',
  origins: ['https://promenadeblueridge.com', 'https://www.promenadeblueridge.com'],
  leadratUrl: 'https://connect.leadrat.com/api/v1/integration/Website',
  sheetId: '1BryWV0-jPp3otJWbLBmevlEalu0pk6YrJLdoPnYlICU',
  sheetTab: 'Leads',
  consentVersion: 'promenade-otp-2026-10-06',
  collection: 'verifiedLeads',
  leaseMs: 300000,
  maxDeliveryAttempts: 12
});
