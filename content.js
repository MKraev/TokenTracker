// content.js

function trySendSelection() {
  try {
    const sel = getSelectedText(); // Comes from dom-analyzer.js
    const selectedText = sel && sel.text ? sel.text : '';
    if (!selectedText || selectedText === lastSentSelection) return;

    const estimatedTokens = estimateTokensFromText(selectedText); // Comes from utils.js
    const type = detectSelectionType(); // Comes from dom-analyzer.js
    
    // Auto-detect provider based on active tab hostname
    const hostname = window.location.hostname;
    let provider = 'other';
    if (hostname.includes('gemini') || hostname.includes('google')) provider = 'gemini';
    else if (hostname.includes('chatgpt') || hostname.includes('openai')) provider = 'openai';
    else if (hostname.includes('claude') || hostname.includes('anthropic')) provider = 'claude';

    const payload = {
      action: 'saveTokens',
      provider: provider,
      prompt: type === 'prompt' ? estimatedTokens : 0,
      completion: type === 'completion' ? estimatedTokens : 0
    };

    // CRITICAL FIX: Double check runtime validity before touching any chrome APIs
    if (canUseChromeRuntime() && chrome.runtime && chrome.runtime.id) {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          // Inside the callback, context might have invalidated mid-flight. 
          // Check extension context safety before accessing lastError
          try {
            if (chrome && chrome.runtime && chrome.runtime.lastError) {
              directStorageUpdate(payload);
            }
          } catch (callbackContextError) {
            // Context invalidated during the async response handling
            directStorageUpdate(payload);
          }
        });
      } catch (ipcUrlError) {
        // Catches immediate context invalidation errors
        directStorageUpdate(payload);
      }
    } else {
      // Fallback directly if extension was reloaded/removed
      directStorageUpdate(payload);
    }
    
    console.log(`Tokens tracked for ${provider} (${type}):`, estimatedTokens);
    lastSentSelection = selectedText;
    
    setTimeout(() => { if (lastSentSelection === selectedText) lastSentSelection = ''; }, 2000);
  } catch (err) {
    reportError(err);
  }
}

function directStorageUpdate(payload) {
  try {
    // Final defensive check to ensure storage isn't destroyed as well
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Fallback storage unavailable: extension context completely destroyed.');
      return;
    }

    chrome.storage.local.get({ providers: {} }, (data) => {
      // Safely check for storage access error before writing
      if (chrome.runtime && chrome.runtime.lastError) return;
      
      const providers = data.providers || {};
      const p = payload.provider || 'other';
      
      if (!providers[p]) {
        providers[p] = { promptTokens: 0, completionTokens: 0 };
      }
      
      providers[p].promptTokens += (payload.prompt || 0);
      providers[p].completionTokens += (payload.completion || 0);
      
      try {
        chrome.storage.local.set({ providers: providers });
      } catch (e) {
        console.warn('directStorageUpdate: storage.set failed', e);
      }
    });
  } catch (e) {
    console.warn('directStorageUpdate execution failed', e);
  }
}

// User gesture listeners for tracking token usage
document.addEventListener('mouseup', () => { 
  try { trySendSelection(); } catch (e) { reportError(e); } 
});

document.addEventListener('mousedown', () => { 
  lastSentSelection = ''; 
});

document.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') {
    try { trySendSelection(); } catch (e) { reportError(e); }
  }
});

// Capture programmatic/dynamic selections in real-time with debouncing
document.addEventListener('selectionchange', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(trySendSelection, 400);
});