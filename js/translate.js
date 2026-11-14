/* Language menu: Google Translate website widget, limited to 32 languages.
 * Machine translation done in the visitor's browser; page text is sent to Google when a language is picked. */
(function () {
  'use strict';
  var LANGS = 'en,es,fr,de,pt,it,nl,pl,ru,uk,tr,ar,iw,fa,hi,bn,ur,ta,id,ms,vi,th,tl,sw,zh-CN,zh-TW,ja,ko,el,cs,sv,ro';
  function mount() {
    var host = document.querySelector('.topbar') || document.querySelector('.hud-top .bar');
    if (!host) return;
    var box = document.createElement('div');
    box.id = 'google_translate_element';
    box.className = 'lang-menu notranslate';
    box.title = 'Language';
    host.appendChild(box);
    window.atlasTranslateInit = function () {
      new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: LANGS,
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false,
      }, 'google_translate_element');
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
