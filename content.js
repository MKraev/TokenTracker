// content.js

const trackerApi = window.TokenTracker = window.TokenTracker || {};

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

function trySendSelection() {
  try {
    const tracked = typeof trackerApi.getTrackedTextContext === 'function' ? trackerApi.getTrackedTextContext() : getTrackedTextContext();
    const selectedText = tracked && tracked.text ? tracked.text : '';
    if (!selectedText) return;

    const estimatedTokens = typeof trackerApi.estimateTokensFromText === 'function' ? trackerApi.estimateTokensFromText(selectedText) : estimateTokensFromText(selectedText);
    const type = typeof trackerApi.detectSelectionType === 'function' ? trackerApi.detectSelectionType() : detectSelectionType();
    const signature = getTrackingSignature(selectedText, type);
    if (signature === lastTrackedSignature) return;

    console.log('[TokenTracker] trySendSelection', {
      selection: selectedText.slice(0, 160),
      node: describeNode(tracked.node),
      estimatedTokens,
      type,
      source: tracked.source
    });
    
    const payload = typeof trackerApi.buildTokenPayload === 'function' ? trackerApi.buildTokenPayload({ text: selectedText, type, hostname: window.location.hostname }) : buildTokenPayload({ text: selectedText, type, hostname: window.location.hostname });
    if (typeof trackerApi.sendTokenPayload === 'function') trackerApi.sendTokenPayload(payload); else sendTokenPayload(payload);
    
    console.log('[TokenTracker] token payload', { provider: payload.provider, type, estimatedTokens, payload });
    lastSentSelection = selectedText;
    lastTrackedSignature = signature;
    
    setTimeout(() => { if (lastTrackedSignature === signature) lastTrackedSignature = ''; }, 4000);
  } catch (err) {
    if (typeof trackerApi.reportError === 'function') trackerApi.reportError(err); else reportError(err);
  }
}

let lastTrackedSignature = '';
let inputDebounceTimer = null;

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
