(() => {
  'use strict';

  const STYLE_ID = 'fcp-font-styles';
  const DARK_STYLE_ID = 'fcp-dark-mode';
  const FONT_LINK_PREFIX = 'fcp-font-';

  function isValidCssSelector(selector) {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ─── Apply font rules to the page ────────────────────────────────────────
  function applyFontRules(rules) {
    removeFontStyles();
    if (!rules || rules.length === 0) return;

    let css = '';
    for (const rule of rules) {
      if (!rule.font || !rule.selector) continue;
      loadGoogleFont(rule.font);
      const selector = rule.selector === 'custom' ? (rule.customSelector || 'body') : rule.selector;
      if (!isValidCssSelector(selector)) continue;
      css += `${selector} { font-family: '${rule.font}', sans-serif !important; }\n`;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── Remove all injected font styles ─────────────────────────────────────
  function removeFontStyles() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  // ─── Load a Google Font into the page ────────────────────────────────────
  function loadGoogleFont(fontName) {
    const id = FONT_LINK_PREFIX + fontName.replace(/\s+/g, '-').toLowerCase();
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
    (document.head || document.documentElement).appendChild(link);
  }

  // ─── Force dark mode ─────────────────────────────────────────────────────
  function applyDarkMode(enabled) {
    let style = document.getElementById(DARK_STYLE_ID);
    if (!enabled) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = DARK_STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      html {
        filter: invert(1) hue-rotate(180deg) !important;
        background-color: #fff !important;
      }
      html img,
      html video,
      html canvas,
      html iframe,
      html embed,
      html picture,
      html svg image,
      html [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
  }

  // ─── Read and apply saved settings for this domain ───────────────────────
  function applySavedSettings() {
    const domain = location.hostname;
    chrome.storage.local.get(['sites'], (result) => {
      const sites = result.sites || {};
      const siteData = sites[domain];
      if (!siteData) return;
      if (siteData.rules && siteData.rules.length > 0) {
        applyFontRules(siteData.rules);
      }
      if (siteData.forceDarkMode) {
        applyDarkMode(true);
      }
    });
  }

  // ─── Message listener ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'APPLY_FONTS':
        applyFontRules(message.rules);
        sendResponse({ ok: true });
        break;
      case 'REMOVE_FONTS':
        removeFontStyles();
        sendResponse({ ok: true });
        break;
      case 'APPLY_DARK_MODE':
        applyDarkMode(message.enabled);
        sendResponse({ ok: true });
        break;
      case 'PREVIEW_FONTS':
        // Same as apply but tagged as preview — caller decides whether to persist
        applyFontRules(message.rules);
        sendResponse({ ok: true });
        break;
      case 'PING':
        sendResponse({ ok: true });
        break;
    }
    return true; // keep channel open for async
  });

  // Apply on load (document_start fires before DOM is fully built,
  // so we also listen for DOMContentLoaded for reliability)
  applySavedSettings();
  document.addEventListener('DOMContentLoaded', applySavedSettings, { once: true });
})();
