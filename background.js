'use strict';

// Service worker — keeps storage in sync and handles tab/session lifecycle.

// When a tab is removed (closed), ensure any pending state is already in
// chrome.storage.local (popup.js writes on every meaningful change, so
// nothing special is needed — this is a safety net / future hook).
chrome.tabs.onRemoved.addListener((_tabId, _removeInfo) => {
  // Storage writes in popup.js are synchronous (storage.local.set),
  // so settings are already persisted before the tab closes.
});

// On browser startup, re-apply settings to any already-open tabs.
// (Content scripts reinject on page load; this covers pre-existing tabs.)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['sites'], (_result) => {
    // Settings will be re-applied when each page's content script runs.
  });
});

// Relay messages from popup to the active tab's content script when
// the popup can't reach it directly (e.g., MV3 service-worker context).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ ok: false, error: 'No active tab' }); return; }
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    });
    return true; // async
  }
});
