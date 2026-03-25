// === Offscreen Document (offscreen.js) ===
// 負責裁切截圖 + Tesseract.js OCR 處理

let worker = null;
let workerInitPromise = null;

// 頁面載入後立即預先初始化 Tesseract worker（不等用戶觸發）
workerInitPromise = initWorker().catch(err => {
  console.warn('[offscreen] Pre-init failed (will retry on demand):', err.message);
  workerInitPromise = null;
});

// 監聽來自 background 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 就緒檢查
  if (message.action === 'ping' && message.target === 'offscreen') {
    sendResponse('pong');
    return;
  }

  if (message.action === 'perform-ocr' && message.target === 'offscreen') {
    performOCR(message.dataUrl, message.rect)
      .then(text => {
        console.log('[offscreen] OCR result:', text);
        sendResponse(text);
      })
      .catch(err => {
        console.error('[offscreen] OCR error:', err);
        sendResponse('ERROR:' + err.message);
      });
    return true;
  }
});

// 裁切圖片（含縮放優化）
function cropImage(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // 限制最大尺寸，過大的圖片會拖慢 OCR
      const MAX_DIM = 1200;
      let outW = rect.width;
      let outH = rect.height;
      if (outW > MAX_DIM || outH > MAX_DIM) {
        const scale = MAX_DIM / Math.max(outW, outH);
        outW = Math.round(outW * scale);
        outH = Math.round(outH * scale);
      }

      const canvas = document.getElementById('crop-canvas');
      canvas.width = outW;
      canvas.height = outH;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // 裁切 + 縮放一步完成
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, outW, outH);

      // 轉灰階（提升 OCR 準確度，不做對比度增強避免破壞文字）
      const imageData = ctx.getImageData(0, 0, outW, outH);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = dataUrl;
  });
}

// 初始化 Tesseract worker
async function initWorker() {
  if (worker) return worker;

  const t0 = performance.now();
  console.log('[offscreen] Initializing Tesseract worker...');

  worker = await Tesseract.createWorker('eng', 1, {
    workerPath: chrome.runtime.getURL('lib/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core-simd.wasm.js'),
    langPath: chrome.runtime.getURL('lang-data'),
    gzip: true,
    workerBlobURL: false
  });

  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.,- '
  });

  console.log(`[offscreen] Tesseract worker ready in ${Math.round(performance.now() - t0)}ms`);
  return worker;
}

// 執行 OCR
async function performOCR(dataUrl, rect) {
  const t0 = performance.now();
  console.log('[offscreen] Starting OCR, rect:', rect.width, 'x', rect.height);

  // 裁切圖片
  const croppedDataUrl = await cropImage(dataUrl, rect);

  // 等待 worker 就緒（首次可能還在預初始化中）
  if (workerInitPromise) {
    await workerInitPromise;
  }
  const w = await initWorker();

  // 執行辨識
  const { data: { text } } = await w.recognize(croppedDataUrl);

  console.log(`[offscreen] OCR done in ${Math.round(performance.now() - t0)}ms, text:`, JSON.stringify(text));
  return text;
}
