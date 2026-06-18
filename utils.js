// utils.js
let lastSentSelection = '';
let debounceTimer = null;

function canUseChromeRuntime() {
  try {
    return (typeof chrome !== 'undefined') && 
           !!chrome.runtime && 
           !!chrome.runtime.id && 
           typeof chrome.runtime.sendMessage === 'function';
  } catch (e) {
    return false;
  }
}

function estimateTokensFromText(text) {
  const wordsCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordsCount * 1.3));
}

function directStorageUpdate(payload) {
  try {
    chrome.storage.local.get({ promptTokens: 0, completionTokens: 0 }, (data) => {
      const newPrompt = (data.promptTokens || 0) + (payload.prompt || 0);
      const newCompletion = (data.completionTokens || 0) + (payload.completion || 0);
      try {
        chrome.storage.local.set({ promptTokens: newPrompt, completionTokens: newCompletion });
      } catch (e) {
        console.warn('directStorageUpdate: storage.set failed', e);
      }
    });
  } catch (e) {
    console.warn('directStorageUpdate: storage.local integration failed', e);
  }
}

function reportError(err) {
  try {
    const message = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : null;
    console.error('Content script caught error:', message, stack);
    if (canUseChromeRuntime()) {
      try { chrome.runtime.sendMessage({ action: 'reportError', message, stack }); } catch (e) {}
    }
  } catch (e) { console.error('Failed to report error', e); }
}

// Застраховка срещу глобални грешки на страницата
window.addEventListener('error', (ev) => {
  if (!canUseChromeRuntime()) return;
  try {
    const msg = ev && ev.message ? ev.message : String(ev);
    const stack = ev && ev.error && ev.error.stack ? ev.error.stack : null;
    chrome.runtime.sendMessage({ action: 'reportError', message: msg, stack });
  } catch (e) {}
});

window.addEventListener('unhandledrejection', (ev) => {
  if (!canUseChromeRuntime()) return;
  try {
    const reason = ev && ev.reason ? (ev.reason.stack || ev.reason.message || String(ev.reason)) : 'unknown';
    chrome.runtime.sendMessage({ action: 'reportError', message: 'unhandledrejection', stack: String(reason) });
  } catch (e) {}
});