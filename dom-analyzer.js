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

function matchContainerSelectors(node, keywords) {
  if (!node) return false;
  let current = node.nodeType !== Node.ELEMENT_NODE ? node.parentElement : node;
  
  while (current && current !== document.body) {
    if (current.tagName === 'INPUT' || current.tagName === 'TEXTAREA' || current.contentEditable === 'true') {
      if (keywords.includes('input')) return true;
    }
    
    const className = (current.className || '').toString().toLowerCase();
    const id = (current.id || '').toString().toLowerCase();
    
    const matches = keywords.some(kw => className.includes(kw) || id.includes(kw));
    if (matches) return true;
    
    current = current.parentElement;
  }
  return false;
}

function detectSelectionType() {
  const selInfo = getSelectedText();
  if (!selInfo || !selInfo.text) return null;

  // Оптимизирано търсене на Промпт контейнери
  if (matchContainerSelectors(selInfo.node, ['input', 'compose', 'editor', 'chat-input'])) return 'prompt';
  
  // Оптимизирано търсене на Изходни контейнери (поддържа бележници и клетки)
  if (matchContainerSelectors(selInfo.node, ['message', 'response', 'assistant', 'bot', 'bubble', 'notebook', 'cell', 'lm', 'output'])) return 'completion';

  // Хеуристичен фолбек въз основа на фокуса
  const active = getDeepActiveElement();
  if (active && (active.isContentEditable || matchContainerSelectors(active, ['input', 'compose', 'editor', 'chat-input']))) {
    return 'prompt';
  }

  return 'prompt';
}