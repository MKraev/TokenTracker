// tracker-core.js

var trackerApi = window.TokenTracker = window.TokenTracker || {};

function getProviderForHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.includes('gemini') || host.includes('google')) return 'gemini';
  if (host.includes('chatgpt') || host.includes('openai')) return 'openai';
  if (host.includes('claude') || host.includes('anthropic')) return 'claude';
  return 'other';
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildTokenPayload({ text, type, hostname }) {
  const estimatedTokens = typeof estimateTokensFromText === 'function'
    ? estimateTokensFromText(text || '')
    : Math.max(1, Math.round(String(text || '').trim().split(/\s+/).filter(Boolean).length * 1.3));

  return {
    action: 'saveTokens',
    provider: getProviderForHostname(hostname || window.location.hostname),
    prompt: type === 'prompt' ? estimatedTokens : 0,
    completion: type === 'completion' ? estimatedTokens : 0
  };
}

function sendTokenPayload(payload) {
  if (!payload) return;

  if (canUseChromeRuntime() && chrome.runtime && chrome.runtime.id) {
    try {
      chrome.runtime.sendMessage(payload, () => {
        try {
          if (chrome && chrome.runtime && chrome.runtime.lastError) {
            directStorageUpdate(payload);
          }
        } catch (callbackContextError) {
          directStorageUpdate(payload);
        }
      });
    } catch (ipcUrlError) {
      directStorageUpdate(payload);
    }
  } else {
    directStorageUpdate(payload);
  }
}

function directStorageUpdate(payload) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.warn('Fallback storage unavailable: extension context completely destroyed.');
      return;
    }

    chrome.storage.local.get({ providers: {}, monthlyTotals: {}, dailyTotals: {} }, (data) => {
      if (chrome.runtime && chrome.runtime.lastError) return;

      const providers = data.providers || {};
      const monthlyTotals = data.monthlyTotals || {};
      const dailyTotals = data.dailyTotals || {};
      const p = payload.provider || 'other';
      const now = new Date();
      const currentMonthKey = getMonthKey(now);
      const currentDayKey = getDayKey(now);

      if (!providers[p]) {
        providers[p] = { promptTokens: 0, completionTokens: 0 };
      }

      providers[p].promptTokens += (payload.prompt || 0);
      providers[p].completionTokens += (payload.completion || 0);

      const currentMonthData = monthlyTotals[currentMonthKey] || { promptTokens: 0, completionTokens: 0 };
      currentMonthData.promptTokens += (payload.prompt || 0);
      currentMonthData.completionTokens += (payload.completion || 0);
      monthlyTotals[currentMonthKey] = currentMonthData;

      const currentDayData = dailyTotals[currentDayKey] || { promptTokens: 0, completionTokens: 0 };
      currentDayData.promptTokens += (payload.prompt || 0);
      currentDayData.completionTokens += (payload.completion || 0);
      dailyTotals[currentDayKey] = currentDayData;

      try {
        console.log('[TokenTracker] directStorageUpdate', { payload, providers, currentMonthKey, currentDayKey, currentMonthData: monthlyTotals[currentMonthKey], currentDayData: dailyTotals[currentDayKey] });
        chrome.storage.local.set({ providers, monthlyTotals, dailyTotals });
      } catch (e) {
        console.warn('directStorageUpdate: storage.set failed', e);
      }
    });
  } catch (e) {
    console.warn('directStorageUpdate execution failed', e);
  }
}

trackerApi.getProviderForHostname = getProviderForHostname;
trackerApi.getMonthKey = getMonthKey;
trackerApi.getDayKey = getDayKey;
trackerApi.buildTokenPayload = buildTokenPayload;
trackerApi.sendTokenPayload = sendTokenPayload;
trackerApi.directStorageUpdate = directStorageUpdate;
