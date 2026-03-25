// === Service Worker (background.js) ===

// 建立右鍵選單
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'smart-sum-select',
    title: '智能數字選取合計',
    contexts: ['page', 'image']
  });
});

// 監聽右鍵選單點擊
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'smart-sum-select') {
    activateSelection(tab.id);
  }
});

// 監聽快捷鍵
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'activate-selection') {
    activateSelection(tab.id);
  }
});

// 啟動選取模式（若 content script 未注入則自動注入）
async function activateSelection(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'activate-selection' });
  } catch (err) {
    // content script 不存在，手動注入後重試
    console.log('[Smart Sum] Content script not found, injecting...');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css']
    });
    await chrome.tabs.sendMessage(tabId, { action: 'activate-selection' });
  }
}

// 安全地發送訊息給 content script（不拋錯）
function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture-and-ocr') {
    const tabId = sender.tab.id;
    handleCaptureAndOCR(tabId, message.rect)
      .then(result => {
        sendToTab(tabId, { action: 'show-results', result });
      })
      .catch(err => {
        console.error('[Smart Sum] handleCaptureAndOCR error:', err);
        sendToTab(tabId, {
          action: 'show-results',
          result: { error: '處理失敗: ' + err.message, numbers: [], sum: 0, average: 0, count: 0, rawText: '' }
        });
      });
    return false;
  }
});

// 截圖 + OCR 流程
async function handleCaptureAndOCR(tabId, rect) {
  // 1. 截取可見區域
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  console.log('[Smart Sum] Screenshot captured, size:', dataUrl.length);

  // 2. 通知顯示 loading
  sendToTab(tabId, { action: 'show-loading' });

  // 3. 確保 offscreen document 存在
  await ensureOffscreenDocument();

  // 4. 傳給 offscreen document 進行裁切 + OCR
  const ocrText = await chrome.runtime.sendMessage({
    action: 'perform-ocr',
    target: 'offscreen',
    dataUrl: dataUrl,
    rect: rect
  });
  console.log('[Smart Sum] OCR result:', ocrText);

  // 5. 解析數字並計算
  return parseAndCalculate(ocrText);
}

// 確保 offscreen document 存在且已就緒
async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      await pingOffscreen();
      return;
    }
  } catch (err) {
    console.warn('[Smart Sum] getContexts failed:', err);
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: '使用 Tesseract.js Web Worker 執行 OCR 辨識'
    });
    console.log('[Smart Sum] Offscreen document created');
  } catch (err) {
    if (!err.message.includes('already exists')) {
      throw err;
    }
  }

  await pingOffscreen();
}

// 輪詢等待 offscreen document 就緒
async function pingOffscreen() {
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'ping', target: 'offscreen' });
      if (resp === 'pong') {
        console.log('[Smart Sum] Offscreen document is ready');
        return;
      }
    } catch (e) {
      // 尚未就緒
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Offscreen document 載入逾時');
}

// 解析 OCR 文字，提取數字並計算
function parseAndCalculate(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') {
    return { numbers: [], sum: 0, average: 0, count: 0, rawText: String(ocrText || '') };
  }

  const loosePattern = /-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  let matches = ocrText.match(loosePattern) || [];

  const numbers = matches
    .map(s => {
      const cleaned = s.replace(/,/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    })
    .filter(n => n !== null);

  const count = numbers.length;
  const sum = numbers.reduce((a, b) => a + b, 0);
  const average = count > 0 ? sum / count : 0;

  return {
    numbers,
    sum: Math.round(sum * 100) / 100,
    average: Math.round(average * 100) / 100,
    count,
    rawText: ocrText.trim()
  };
}
