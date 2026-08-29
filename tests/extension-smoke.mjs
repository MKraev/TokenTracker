import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extensionDirectory = projectDirectory;
const chromePath = process.env.CHROME_PATH;

const context = await chromium.launchPersistentContext('', {
  headless: process.env.HEADLESS === 'true' ? true : false,
  ...(chromePath ? { executablePath: chromePath } : {}),
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    `--disable-extensions-except=${extensionDirectory}`,
    `--load-extension=${extensionDirectory}`
  ]
});

try {
  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => {
    throw new Error('TokenTracker service worker did not start. Check Chromium extension launch support.');
  });
  const result = await serviceWorker.evaluate(async () => {
    const send = (message) => new Promise((resolve) => {
      chrome.runtime.sendMessage(message, () => resolve());
    });

    await send({
      action: 'saveTokens',
      provider: 'openai',
      type: 'prompt',
      source: 'smoke-test',
      prompt: 11,
      completion: 0,
      observedAt: new Date().toISOString()
    });
    await send({
      action: 'saveTokens',
      provider: 'openai',
      type: 'completion',
      source: 'smoke-test',
      prompt: 0,
      completion: 7,
      observedAt: new Date().toISOString()
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['providers', 'dailyTotals', 'dailyRecords', 'eventLog'], resolve);
    });
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tokenTrackerDatabase', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction(['tokenEvents', 'dailyRecords'], 'readonly');
        const events = transaction.objectStore('tokenEvents').getAll();
        const daily = transaction.objectStore('dailyRecords').get(dayKey);
        transaction.oncomplete = () => resolve({ events: events.result, daily: daily.result });
      };
    });

    return { storage, database, dayKey };
  });

  assert.equal(result.storage.providers.openai.promptTokens, 11);
  assert.equal(result.storage.providers.openai.completionTokens, 7);
  assert.equal(result.storage.dailyTotals[result.dayKey].promptTokens, 11);
  assert.equal(result.storage.dailyTotals[result.dayKey].completionTokens, 7);
  assert.equal(result.storage.dailyRecords[result.dayKey].entries.length, 2);
  assert.equal(result.storage.eventLog.at(-1).total, 7);
  assert.equal(result.database.daily.promptTokens, 11);
  assert.equal(result.database.daily.completionTokens, 7);
  assert.equal(result.database.daily.eventCount, 2);
  assert.equal(result.database.events.length, 2);

  console.log('TokenTracker extension smoke test passed');
} finally {
  if (context.browser()?.isConnected()) {
    await context.close().catch(() => {});
  }
}
