const promptEl = document.getElementById('pTokens');
const completionEl = document.getElementById('cTokens');
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

function refreshStats() {
  chrome.storage.local.get({ providers: defaultProviders, promptTokens: 0, completionTokens: 0 }, (data) => {
    let promptTokens = 0;
    let completionTokens = 0;
    const providers = data.providers && Object.keys(data.providers).length ? data.providers : null;

    if (providers) {
      Object.entries(providerElements).forEach(([providerKey, els]) => {
        const providerData = providers[providerKey] || { promptTokens: 0, completionTokens: 0 };
        els.prompt.innerText = providerData.promptTokens || 0;
        els.completion.innerText = providerData.completionTokens || 0;
        promptTokens += providerData.promptTokens || 0;
        completionTokens += providerData.completionTokens || 0;
      });
    } else {
      promptTokens = data.promptTokens || 0;
      completionTokens = data.completionTokens || 0;
      Object.values(providerElements).forEach((els) => {
        els.prompt.innerText = 0;
        els.completion.innerText = 0;
      });
    }

    promptEl.innerText = promptTokens;
    completionEl.innerText = completionTokens;
  });
}

refreshStats();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.providers || changes.promptTokens || changes.completionTokens) {
    refreshStats();
  }
});

downloadBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'triggerDownload' });
});
