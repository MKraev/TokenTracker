// dom-analyzer.js

function getDeepActiveElement(doc = document) {
  try {
    let active = doc.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  } catch (e) { return doc.activeElement || null; }
}

function getSelectedText() {
  try {
    const sel = window.getSelection && window.getSelection();
    const text = sel && sel.toString && sel.toString().trim();
    if (text) return { text, node: sel.anchorNode };

    const active = getDeepActiveElement();
    if (active) {
      if (active.isContentEditable) {
        return { text: (active.innerText || active.textContent || '').trim(), node: active };
      }
      if (typeof active.value === 'string' && active.value.trim()) {
        return { text: active.value.trim(), node: active };
      }
      if (typeof active.getValue === 'function') {
        const v = active.getValue();
        if (v && String(v).trim()) return { text: String(v).trim(), node: active };
      }
    }
    return { text: '', node: null };
  } catch (e) { return { text: '', node: null }; }
}

function getElementContextInfo(el) {
  if (!el) return { tag: '', className: '', id: '', ariaLabel: '', role: '', placeholder: '' };

  return {
    tag: (el.tagName || '').toUpperCase(),
    className: (el.className || '').toString().toLowerCase(),
    id: (el.id || '').toString().toLowerCase(),
    ariaLabel: (el.getAttribute && el.getAttribute('aria-label') || '').toString().toLowerCase(),
    role: (el.getAttribute && el.getAttribute('role') || '').toString().toLowerCase(),
    placeholder: (el.getAttribute && el.getAttribute('placeholder') || '').toString().toLowerCase(),
  };
}

function hasContextKeywords(node, keywords) {
  if (!node) return false;

  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  while (current && current !== document.body) {
    const info = getElementContextInfo(current);
    const haystack = [info.tag, info.className, info.id, info.ariaLabel, info.role, info.placeholder].join(' ');

    if (keywords.some(keyword => haystack.includes(keyword))) {
      return true;
    }

    current = current.parentElement;
  }
  return false;
}

function isPromptLikeElement(node) {
  if (!node) return false;

  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  while (current && current !== document.body) {
    const info = getElementContextInfo(current);
    const haystack = [info.tag, info.className, info.id, info.ariaLabel, info.role, info.placeholder].join(' ');
    const promptKeywords = ['input', 'compose', 'composer', 'editor', 'chat-input', 'textbox', 'prompt', 'question', 'query', 'user'];
    const completionKeywords = ['assistant', 'bot', 'response', 'answer', 'completion', 'output', 'model', 'reply', 'bubble'];

    if (info.tag === 'TEXTAREA' || info.tag === 'INPUT' || current.isContentEditable || current.contentEditable === 'true') {
      return true;
    }

    if (completionKeywords.some(keyword => haystack.includes(keyword))) {
      return false;
    }

    if (promptKeywords.some(keyword => haystack.includes(keyword))) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isCompletionLikeElement(node) {
  if (!node) return false;

  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  while (current && current !== document.body) {
    const info = getElementContextInfo(current);
    const haystack = [info.tag, info.className, info.id, info.ariaLabel, info.role, info.placeholder].join(' ');
    const completionKeywords = ['assistant', 'bot', 'response', 'answer', 'completion', 'output', 'model', 'reply', 'bubble', 'message', 'result'];
    const promptKeywords = ['input', 'compose', 'composer', 'editor', 'chat-input', 'textbox', 'prompt', 'question', 'query', 'user'];

    if (promptKeywords.some(keyword => haystack.includes(keyword))) {
      return false;
    }

    if (completionKeywords.some(keyword => haystack.includes(keyword))) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function detectSelectionType() {
  const selInfo = getSelectedText();
  if (!selInfo || !selInfo.text) return null;

  const sourceNode = selInfo.node || getDeepActiveElement();

  if (isPromptLikeElement(sourceNode)) return 'prompt';
  if (isCompletionLikeElement(sourceNode)) return 'completion';

  const active = getDeepActiveElement();
  if (active && (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    return 'prompt';
  }

  return 'completion';
}