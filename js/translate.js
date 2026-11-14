/* Language menu. The site is written in English; visitors can switch it to 31 other languages.
 * Our own <select> lists the languages in the site's current language (English by default; Google
 * translates the option names along with the page). Picking one stores Google's `googtrans` cookie
 * and reloads; the hidden Google Translate widget then machine-translates the page in the browser.
 * Choosing English clears the cookie and shows the original. Page text is sent to Google only when
 * a language other than English is chosen. */
(function () {
  'use strict';
  var LANGS = [
    ['en', 'English'], ['ar', 'Arabic'], ['bn', 'Bengali'], ['zh-CN', 'Chinese (Simplified)'],
    ['zh-TW', 'Chinese (Traditional)'], ['cs', 'Czech'], ['nl', 'Dutch'], ['tl', 'Filipino'],
    ['fr', 'French'], ['de', 'German'], ['el', 'Greek'], ['iw', 'Hebrew'], ['hi', 'Hindi'],
    ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['ms', 'Malay'],
    ['fa', 'Persian'], ['pl', 'Polish'], ['pt', 'Portuguese'], ['ro', 'Romanian'], ['ru', 'Russian'],
    ['es', 'Spanish'], ['sw', 'Swahili'], ['sv', 'Swedish'], ['ta', 'Tamil'], ['th', 'Thai'],
    ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['ur', 'Urdu'], ['vi', 'Vietnamese'],
  ];

  function current() {
    var m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]*\/([^;]+)/);
    var code = m ? decodeURIComponent(m[1]) : 'en';
    return LANGS.some(function (l) { return l[0] === code; }) ? code : 'en';
  }

  function setCookie(value, expires) {
    var host = location.hostname, parts = host.split('.');
    var domains = ['', host, '.' + host];
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    domains.forEach(function (d) {
      document.cookie = 'googtrans=' + value + '; path=/' + (d ? '; domain=' + d : '') + (expires ? '; expires=' + expires : '');
    });
  }

  function choose(code) {
    setCookie('', 'Thu, 01 Jan 1970 00:00:00 GMT');
    if (code !== 'en') document.cookie = 'googtrans=/en/' + code + '; path=/';
    location.reload();
  }

  function mount() {
    var host = document.querySelector('.topbar') || document.querySelector('.hud-top .bar');
    if (!host) return;
    var cur = current();

    var label = document.createElement('label');
    label.className = 'lang-menu';
    var sr = document.createElement('span');
    sr.className = 'lang-sr';
    sr.textContent = 'Language';
    var sel = document.createElement('select');
    sel.id = 'langSelect';
    sel.title = 'Language';
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l[0];
      o.textContent = l[1];
      if (l[0] === cur) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { choose(sel.value); });
    label.appendChild(sr);
    label.appendChild(sel);
    host.appendChild(label);

    if (cur === 'en') return; // English is the original: nothing to load, nothing sent to Google.

    var gt = document.createElement('div');
    gt.id = 'google_translate_element';
    gt.hidden = true;
    document.body.appendChild(gt);
    window.atlasTranslateInit = function () {
      new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
    };
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=atlasTranslateInit';
    s.async = true;
    document.head.appendChild(s);
    // Google shifts the page down for its banner; keep the layout (and the fixed map HUD) in place.
    var pin = function () { if (document.body.style.top && document.body.style.top !== '0px') document.body.style.setProperty('top', '0px', 'important'); };
    new MutationObserver(pin).observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
