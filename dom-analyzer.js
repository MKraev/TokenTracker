// dom-analyzer.js

var trackerApi = window.TokenTracker = window.TokenTracker || {};

function getDeepActiveElement(doc = document) {
  try {
    let active = doc.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  } catch (e) { return doc.activeElement || null; }
}

function isEditableField(node) {
  if (!node) return false;
  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  while (current) {
    const tag = current.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (current.isContentEditable) return true;
    const role = (current.getAttribute && (current.getAttribute('role') || '')).toString().toLowerCase();
    if (['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(role)) return true;
    current = current.parentElement;
  }
  return false;
}

function getEditableContainer(node) {
  if (!node) return null;
  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  while (current) {
    const tag = current.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return current;
    if (current.isContentEditable) return current;
    const role = (current.getAttribute && (current.getAttribute('role') || '')).toString().toLowerCase();
    if (['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(role)) return current;
    current = current.parentElement;
  }
  return null;
}

function getSelectedText() {
  try {
    const sel = window.getSelection && window.getSelection();
    const text = sel && sel.toString && sel.toString().trim();
    if (text) return { text, node: sel.anchorNode };
    return { text: '', node: null };
  } catch (e) { return { text: '', node: null }; }
}

function getElementTextContent(node) {
  try {
    if (!node) return '';
    const editable = getEditableContainer(node);
    if (editable) {
      if (editable.tagName === 'INPUT' || editable.tagName === 'TEXTAREA') return (editable.value || '').trim();
      if (editable.isContentEditable) return (editable.textContent || editable.innerText || '').trim();
    }
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').trim();
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches && node.matches('input, textarea')) return (node.value || '').trim();
      if (node.isContentEditable) return (node.textContent || node.innerText || '').trim();
      if (node.tagName === 'TEXTAREA') return (node.value || '').trim();
    }
    return '';
  } catch (e) {
    return '';
  }
}

function collectEditableCandidates(root = document) {
  try {
    if (!root || !root.querySelectorAll) return [];
    const selectors = [
      'textarea',
      'input',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[aria-multiline="true"]'
    ];
    const nodes = [];
    selectors.forEach((selector) => {
      try {
        root.querySelectorAll(selector).forEach((node) => nodes.push(node));
      } catch (e) {}
    });
    return nodes;
  } catch (e) {
    return [];
  }
}

function getTrackedTextContext() {
  const selInfo = getSelectedText();
  if (selInfo && selInfo.text) return { text: selInfo.text, node: selInfo.node, source: 'selection' };

  const active = getDeepActiveElement();
  const activeText = getElementTextContent(active);
  if (activeText) return { text: activeText, node: active, source: 'active-element' };

  const candidates = collectEditableCandidates(document);
  const fallbackNode = candidates.find((candidate) => getElementTextContent(candidate));
  const fallbackText = fallbackNode ? getElementTextContent(fallbackNode) : '';
  if (fallbackText) return { text: fallbackText, node: fallbackNode, source: 'candidate-element' };

  return { text: '', node: null, source: 'none' };
}

function matchContainerSelectors(node, keywords) {
  if (!node) return false;
  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  
  while (current && current !== document.body) {
    if (current.tagName === 'INPUT' || current.tagName === 'TEXTAREA' || current.contentEditable === 'true') {
      if (keywords.includes('input')) return true;
    }
    
    const className = (current.className || '').toString().toLowerCase();
    const id = (current.id || '').toString().toLowerCase();
    const role = (current.getAttribute && (current.getAttribute('role') || '')).toString().toLowerCase();
    const ariaLabel = (current.getAttribute && (current.getAttribute('aria-label') || '')).toString().toLowerCase();
    const dataAttrs = Array.from(current.attributes || [])
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name.toLowerCase()} ${attr.value.toString().toLowerCase()}`)
      .join(' ');

    const matches = keywords.some(kw =>
      className.includes(kw) ||
      id.includes(kw) ||
      role.includes(kw) ||
      ariaLabel.includes(kw) ||
      dataAttrs.includes(kw)
    );
    if (matches) return true;
    
    current = current.parentElement;
  }
  return false;
}

function findMatchDetails(node, keywords) {
  if (!node) return null;
  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;

  while (current && current !== document.body) {
    const className = (current.className || '').toString().toLowerCase();
    const id = (current.id || '').toString().toLowerCase();
    const role = (current.getAttribute && (current.getAttribute('role') || '')).toString().toLowerCase();
    const ariaLabel = (current.getAttribute && (current.getAttribute('aria-label') || '')).toString().toLowerCase();
    const dataAttrs = Array.from(current.attributes || [])
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name.toLowerCase()} ${attr.value.toString().toLowerCase()}`)
      .join(' ');

    for (const kw of keywords) {
      if (className.includes(kw) || id.includes(kw) || role.includes(kw) || ariaLabel.includes(kw) || dataAttrs.includes(kw)) {
        return { matchedKeyword: kw, tag: current.tagName, id: current.id, className: current.className, role: role, ariaLabel: ariaLabel };
      }
    }
    current = current.parentElement;
  }
  return null;
}

function detectSelectionType() {
  const tracked = getTrackedTextContext();
  if (!tracked || !tracked.text) return null;

  const promptKeywords = ['input', 'textarea', 'compose', 'editor', 'chat-input', 'textbox', 'prompt', 'message-input', 'input-container', 'text-area', 'chat-textarea', 'prompt-textarea'];
  const completionKeywords = ['message', 'response', 'assistant', 'bot', 'bubble', 'notebook', 'cell', 'lm', 'output', 'chat-line', 'markdown', 'result', 'assistant-response', 'bot-response', 'response-text', 'text-base', 'prose', 'group', 'message-inner', 'assistant-message', 'chat-message', 'api-response', 'conversation', 'result-container', 'assistant-message-wrapper', 'markdown prose', 'whitespace-pre-wrap', 'overflow-hidden', 'text-sm', 'notranslate'];

  const targetNode = tracked.node;
  const selectionIsCompletion = targetNode && matchContainerSelectors(targetNode, completionKeywords);
  const selectionIsPrompt = targetNode && matchContainerSelectors(targetNode, promptKeywords);
  const completionMatch = selectionIsCompletion ? findMatchDetails(targetNode, completionKeywords) : null;
  const promptMatch = selectionIsPrompt ? findMatchDetails(targetNode, promptKeywords) : null;

  const active = getDeepActiveElement();
  const activeIsPrompt = active && isEditableField(active);
  const activeIsCompletion = active && matchContainerSelectors(active, completionKeywords);
  const activeMatch = active ? findMatchDetails(active, completionKeywords) || findMatchDetails(active, promptKeywords) : null;

  console.log('[TokenTracker] detectSelectionType', {
    text: tracked.text.slice(0, 160),
    source: tracked.source,
    selectionIsCompletion,
    selectionIsPrompt,
    completionMatch,
    promptMatch,
    activeIsPrompt,
    activeIsCompletion,
    activeMatch,
    activeTag: active && active.tagName
  });

  if (selectionIsCompletion) return 'completion';
  if (selectionIsPrompt) return 'prompt';
  if (activeIsPrompt) return 'prompt';
  if (activeIsCompletion) return 'completion';
  return 'completion';
}

trackerApi.getDeepActiveElement = getDeepActiveElement;
trackerApi.isEditableField = isEditableField;
trackerApi.getSelectedText = getSelectedText;
trackerApi.getTrackedTextContext = getTrackedTextContext;
trackerApi.detectSelectionType = detectSelectionType;