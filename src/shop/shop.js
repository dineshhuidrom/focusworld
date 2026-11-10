/* Focus World — product page: the short "Before you go" form for products set to ask for details first.
   Same rules as the form inside the app (src/app.js). The link opens in the same tap; details are sent with it. */
(function () {
  'use strict';
  var btn = document.getElementById('getBtn'), box = document.getElementById('leadBox');
  if (!btn || !box) return;
  var ask = (btn.getAttribute('data-ask') || '').split(',');
  var has = function (f) { return ask.indexOf(f) >= 0; };
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'focusworld:v1:me';
  // A WhatsApp number as people really type it. No "+" means an Indian number: 98123 45678, 098123 45678 and
  // 91 98123 45678 all become +919812345678. Numbers from other countries start with + (or 00) and their code.
  // Returns '' when empty, null when it can't be a phone number. (Same rule as lib/leads.mjs.)
  function cleanPhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var intl = s.charAt(0) === '+' || /^00/.test(s);
    var d = s.replace(/[^0-9]/g, '');
    if (intl) { if (/^00/.test(s)) d = d.slice(2); return d.length >= 8 && d.length <= 15 ? '+' + d : null; }
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    else if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
    return /^[6-9][0-9]{9}$/.test(d) ? '+91' + d : null;
  }
  var EMAIL_OK = /^[^\s@"'<>(),;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
  var url = btn.getAttribute('href');
  function open() { window.open(url, '_blank', 'noopener'); }
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    box.hidden = false;
    var me = {};
    try { me = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (er) { me = {}; }
    ['name', 'phone', 'email'].forEach(function (f) {
      var row = $('l_' + f + 'Row'), input = $('l_' + f);
      row.hidden = !has(f);
      if (!input.value && typeof me[f] === 'string') input.value = me[f];
    });
    $('l_either').hidden = !(has('phone') && has('email'));
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    var first = box.querySelector('.lead-field:not([hidden]) input');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 250);
  });
  function bad(input, msg) { $('l_msg').textContent = msg; input.focus(); }
  $('leadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = has('name') ? $('l_name').value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    var phone = has('phone') ? cleanPhone($('l_phone').value) : '';
    var email = has('email') ? $('l_email').value.trim().toLowerCase() : '';
    if (has('name') && !name) return bad($('l_name'), 'Please add your name.');
    if (phone === null) return bad($('l_phone'), 'That number doesn\u2019t look right. Type your 10-digit number, like 98123 45678.');
    if (email && (email.length > 254 || !EMAIL_OK.test(email))) return bad($('l_email'), 'That email doesn’t look right. Check it, please.');
    if (!phone && !email) return bad(has('phone') ? $('l_phone') : $('l_email'), 'Add your WhatsApp number or email, or tap Skip.');
    if (!$('l_ok').checked) return bad($('l_ok'), 'Please tick the box, or tap Skip.');
    open();
    try {
      var keep = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      if (name) keep.name = name; if (phone) keep.phone = phone; if (email) keep.email = email;
      localStorage.setItem(KEY, JSON.stringify(keep));
    } catch (er) { /* fine: just not prefilled next time */ }
    fetch('/api/lead', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: btn.getAttribute('data-id'), title: btn.getAttribute('data-title'), name: name, phone: phone,
        email: email, ok: true, website: $('l_hp').value })
    }).catch(function () { /* offline: the link still opened */ });
    $('l_msg').textContent = '';
    $('leadForm').hidden = true;
    $('l_done').hidden = false;
  });
  $('l_skip').addEventListener('click', function () { open(); box.hidden = true; });
})();
