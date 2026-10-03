# The Promenade Residences – Lead-generation landing page
Domain: **https://promenadeblueridge.com** · Hosting: **GitHub Pages** (free) · Leads: **Google Sheets**

## What's inside
| File / folder | Purpose |
|---|---|
| `index.html` | The landing page |
| `assets/css/style.css`, `assets/js/main.js` | Styles and form/lead logic |
| `assets/img/` | Brochure images, compressed to WebP (~2 MB total, lazy-loaded) |
| `assets/docs/Promenade-Residences-Brochure.pdf` | Lighter brochure for download (3.4 MB instead of 23 MB) |
| `google-sheet/Code.gs` | Google Apps Script that saves every lead into your Google Sheet |
| `sitemap.xml`, `robots.txt` | For SEO / Google Search Console |
| `CNAME` | Connects GitHub Pages to promenadeblueridge.com |
| `.nojekyll`, `404.html`, `privacy-policy.html`, `favicon.svg` | Hosting extras (you need the privacy page for Google/Meta ads) |

---
## STEP 1 – Connect the forms to Google Sheets (10 min)
1. Open https://sheets.google.com, create a blank sheet and name it **Promenade Leads**.
2. Click **Extensions → Apps Script**. Delete the sample code, paste in all of `google-sheet/Code.gs` and click **Save**.
   - Optional: to get an email for every new lead, set `NOTIFY_EMAIL = 'you@example.com'`.
3. Choose **setup** in the function dropdown and click **▶ Run**. Approve the permissions (Advanced → Go to project → Allow).
   A **Leads** tab with headers now appears in the sheet.
4. Click **Deploy → New deployment →** ⚙ **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Open `assets/js/main.js` and paste the URL on line 7:
   `SCRIPT_URL: 'https://script.google.com/macros/s/XXXX/exec',`
6. Test: open the `/exec` URL in a browser. It should show `{"result":"ok"...}`. Then submit any form on the site; a new row appears in the sheet within a few seconds.

> If you change Code.gs later, use **Deploy → Manage deployments → ✏ Edit → Version: New version** so the URL stays the same.

Every lead records: Timestamp, Name, Phone, Configuration, Form Type (callback / costsheet / brochure / plan / sitevisit / auto popup / hero / contact), Message, Page URL, Referrer, Device, UTM source/medium/campaign/term/content, GCLID and FBCLID. It also adds a **Lead Status** dropdown (New → Contacted → Site Visit → Booked…) and a **Remarks** column for your sales team.

## STEP 2 – Cost sheet (optional)
- **No PDF yet (default):** after the form, the visitor gets a "Get cost sheet on WhatsApp" button that opens a pre-filled chat to 9309707070. You then send the price list yourself.
- **With a PDF:** add it as `assets/docs/Promenade-Cost-Sheet.pdf` and set `COST_SHEET_URL: 'assets/docs/Promenade-Cost-Sheet.pdf'` in `main.js`. The download then starts automatically after the form.

## STEP 3 – Upload to GitHub
1. Create a free account at https://github.com and click **New repository** → name it `promenadeblueridge` → **Public** → Create.
2. Click **uploading an existing file**, drag in **everything inside this folder** (including `.nojekyll` and `CNAME`; on a Mac press Cmd+Shift+. to show hidden files) → **Commit changes**.
3. Go to **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main** / **root** → Save.
4. In **Settings → Pages → Custom domain**, enter `promenadeblueridge.com` → Save. After DNS works (Step 4), tick **Enforce HTTPS**.

## STEP 4 – Point the domain (at your domain registrar: GoDaddy / Hostinger / etc.)
Delete any existing A/parking records for `@`, then add:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `YOUR-GITHUB-USERNAME.github.io` |

DNS usually updates in 15 minutes to a few hours. HTTPS is issued automatically by GitHub.

## STEP 5 – SEO and ads
- **Google Search Console** → add property `promenadeblueridge.com` → verify via DNS TXT → **Sitemaps** → submit `sitemap.xml`.
- **Google Ads / GA4 / Meta Pixel:** paste the tag in `index.html` where marked `GOOGLE ANALYTICS / GOOGLE ADS`. Each successful form submission pushes `{event:'lead_submit', form_type, configuration}` to `dataLayer`. Clicks on call/WhatsApp push `{event:'contact_click', method}`. Use these as conversions.
- Use UTM links in ads, e.g. `https://promenadeblueridge.com/?utm_source=google&utm_medium=cpc&utm_campaign=promenade_3bhk`. They are saved with every lead.

## ⚠ Before going live
- Agent MahaRERA No. A031262401696 is shown in the footer. If you also want to show the project's MahaRERA number and QR code, add them next to it in `index.html` (search for `class="rera"`).
- Confirm that the developer or authorised channel partner allows you to use the project name, brochure images and logo. Add your firm's name to the footer disclaimer if you are a channel partner.
- Prices aren't in the brochure, so the page shows "Price on request". Edit the `.price__val` lines in `index.html` if you want to show starting prices.

## Settings in `assets/js/main.js`
`AUTO_POPUP_SECONDS` sets when the timed enquiry popup appears (default 25 s, `0` turns it off). It shows once per visit and never to someone who has already submitted. `PHONE` is the WhatsApp/call number.
