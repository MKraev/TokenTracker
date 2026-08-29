// background.js

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const defaultStructure = {
  providers: {
    gemini: { promptTokens: 0, completionTokens: 0 },
    openai: { promptTokens: 0, completionTokens: 0 },
    claude: { promptTokens: 0, completionTokens: 0 },
    other: { promptTokens: 0, completionTokens: 0 }
  },
  monthlyTotals: {},
  dailyTotals: {},
  dailyRecords: {},
  eventLog: []
};

let storageWriteQueue = Promise.resolve();

const databaseName = 'tokenTrackerDatabase';
const databaseVersion = 1;

function openTokenDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('tokenEvents')) {
        database.createObjectStore('tokenEvents', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('dailyRecords')) {
        database.createObjectStore('dailyRecords', { keyPath: 'date' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open token database'));
  });
}

async function persistEventToDatabase(dayKey, entry) {
  try {
    const database = await openTokenDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['tokenEvents', 'dailyRecords'], 'readwrite');
      const dailyStore = transaction.objectStore('dailyRecords');
      const eventStore = transaction.objectStore('tokenEvents');
      const dailyRequest = dailyStore.get(dayKey);

      dailyRequest.onsuccess = () => {
        const record = dailyRequest.result || {
          date: dayKey,
          promptTokens: 0,
          completionTokens: 0,
          eventCount: 0
        };
        record.promptTokens += entry.prompt;
        record.completionTokens += entry.completion;
        record.eventCount += 1;
        dailyStore.put(record);
        eventStore.add({ ...entry, date: dayKey });
      };

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Unable to persist token event'));
      transaction.onabort = () => reject(transaction.error || new Error('Token event transaction aborted'));
    });
    database.close();
  } catch (error) {
    console.warn('[TokenTracker] IndexedDB persistence failed', error);
  }
}

async function readDatabaseExport() {
  try {
    const database = await openTokenDatabase();
    const result = await new Promise((resolve, reject) => {
      const transaction = database.transaction(['tokenEvents', 'dailyRecords'], 'readonly');
      const eventsRequest = transaction.objectStore('tokenEvents').getAll();
      const dailyRequest = transaction.objectStore('dailyRecords').getAll();
      transaction.oncomplete = () => resolve({ events: eventsRequest.result, dailyRecords: dailyRequest.result });
      transaction.onerror = () => reject(transaction.error || new Error('Unable to read token database'));
    });
    database.close();
    return result;
  } catch (error) {
    console.warn('[TokenTracker] IndexedDB export failed', error);
    return { events: [], dailyRecords: [] };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTokens') {
    storageWriteQueue = storageWriteQueue.then(() => new Promise((resolve) => {
      chrome.storage.local.get({
      providers: defaultStructure.providers,
      monthlyTotals: {},
      dailyTotals: {},
      dailyRecords: {},
      eventLog: []
      }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn('[TokenTracker] Unable to read token totals', chrome.runtime.lastError.message);
        resolve();
        return;
      }
      const providers = data.providers || defaultStructure.providers;
      const monthlyTotals = data.monthlyTotals || {};
      const dailyTotals = data.dailyTotals || {};
      const dailyRecords = data.dailyRecords || {};
      const eventLog = Array.isArray(data.eventLog) ? data.eventLog : [];
      const provider = request.provider || 'other';
      const now = new Date();
      const monthKey = getMonthKey(now);
      const dayKey = getDayKey(now);
      const prompt = Number(request.prompt || 0);
      const completion = Number(request.completion || 0);

      if (!providers[provider]) {
        providers[provider] = { promptTokens: 0, completionTokens: 0 };
      }

      providers[provider].promptTokens += prompt;
      providers[provider].completionTokens += completion;

      const monthTotals = monthlyTotals[monthKey] || { promptTokens: 0, completionTokens: 0 };
      monthTotals.promptTokens += prompt;
      monthTotals.completionTokens += completion;
      monthlyTotals[monthKey] = monthTotals;

      const dayTotals = dailyTotals[dayKey] || { promptTokens: 0, completionTokens: 0 };
      dayTotals.promptTokens += prompt;
      dayTotals.completionTokens += completion;
      dailyTotals[dayKey] = dayTotals;

      const record = dailyRecords[dayKey] || {
        date: dayKey,
        totals: { promptTokens: 0, completionTokens: 0 },
        entries: []
      };

      record.totals.promptTokens += prompt;
      record.totals.completionTokens += completion;
      record.entries.push({
        timestamp: request.observedAt || new Date().toISOString(),
        provider,
        type: request.type || 'unknown',
        source: request.source || 'unknown',
        prompt,
        completion,
        total: prompt + completion
      });

      if (record.entries.length > 250) {
        record.entries = record.entries.slice(-250);
      }
      dailyRecords[dayKey] = record;

      eventLog.push({
        timestamp: request.observedAt || new Date().toISOString(),
        provider,
        type: request.type || 'unknown',
        source: request.source || 'unknown',
        prompt,
        completion,
        total: prompt + completion
      });

      if (eventLog.length > 500) {
        eventLog.splice(0, eventLog.length - 500);
      }

      chrome.storage.local.set({
        providers,
        monthlyTotals,
        dailyTotals,
        dailyRecords,
        eventLog
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TokenTracker] Unable to save token totals', chrome.runtime.lastError.message);
        }
        resolve();
      });

      persistEventToDatabase(dayKey, {
        timestamp: request.observedAt || new Date().toISOString(),
        provider,
        type: request.type || 'unknown',
        source: request.source || 'unknown',
        prompt,
        completion,
        total: prompt + completion
      });
      });
    })).catch((error) => {
      console.warn('[TokenTracker] Token event processing failed', error);
    });
  }

  if (request.action === 'triggerDownload') {
    chrome.storage.local.get({
      providers: defaultStructure.providers,
      promptTokens: 0,
      completionTokens: 0,
      monthlyTotals: {},
      dailyTotals: {},
      dailyRecords: {},
      eventLog: []
    }, async (data) => {
      const providers = data.providers && Object.keys(data.providers).length ? data.providers : defaultStructure.providers;
      const databaseExport = await readDatabaseExport();
      const exportData = {
        providers,
        monthlyTotals: data.monthlyTotals || {},
        dailyTotals: data.dailyTotals || {},
        dailyRecords: data.dailyRecords || {},
        eventLog: data.eventLog || [],
        database: databaseExport,
        legacyTotals: {
          promptTokens: data.promptTokens || 0,
          completionTokens: data.completionTokens || 0
        },
        updatedAt: new Date().toISOString()
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

      chrome.downloads.download({
        url: blob,
        filename: 'ai_token_dashboard_data.json',
        saveAs: true
      });
    });
  }

  return true;
});