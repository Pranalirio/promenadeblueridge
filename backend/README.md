# Promenade verified-lead backend

**Status: prepared, not deployed or connected to the landing-page forms.**
GitHub Pages continues to host the website. These files run separately as Firebase
Cloud Functions after the remaining setup below. No LeadRat key is stored here.
No live SMS, CRM submission or Google Sheet write has been tested by this package.

## What this prepares

1. The website verifies the customer's mobile with Firebase Phone Authentication.
2. It sends the Firebase ID token and enquiry to `submitVerifiedLead`.
3. The function verifies the signed token, revocation, phone provider, Indian
   mobile number, recent authentication and matching form number.
4. A private Firestore transaction saves the enquiry before acknowledging receipt.
5. A Firestore-triggered worker sends it to LeadRat and the shared Google Sheet.
6. A scheduled worker recovers interrupted work and retries eligible failures.

Firestore is the durable inbox: an unavailable CRM or Sheet must not silently lose
a customer's verified enquiry. The website's success message must mean “enquiry
received”, not “already delivered to CRM”. CORS is an origin restriction; Firebase
token verification is the actual authorization check.

## Fixed project settings

| Setting | Value |
| --- | --- |
| Firebase project | `promenade-leads` |
| Function region | `asia-south1` (Mumbai) |
| Website | `https://promenadeblueridge.com` (and its `www` domain) |
| Runtime identity | `promenade-leads-backend@promenade-leads.iam.gserviceaccount.com` |
| LeadRat integration | Promenade Blue Ridge |
| LeadRat secret name | `LEADRAT_API_KEY` |
| LeadRat endpoint | `https://connect.leadrat.com/api/v1/integration/Website` |
| LeadRat project | The Promenade Residences - Blue Ridge |
| CRM source / subSource | Website / promenadeblueridge.com |
| Sheet ID | `1BryWV0-jPp3otJWbLBmevlEalu0pk6YrJLdoPnYlICU` |
| Sheet tab | `Leads` |

`functions/config.js` contains these non-secret settings. Do not use another
property website's integration key. Project and CRM source cannot be overridden
by browser submissions. Campaign data is preserved in notes and additional
properties; tenant-specific routing/assignment still needs an end-to-end check
against the downloaded LeadRat guide.

## Preparation in Cloud Shell

Open Cloud Shell with Promenade Leads selected, then download this repository:

```bash
git clone https://github.com/Pranalirio/promenadeblueridge.git promenade-leads-setup
cd promenade-leads-setup/backend/functions
```

Use Node.js 22 (the deployment runtime). With Node 22 selected:

```bash
npm ci
npm test
npm run check
```

Tests use synthetic fixtures and mock all external writes. They do not send SMS
or create leads in Google Cloud or LeadRat. Do not run `firebase init` over these
files; the Firebase configuration is already provided.

The lockfile pins dependencies. A scoped override upgrades `gaxios@6.7.1`'s UUID
dependency to 11.1.1 for GHSA-w5hq-g745-h8pq; gaxios uses the compatible `v4()`
function. Remove the override once its upstream dependency is patched.

## Setup still required before deployment

Proceed through these manually with the project owner; this document does not
claim that any of them has already happened.

1. Confirm the existing UPI payment has been credited, the linked Cloud Billing
   account is open, and Firebase shows **Blaze**. Do not duplicate the payment
   merely because the project still displays Spark. Billing activation is needed
   for this deployment and real verification SMS. Functions, Firestore, Scheduler,
   Secret Manager and builds may incur usage charges; configured instance limits
   are not a billing cap.
2. Create the `(default)` Firestore database in **Standard edition, Native mode**,
   using **Production mode**. For this new project use Mumbai (`asia-south1`).
   Database location cannot simply be changed later. If a database already exists,
   review its location and existing rules before deploying this rule file: this
   file denies all browser access and is intended for a backend-only database.
3. Confirm Google Sheets API is enabled. Share only the intended spreadsheet with
   the runtime service account above as **Editor**; keep general access restricted.
4. Ensure row 1 in `Leads` has the headers below. **Add J1 = `Lead ID`** to the nine
   columns already prepared. Preserve existing rows. The backend checks the exact
   headers before writing; it will never replace them automatically.
5. Create `LEADRAT_API_KEY` in Secret Manager with the value from the Promenade
   integration guide. Enter it in the private Secret Manager value field. Do not
   paste the key into GitHub, a browser script, chat, screenshots or a shell command.
6. Grant the runtime service account the access it needs: Firestore data access
   (`roles/datastore.user`), Firebase Authentication read access for revocation
   checks (`roles/firebaseauth.viewer`), and secret access
   (`roles/secretmanager.secretAccessor`) on **this secret only**. The deployment
   user needs permission to act as the runtime service account. Review the trigger
   identity/invoker permissions requested by Firebase CLI for Eventarc and
   Scheduler. Do not grant blanket Editor to the runtime account. No downloaded
   service-account JSON key is needed.
7. Install/sign in to Firebase CLI in Cloud Shell as the project owner. Confirm
   the selected project is `promenade-leads` and resolve required API/IAM setup
   before deployment. Do not substitute another project's billing or permissions.

Headers A1:J1:

```text
Date	Name	Mobile	Configuration	Project	Source	Campaign	OTP Verified	CRM Status	Lead ID
```

When all prerequisites are complete, run from the `backend` directory:

```bash
firebase deploy --only firestore:rules,functions:promenade-leads --project promenade-leads
```

The deployment creates an HTTP receiver, a Firestore event worker and a scheduled
retry job. Save the actual URL printed for **submitVerifiedLead**; there is no
deployed URL yet. Keep the event worker and retry function restricted to their
service invokers. Only the token-protected HTTP receiver is publicly invokable.

## Website integration contract (remaining work)

The published `assets/js/main.js` still contains its old placeholder submission
address. This change does **not** point it at an untested backend or activate SMS.
After successful backend deployment, replace that submission path with:

* Name/mobile entry, consent and Firebase reCAPTCHA.
* `signInWithPhoneNumber`, followed by confirmation of the customer's SMS code.
* A POST to the deployed receiver with `Authorization: Bearer <Firebase ID token>`
  and `Content-Type: application/json`.
* A UUID v4 `requestId`, generated once per enquiry using `crypto.randomUUID()` and
  retained unchanged for network retries. Reusing an ID with edited details is
  rejected. Repeated clicks must not create a fresh ID on every retry.
* A success screen and download unlock only after HTTP 202 with `ok:true` and
  `status:"received"`. OTP success alone does not submit or save an enquiry.
* Error/retry UI that retains the customer's form details. The customer must
  reverify after 30 minutes; tokens and codes must not go into browser storage or
  analytics. WhatsApp remains available as a contact method.

Request fields:

| Field | Requirement |
| --- | --- |
| `requestId` | UUID v4; stable for one enquiry and its retries |
| `name` | Letters and normal name punctuation, 2–100 characters |
| `phone` | Indian 10-digit number or `+91` prefix; must match verified token |
| `configuration` | `3 BHK`, `4 BHK`, `4 BHK - Type A`, `4 BHK - Type B`, `Both / Not sure` |
| `form_type` | `hero_enquiry`, `contact_enquiry`, `enquiry`, `costsheet`, `brochure`, `plan`, `sitevisit`, `auto` |
| `message` | Optional, maximum 1,000 characters |
| `consent` | Boolean `true`, from the user's explicit form agreement |
| `consentVersion` | `promenade-otp-2026-10-06` |
| UTM fields, `gclid`, `fbclid` | Optional, maximum 300 characters each |

Before enabling live submissions, update the privacy notice and consent wording
to explain Firebase phone processing and lead storage in CRM/Sheets. Remove the
fictional Phone Authentication test entries and `otp-test.html`, and restore the
SMS allow list to India only. The backend rejects the US fictional test number.

## Delivery reliability and operations

The Firestore record stores independent `crm` and `sheet` statuses. The same
request ID is accepted idempotently. A per-number rate limit allows at most one
new enquiry per 30 seconds and 20 per UTC day; legitimate retries of an existing
request do not consume another allowance. No names, phone numbers, API keys,
ID tokens or CRM response bodies are written to application logs.

* `crm.delivered`: documented HTTP 200 response without a recognized negative
  application flag. Confirm the real tenant's response and CRM record on the
  first controlled end-to-end test before putting the form into service.
* `crm.pending`: HTTP 429, retried with backoff.
* `crm.rejected`: request/key/configuration problem requiring correction.
* `crm.review`: ambiguous network timeout, unexpected response, server error or
  interrupted send. It might already exist in CRM. Automatic retries are stopped
  because LeadRat has not documented an idempotency mechanism for this endpoint.
* `sheet.pending`: retried with backoff. After 12 failures it becomes `review`.

To investigate, use the private Firestore `verifiedLeads` collection and the
`lead_delivery_needs_review` log event. Check LeadRat by the customer's phone and
reference before retrying an ambiguous CRM send. After confirming that no CRM
lead was created and fixing the cause, an administrator can set `crm.state` to
`pending`, reset its `attempts` to `0`, and set `nextAttemptAt` to numeric `0`.
For Sheet-only recovery, reset `sheet.state`/`sheet.attempts` similarly and leave
the confirmed CRM state unchanged. Configure log-based alerting for review/worker
failures before unattended production use.

The Sheet's `Lead ID` column lets retries locate and update an existing row instead
of blindly appending. Values are written as RAW so campaign strings are not
evaluated as formulas. Use filter views instead of sorting/editing the raw intake
rows while deliveries are in progress; do not delete/change Lead IDs. Delivery
is not an exactly-once distributed transaction across Firebase, Sheets and CRM.

Final live verification must confirm one real OTP-verified enquiry in Firestore,
exactly one corresponding LeadRat record, and exactly one Sheet row; verify a
same-ID retry does not duplicate it. Also verify wrong OTP/phone mismatch cannot
save a lead and that brochure/enquiry success waits for the backend receipt.

## Reference documentation

* https://apidocs.leadrat.com/index.php/docs/technical-documentation-for-crm-api-integration-with-websites/
* https://firebase.google.com/docs/auth/admin/verify-id-tokens
* https://firebase.google.com/docs/functions/config-env
* https://firebase.google.com/docs/functions/firestore-events
* https://firebase.google.com/docs/functions/schedule-functions
* https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
