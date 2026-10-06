/* The Promenade Residences – lead capture + UI
   ================================================================
   1) Paste your Google Apps Script Web-App URL below (see README).
   2) Optional: put a cost sheet PDF in assets/docs/ and set COST_SHEET_URL.
   ================================================================ */
var CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwx3dF2gEiEy0ECjsHQYgVHlLG3MZJIJr8uNDPI5wx0B4ad1zJwTSON1TKBoEjJE-YybA/exec',
  BROCHURE_URL: 'assets/docs/Promenade-Residences-Brochure.pdf',
  COST_SHEET_URL: '',            // e.g. 'assets/docs/Promenade-Cost-Sheet.pdf' – leave '' to share on WhatsApp instead
  PHONE: '919309707070',
  AUTO_POPUP_SECONDS: 25,        // set 0 to disable the timed popup
  PROJECT: 'The Promenade Residences - Blue Ridge'
};

(function () {
  'use strict';

  /* ---------- safe storage helpers ---------- */
  function sget(k, store) { try { return (store || localStorage).getItem(k); } catch (e) { return null; } }
  function sset(k, v, store) { try { (store || localStorage).setItem(k, v); } catch (e) {} }
  function track(ev, extra) {
    window.dataLayer = window.dataLayer || [];
    var o = { event: ev }; for (var k in extra) o[k] = extra[k];
    window.dataLayer.push(o);
  }

  /* ---------- capture UTM / ad click ids once per session ---------- */
  var params = new URLSearchParams(location.search);
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
  UTM_KEYS.forEach(function (k) { if (params.get(k)) sset(k, params.get(k), sessionStorage); });
  if (!sget('landing_ref', sessionStorage)) sset('landing_ref', document.referrer || 'direct', sessionStorage);

  /* ---------- header + menu ---------- */
  var header = document.querySelector('.header');
  var onScroll = function () { header.classList.toggle('is-solid', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var burger = document.querySelector('.burger'), nav = document.getElementById('nav');
  burger.addEventListener('click', function () {
    var open = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', open);
  });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });

  document.getElementById('yr').textContent = new Date().getFullYear();

  /* ---------- click tracking for WhatsApp ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-track]'); if (t) track('contact_click', { method: t.getAttribute('data-track') });
  });

  /* ---------- floor-plan tabs ---------- */
  var tabs = document.querySelectorAll('.tabs [data-tab]');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); document.getElementById(x.dataset.tab).hidden = true; });
      b.setAttribute('aria-selected', 'true'); document.getElementById(b.dataset.tab).hidden = false;
    });
  });

  /* ---------- lightbox ---------- */
  var lb = document.getElementById('lightbox'), lbImg = lb.querySelector('img');
  function openLightbox(src, alt) { lbImg.src = src; lbImg.alt = alt || ''; lb.hidden = false; document.body.classList.add('no-scroll'); }
  function closeLightbox() { lb.hidden = true; lbImg.src = ''; if (modal.hidden) document.body.classList.remove('no-scroll'); }
  document.querySelectorAll('[data-zoom]').forEach(function (b) {
    b.addEventListener('click', function () { var i = b.querySelector('img'); openLightbox(b.dataset.zoom, i && i.alt); });
  });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target.hasAttribute('data-close')) closeLightbox(); });

  /* ---------- downloads ---------- */
  function download(url, name) {
    var a = document.createElement('a'); a.href = url; a.download = name || ''; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function waLink(text) { return 'https://wa.me/' + CONFIG.PHONE + '?text=' + encodeURIComponent(text); }

  /* ---------- modal variants ---------- */
  var VARIANTS = {
    enquiry:   { kicker: 'Project enquiry', title: 'Send an enquiry', sub: 'Share your details and our property expert will respond on WhatsApp.', btn: 'Send Enquiry' },
    costsheet: { kicker: 'Latest price list', title: 'Download cost sheet', sub: 'Get the complete price break-up, payment plan and current offers.', btn: 'Get Cost Sheet' },
    brochure:  { kicker: 'E-brochure', title: 'Download brochure', sub: 'Floor plans, amenities, specifications and location – all in one PDF.', btn: 'Download Brochure' },
    plan:      { kicker: 'Floor plans', title: 'Unlock detailed floor plan', sub: 'View the dimensioned 2D plan with room sizes and areas.', btn: 'View Floor Plan' },
    sitevisit: { kicker: 'Site visit', title: 'Book a site visit', sub: 'Pick-up & drop available. Our team will confirm a slot that suits you.', btn: 'Book Site Visit' },
    auto:      { kicker: 'Limited inventory', title: 'Get the best price before launch', sub: 'Register now for priority allotment and exclusive pre-launch offers.', btn: 'Register Interest' }
  };

  var modal = document.getElementById('leadModal');
  var mForm = modal.querySelector('form'), mDone = modal.querySelector('.modal__done');
  var current = { type: 'enquiry', config: '', plan: '' };
  var lastFocus = null;

  function openModal(type, opts) {
    opts = opts || {};
    current = { type: type, config: opts.config || '', plan: opts.plan || '' };
    var v = VARIANTS[type] || VARIANTS.enquiry;

    document.getElementById('mKicker').textContent = v.kicker;
    document.getElementById('mTitle').textContent = v.title;
    document.getElementById('mSub').textContent = v.sub;
    document.getElementById('mBtn').textContent = v.btn;
    if (current.config) { var sel = mForm.querySelector('select'); for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text === current.config) sel.selectedIndex = i; }

    mForm.hidden = false; mDone.hidden = true; mForm.querySelector('.form__msg').textContent = '';
    lastFocus = document.activeElement;
    modal.hidden = false; document.body.classList.add('no-scroll');
    sset('pr_popup_seen', '1', sessionStorage);
    setTimeout(function () { var f = mForm.hidden ? modal.querySelector('.modal__x') : mForm.querySelector('input[name=name]'); f && f.focus(); }, 50);
    track('lead_modal_open', { form_type: type });
  }
  function closeModal() {
    modal.hidden = true; document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll('[data-open]').forEach(function (b) {
    b.addEventListener('click', function () { openModal(b.dataset.open, { config: b.dataset.config, plan: b.dataset.plan }); });
  });
  modal.addEventListener('click', function (e) { if (e.target === modal || e.target.hasAttribute('data-close')) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!lb.hidden) closeLightbox(); else if (!modal.hidden) closeModal(); }
  });

  /* ---------- what happens after a successful submit ---------- */
  function fulfil(type, lead) {
    var title = 'Thank you, ' + (lead.name || '').split(' ')[0] + '!';
    var text = 'Our relationship manager will respond on WhatsApp at +91 ' + lead.phone + '.';
    var actions = '';
    if (type === 'brochure') {
      download(CONFIG.BROCHURE_URL, 'Promenade-Residences-Brochure.pdf');
      text = 'Your brochure download has started. Our expert will respond on WhatsApp to answer any questions.';
      actions = '<a class="btn btn--navy" href="' + CONFIG.BROCHURE_URL + '" download>Download again</a>';
    } else if (type === 'costsheet') {
      if (CONFIG.COST_SHEET_URL) {
        download(CONFIG.COST_SHEET_URL, 'Promenade-Residences-Cost-Sheet.pdf');
        text = 'Your cost sheet download has started.';
        actions = '<a class="btn btn--navy" href="' + CONFIG.COST_SHEET_URL + '" download>Download again</a>';
      } else {
        text = 'The latest cost sheet will be sent to you on WhatsApp shortly. Want it right now? Tap below.';
        actions = '<a class="btn btn--gold" target="_blank" rel="noopener" href="' + waLink('Hi, I am ' + lead.name + '. Please share the cost sheet for ' + (lead.configuration || '') + ' at The Promenade Residences, Blue Ridge.') + '">Get cost sheet on WhatsApp</a>';
      }
    } else if (type === 'plan') {
      if (current.plan) { closeModal(); openLightbox(current.plan, (current.config || '') + ' floor plan'); return; }
    } else if (type === 'sitevisit') {
      text = 'Your site visit request is received. We will message you on WhatsApp to confirm the date and time.';
    }
    if (!actions) actions = '<a class="btn btn--gold" target="_blank" rel="noopener" href="' + waLink('Hi, I just enquired about The Promenade Residences, Blue Ridge.') + '">Chat on WhatsApp now</a>';

    document.getElementById('dTitle').textContent = title;
    document.getElementById('dText').textContent = text;
    document.getElementById('dActions').innerHTML = actions;
    mForm.hidden = true; mDone.hidden = false;
    if (modal.hidden) { modal.hidden = false; document.body.classList.add('no-scroll'); }
  }

  /* ---------- send to Google Sheet ---------- */
  function submitLead(data) {
    var payload = {
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      name: data.name || '', phone: data.phone || '',
      configuration: data.configuration || '', form_type: data.form_type || '',
      message: data.message || '', project: CONFIG.PROJECT,
      page_url: location.href, referrer: sget('landing_ref', sessionStorage) || '',
      device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
    };
    UTM_KEYS.forEach(function (k) { payload[k] = sget(k, sessionStorage) || ''; });

    if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.indexOf('PASTE_') === 0) {
      return Promise.reject(new Error('Lead service unavailable'));
    }
    var body = new URLSearchParams(payload);
   return fetch(CONFIG.SCRIPT_URL, {
  method: 'POST',
  mode: 'no-cors',
  body: body,
  keepalive: true
});
  }

  function el(form, n) { return form.elements.namedItem(n); }

  function cleanPhone(v) {
    v = (v || '').replace(/\D/g, '');
    if (v.length === 12 && v.indexOf('91') === 0) v = v.slice(2);
    if (v.length === 11 && v.charAt(0) === '0') v = v.slice(1);
    return v;
  }

  document.querySelectorAll('.lead-form').forEach(function (form) {
    var phoneInput = form.querySelector('input[name=phone]');
    var nameInput = form.querySelector('input[name=name]');
    // Name: letters, spaces, dot, apostrophe, hyphen only – numbers/symbols are removed as typed or pasted
    nameInput.addEventListener('input', function () {
      var v = nameInput.value.replace(/[^A-Za-z .'\-]/g, '').replace(/\s{2,}/g, ' ');
      if (v !== nameInput.value) nameInput.value = v;
    });
    nameInput.addEventListener('keypress', function (e) { if (/[0-9]/.test(e.key)) e.preventDefault(); });
    phoneInput.addEventListener('input', function () { phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form__msg'); msg.className = 'form__msg'; msg.textContent = '';
      form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('is-err'); });

      if (el(form,'website') && el(form,'website').value) return; // honeypot – bot

      var name = el(form,'name').value.trim();
      var phone = cleanPhone(phoneInput.value);
      if (name.length < 2 || !/^[A-Za-z][A-Za-z .'\-]*$/.test(name)) {
        el(form,'name').closest('.field').classList.add('is-err'); msg.textContent = 'Please enter your name using letters only.'; el(form,'name').focus(); return;
      }
      if (!/^[6-9]\d{9}$/.test(phone)) {
        phoneInput.closest('.field').classList.add('is-err'); msg.textContent = 'Please enter a valid 10-digit mobile number.'; phoneInput.focus(); return;
      }

      var isModal = form.dataset.form === 'modal';
      var type = isModal ? current.type : form.dataset.form;
      var lead = {
        name: name, phone: phone,
        configuration: el(form,'configuration') ? el(form,'configuration').value : '',
        message: el(form,'message') ? el(form,'message').value.trim() : '',
        form_type: type
      };

      var btn = form.querySelector('button[type=submit]'), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Submitting…';

      submitLead(lead).then(function () {
        sset('pr_lead_confirmed', JSON.stringify({ name: name, phone: phone, configuration: lead.configuration }));
        sset('pr_popup_seen', '1', sessionStorage);
        track('lead_submit', { form_type: type, configuration: lead.configuration });
        btn.disabled = false; btn.textContent = label;

        if (isModal) { fulfil(type, lead); }
        else {
          form.reset();
          msg.className = 'form__msg ok';
          msg.textContent = 'Thank you, ' + name.split(' ')[0] + '! Our expert will respond on WhatsApp.';
        }
      }).catch(function () {
        btn.disabled = false; btn.textContent = label;
        msg.className = 'form__msg';
        msg.textContent = 'Your enquiry could not be saved. Please send it to us on WhatsApp. ';
        var link = document.createElement('a');
        var message = 'Hi, I am ' + lead.name + '. I am interested in ' + (lead.configuration || 'a home') +
          ' at The Promenade Residences, Blue Ridge. My WhatsApp number is +91 ' + lead.phone + '.' +
          ' Enquiry: ' + lead.form_type + '.' + (lead.message ? ' ' + lead.message : '');
        link.href = waLink(message);
        link.target = '_blank'; link.rel = 'noopener';
        link.textContent = 'Continue on WhatsApp';
        link.setAttribute('data-track', 'whatsapp_form_fallback');
        msg.appendChild(link);
      });
    });
  });

  /* ---------- timed popup (once per session, not for converted users) ---------- */
  if (CONFIG.AUTO_POPUP_SECONDS > 0) {
    setTimeout(function () {
      if (sget('pr_popup_seen', sessionStorage) || sget('pr_lead_confirmed') || !modal.hidden || !lb.hidden) return;
      openModal('auto');
    }, CONFIG.AUTO_POPUP_SECONDS * 1000);
  }

  /* ---------- reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    var els = document.querySelectorAll('.head, .split > *, .price, .plan, .feat, .amen, .gallery .zoom, .loc > *, .acc details, .golf__box');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }
})();
