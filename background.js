// background.js

// Инициализиране на празна структура, ако няма нищо в сториджа
const defaultStructure = {
  providers: {
    gemini: { promptTokens: 0, completionTokens: 0 },
    openai: { promptTokens: 0, completionTokens: 0 },
    claude: { promptTokens: 0, completionTokens: 0 },
    other: { promptTokens: 0, completionTokens: 0 }
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "saveTokens") {
    chrome.storage.local.get({ providers: defaultStructure.providers }, (data) => {
      const providers = data.providers;
      const p = request.provider || 'other';

      // Застраховка, ако се появи нов непознат провайдър
      if (!providers[p]) {
        providers[p] = { promptTokens: 0, completionTokens: 0 };
      }

      // Добавяме новите токени към конкретния доставчик
      providers[p].promptTokens += request.prompt;
      providers[p].completionTokens += request.completion;
      
      chrome.storage.local.set({ providers: providers });
    });
  }

  if (request.action === "triggerDownload") {
    chrome.storage.local.get({ providers: defaultStructure.providers, promptTokens: 0, completionTokens: 0 }, (data) => {
      const providers = data.providers && Object.keys(data.providers).length ? data.providers : defaultStructure.providers;
      const legacyPrompt = data.promptTokens || 0;
      const legacyCompletion = data.completionTokens || 0;
      
      const exportData = {
        providers,
        legacyTotals: {
          promptTokens: legacyPrompt,
          completionTokens: legacyCompletion
        },
        updatedAt: new Date().toISOString()
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = "data:application/json;charset=utf-8," + encodeURIComponent(jsonString);
      
      chrome.downloads.download({
        url: blob,
        filename: "ai_token_dashboard_data.json",
        saveAs: true
      });
    });
  }
  
  return true; 
});