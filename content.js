// content.js

var trackerApi = window.TokenTracker = window.TokenTracker || {};

let debounceTimer = null;
let lastSentSelection = '';

if (typeof trackerApi.buildTokenPayload !== 'function') {
  function buildTokenPayload({ text, type, hostname }) {
    const estimatedTokens = typeof estimateTokensFromText === 'function'
      ? estimateTokensFromText(text || '')
      : Math.max(1, Math.round(String(text || '').trim().split(/\s+/).filter(Boolean).length * 1.3));

    const host = String(hostname || window.location.hostname || '').toLowerCase();
    let provider = 'other';
    if (host.includes('gemini') || host.includes('google')) provider = 'gemini';
    else if (host.includes('chatgpt') || host.includes('openai')) provider = 'openai';
    else if (host.includes('claude') || host.includes('anthropic')) provider = 'claude';

    return {
      action: 'saveTokens',
      provider,
      prompt: type === 'prompt' ? estimatedTokens : 0,
      completion: type === 'completion' ? estimatedTokens : 0
    };
  }
  trackerApi.buildTokenPayload = buildTokenPayload;
}

if (typeof trackerApi.sendTokenPayload !== 'function') {
  function sendTokenPayload(payload) {
    if (payload && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(payload);
      } catch (e) {
        if (typeof trackerApi.directStorageUpdate === 'function') trackerApi.directStorageUpdate(payload);
      }
      return;
    }
    if (typeof trackerApi.directStorageUpdate === 'function') trackerApi.directStorageUpdate(payload);
  }
  trackerApi.sendTokenPayload = sendTokenPayload;
}

function describeNode(node) {
  if (!node) return 'null';
  const element = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  if (!element) return 'no-element';
  const className = (element.className || '').toString().slice(0, 250).replace(/\s+/g, ' ');
  const id = (element.id || '').toString();
  const role = (element.getAttribute && element.getAttribute('role')) || '';
  const ariaLabel = (element.getAttribute && element.getAttribute('aria-label')) || '';
  return `tag=${element.tagName} id=${id} class=${className} role=${role} aria-label=${ariaLabel}`;
}

function getTrackingSignature(text, type) {
  return `${type || 'unknown'}:${String(text || '').trim().slice(0, 240)}`;
}

function getIncrementalTextDelta(key, nextText) {
  const previous = trackerApi.lastObservedText || {};
  const prior = previous[key] || '';
  let delta = '';

  if (!prior) {
    delta = nextText;
  } else if (nextText.startsWith(prior)) {
    delta = nextText.slice(prior.length);
  } else if (prior.startsWith(nextText)) {
    delta = '';
  } else {
    const maxLength = Math.max(prior.length, nextText.length);
    let commonPrefix = 0;
    while (commonPrefix < maxLength && prior[commonPrefix] === nextText[commonPrefix]) {
      commonPrefix += 1;
    }

    const trimmedPrior = prior.slice(commonPrefix);
    const trimmedNext = nextText.slice(commonPrefix);
    const suffixLength = Math.min(trimmedPrior.length, trimmedNext.length);
    let commonSuffix = 0;
    while (commonSuffix < suffixLength && trimmedPrior[trimmedPrior.length - 1 - commonSuffix] === trimmedNext[trimmedNext.length - 1 - commonSuffix]) {
      commonSuffix += 1;
    }

    const candidate = trimmedNext.slice(0, trimmedNext.length - commonSuffix);
    delta = candidate || nextText;
  }

  previous[key] = nextText;
  trackerApi.lastObservedText = previous;
  return delta.trim();
}

function trySendSelection() {
  try {
    const tracked = typeof trackerApi.getTrackedTextContext === 'function' ? trackerApi.getTrackedTextContext() : getTrackedTextContext();
    const selectedText = tracked && tracked.text ? tracked.text : '';
    if (!selectedText) return;

    const type = typeof trackerApi.detectSelectionType === 'function' ? trackerApi.detectSelectionType() : detectSelectionType();
    const bucketKey = `${window.location.hostname}:${type}:${String(tracked.node && tracked.node.nodeName || tracked.source || 'unknown')}`;
    const hadPreviousText = Object.prototype.hasOwnProperty.call(trackerApi.lastObservedText || {}, bucketKey);
    const incrementalText = getIncrementalTextDelta(bucketKey, selectedText);
    if (hadPreviousText && !incrementalText) return;
    const countText = incrementalText || selectedText;
    if (!countText) return;

    const estimatedTokens = typeof trackerApi.estimateTokensFromText === 'function' ? trackerApi.estimateTokensFromText(countText) : estimateTokensFromText(countText);
    const signature = getTrackingSignature(countText, type);
    if (signature === lastTrackedSignature) return;

    console.log('[TokenTracker] trySendSelection', {
      selection: countText.slice(0, 160),
      node: describeNode(tracked.node),
      estimatedTokens,
      type,
      source: tracked.source,
      bucketKey
    });

    const payload = typeof trackerApi.buildTokenPayload === 'function'
      ? trackerApi.buildTokenPayload({ text: countText, type, hostname: window.location.hostname, source: tracked.source || 'unknown' })
      : buildTokenPayload({ text: countText, type, hostname: window.location.hostname, source: tracked.source || 'unknown' });

    if (typeof trackerApi.sendTokenPayload === 'function') trackerApi.sendTokenPayload(payload); else sendTokenPayload(payload);

    console.log('[TokenTracker] token payload', { provider: payload.provider, type, estimatedTokens, payload });
    lastSentSelection = countText;
    lastTrackedSignature = signature;

    setTimeout(() => { if (lastTrackedSignature === signature) lastTrackedSignature = ''; }, 4000);
  } catch (err) {
    if (typeof trackerApi.reportError === 'function') trackerApi.reportError(err); else reportError(err);
  }
}

let lastTrackedSignature = '';
let inputDebounceTimer = null;
trackerApi.lastObservedText = trackerApi.lastObservedText || {};

function queueTrackedText() {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    try { trySendSelection(); } catch (e) { if (typeof trackerApi.reportError === 'function') trackerApi.reportError(e); else reportError(e); }
  }, 600);
}

// User gesture listeners for tracking token usage
document.addEventListener('mouseup', () => { 
  try { trySendSelection(); } catch (e) { if (typeof trackerApi.reportError === 'function') trackerApi.reportError(e); else reportError(e); } 
});

document.addEventListener('pointerup', () => { 
  try { trySendSelection(); } catch (e) { if (typeof trackerApi.reportError === 'function') trackerApi.reportError(e); else reportError(e); } 
});

document.addEventListener('mousedown', () => { 
  lastSentSelection = ''; 
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
    try { trySendSelection(); } catch (e) { if (typeof trackerApi.reportError === 'function') trackerApi.reportError(e); else reportError(e); }
  }
});

document.addEventListener('input', (event) => {
  const target = event && event.target;
  if (!target) return;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || (typeof trackerApi.isEditableField === 'function' ? trackerApi.isEditableField(target) : isEditableField(target))) {
    queueTrackedText();
  }
}, true);

document.addEventListener('beforeinput', (event) => {
  const target = event && event.target;
  if (!target) return;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || (typeof trackerApi.isEditableField === 'function' ? trackerApi.isEditableField(target) : isEditableField(target))) {
    queueTrackedText();
  }
}, true);

document.addEventListener('compositionend', () => {
  queueTrackedText();
}, true);

document.addEventListener('paste', () => {
  queueTrackedText();
}, true);

document.addEventListener('change', () => {
  try { trySendSelection(); } catch (e) { if (typeof trackerApi.reportError === 'function') trackerApi.reportError(e); else reportError(e); }
}, true);

// Capture programmatic/dynamic selections in real-time with debouncing
document.addEventListener('selectionchange', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(trySendSelection, 400);
});

const contentObserver = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(trySendSelection, 900);
});

if (document.body) {
  contentObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    contentObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  });
}
