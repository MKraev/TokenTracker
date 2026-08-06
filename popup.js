const trackerApi = window.TokenTracker = window.TokenTracker || {};

const currentMonthPromptEl = document.getElementById('currentMonthPrompt');
const currentMonthCompletionEl = document.getElementById('currentMonthCompletion');
const currentMonthTotalEl = document.getElementById('currentMonthTotal');
const monthSpendLabel = document.getElementById('monthSpendLabel');
const monthSpendInputEl = document.getElementById('monthSpendInput');
const monthSpendOutputEl = document.getElementById('monthSpendOutput');
const monthSpendTotalEl = document.getElementById('monthSpendTotal');
const monthHistoryEl = document.getElementById('monthHistory');
const downloadBtn = document.getElementById('downloadBtn');

const providerElements = {
  gemini: {
    prompt: document.getElementById('geminiPrompt'),
    completion: document.getElementById('geminiCompletion')
  },
  openai: {
    prompt: document.getElementById('openaiPrompt'),
    completion: document.getElementById('openaiCompletion')
  },
  claude: {
    prompt: document.getElementById('claudePrompt'),
    completion: document.getElementById('claudeCompletion')
  },
  other: {
    prompt: document.getElementById('otherPrompt'),
    completion: document.getElementById('otherCompletion')
  }
};

const defaultProviders = {
  gemini: { promptTokens: 0, completionTokens: 0 },
  openai: { promptTokens: 0, completionTokens: 0 },
  claude: { promptTokens: 0, completionTokens: 0 },
  other: { promptTokens: 0, completionTokens: 0 }
};

function getTodayData(dailyTotals, currentDayKey) {
  if (dailyTotals[currentDayKey]) return dailyTotals[currentDayKey];
  const normalizedKey = currentDayKey.split('-').map((chunk) => String(Number(chunk))).join('-');
  const fallbackEntry = Object.entries(dailyTotals).find(([key]) => key === normalizedKey || key === currentDayKey || key.startsWith(normalizedKey));
  return fallbackEntry ? fallbackEntry[1] : { promptTokens: 0, completionTokens: 0 };
}

function refreshStats() {
  chrome.storage.local.get({ providers: defaultProviders, promptTokens: 0, completionTokens: 0, monthlyTotals: {}, dailyTotals: {} }, (data) => {
    const providers = data.providers && Object.keys(data.providers).length ? data.providers : null;
    const monthlyTotals = data.monthlyTotals || {};
    const dailyTotals = data.dailyTotals || {};
    const now = new Date();
    const currentMonthKey = getMonthKey(now);
    const currentDayKey = getDayKey(now);

    const currentMonthData = monthlyTotals[currentMonthKey] || { promptTokens: 0, completionTokens: 0 };
    const currentMonthPrompt = currentMonthData.promptTokens || 0;
    const currentMonthCompletion = currentMonthData.completionTokens || 0;
    const currentMonthTotal = currentMonthPrompt + currentMonthCompletion;

    const currentDayData = getTodayData(dailyTotals, currentDayKey);
    const currentDayPrompt = currentDayData.promptTokens || 0;
    const currentDayCompletion = currentDayData.completionTokens || 0;
    const currentDayTotal = currentDayPrompt + currentDayCompletion;

    if (currentMonthPromptEl) currentMonthPromptEl.innerText = currentDayPrompt;
    if (currentMonthCompletionEl) currentMonthCompletionEl.innerText = currentDayCompletion;
    if (currentMonthTotalEl) currentMonthTotalEl.innerText = currentDayTotal;

    if (monthSpendLabel) monthSpendLabel.innerText = `Monthly spend:`;
    if (monthSpendInputEl) monthSpendInputEl.innerText = currentMonthPrompt;
    if (monthSpendOutputEl) monthSpendOutputEl.innerText = currentMonthCompletion;
    if (monthSpendTotalEl) monthSpendTotalEl.innerText = currentMonthTotal;

    if (providers) {
      Object.entries(providerElements).forEach(([providerKey, els]) => {
        const providerData = providers[providerKey] || { promptTokens: 0, completionTokens: 0 };
        if (els.prompt) els.prompt.innerText = providerData.promptTokens || 0;
        if (els.completion) els.completion.innerText = providerData.completionTokens || 0;
      });
    } else {
      Object.values(providerElements).forEach((els) => {
        if (els.prompt) els.prompt.innerText = 0;
        if (els.completion) els.completion.innerText = 0;
      });
    }

    if (monthHistoryEl) {
      const monthKeys = Object.keys(monthlyTotals).filter((key) => key !== currentMonthKey).sort().reverse();
      if (!monthKeys.length) {
        monthHistoryEl.innerHTML = '<div class="month-history-item">No previous months yet</div>';
      } else {
        monthHistoryEl.innerHTML = monthKeys.slice(0, 6).map((key) => {
          const monthData = monthlyTotals[key] || { promptTokens: 0, completionTokens: 0 };
          const monthName = formatMonthLabelFromKey(key);
          return `<div class="month-history-item"><span>${monthName}</span><span>In ${monthData.promptTokens || 0} / Out ${monthData.completionTokens || 0}</span></div>`;
        }).join('');
      }
    }
  });
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

trackerApi.getMonthKey = getMonthKey;
trackerApi.getDayKey = getDayKey;

function formatMonthLabelFromKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

refreshStats();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.providers || changes.promptTokens || changes.completionTokens || changes.monthlyTotals || changes.dailyTotals) {
    refreshStats();
  }
});

if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'triggerDownload' });
  });
}
