// === Content Script (content.js) ===

(() => {
  let overlay = null;
  let selectionBox = null;
  let resultPopup = null;
  let startX = 0, startY = 0;
  let isSelecting = false;

  // 監聽來自 background 的訊息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'activate-selection') {
      activateSelectionMode();
    } else if (message.action === 'show-results') {
      showResults(message.result);
    } else if (message.action === 'show-loading') {
      showLoading(window._smartSumPopupPosition || { left: 100, top: 100 });
    }
  });

  // 啟動選取模式
  function activateSelectionMode() {
    removeOverlay();
    removeResultPopup();

    // 建立全螢幕 overlay
    overlay = document.createElement('div');
    overlay.id = 'smart-sum-overlay';
    document.body.appendChild(overlay);

    // 建立選取框
    selectionBox = document.createElement('div');
    selectionBox.id = 'smart-sum-selection';
    overlay.appendChild(selectionBox);

    // 提示文字
    const hint = document.createElement('div');
    hint.id = 'smart-sum-hint';
    hint.textContent = '拖曳滑鼠框選數字區域，按 Esc 取消';
    overlay.appendChild(hint);

    // 綁定事件
    overlay.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';

    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  }

  function onMouseUp(e) {
    if (!isSelecting) return;
    isSelecting = false;

    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('mouseup', onMouseUp);

    const rect = selectionBox.getBoundingClientRect();

    // 如果選取區域太小，忽略
    if (rect.width < 10 || rect.height < 10) {
      removeOverlay();
      return;
    }

    // 考慮設備像素比（高 DPI 螢幕）
    const dpr = window.devicePixelRatio || 1;

    const captureRect = {
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr)
    };

    // 記住選取框位置（用於顯示結果）
    window._smartSumPopupPosition = {
      left: rect.left,
      top: rect.bottom + 10,
      selectionRight: rect.right
    };

    // 先移除所有 UI，確保截圖乾淨
    removeOverlay();
    removeResultPopup();

    // 等待 DOM 更新完成再截圖（重要！確保 overlay 已從畫面消失）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 發送截圖請求（background 會先截圖，再通知顯示 loading）
        chrome.runtime.sendMessage({
          action: 'capture-and-ocr',
          rect: captureRect
        });
      });
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
      removeResultPopup();
      document.removeEventListener('keydown', onKeyDown);
    }
  }

  // 顯示載入中
  function showLoading(position) {
    removeResultPopup();

    resultPopup = document.createElement('div');
    resultPopup.id = 'smart-sum-result';
    resultPopup.innerHTML = `
      <div class="smart-sum-loading">
        <div class="smart-sum-spinner"></div>
        <span>辨識中...</span>
      </div>
    `;

    positionPopup(resultPopup, position);
    document.body.appendChild(resultPopup);
  }

  // 顯示結果
  function showResults(result) {
    removeResultPopup();

    const position = window._smartSumPopupPosition || { left: 100, top: 100 };

    resultPopup = document.createElement('div');
    resultPopup.id = 'smart-sum-result';

    if (result && result.error) {
      resultPopup.innerHTML = `
        <div class="smart-sum-header">
          <span class="smart-sum-title">錯誤</span>
          <button class="smart-sum-close" title="關閉">&times;</button>
        </div>
        <div class="smart-sum-empty">
          ${escapeHtml(result.error)}
        </div>
      `;
    } else if (!result || result.count === 0) {
      resultPopup.innerHTML = `
        <div class="smart-sum-header">
          <span class="smart-sum-title">辨識結果</span>
          <button class="smart-sum-close" title="關閉">&times;</button>
        </div>
        <div class="smart-sum-empty">
          未偵測到數字，請重新框選
          ${result && result.rawText ? `<div class="smart-sum-raw">OCR 原始文字：「${escapeHtml(result.rawText)}」</div>` : '<div class="smart-sum-raw">OCR 未回傳任何文字</div>'}
        </div>
      `;
    } else {
      const numbersList = result.numbers.map(n => `<span class="smart-sum-num">${n}</span>`).join('');
      resultPopup.innerHTML = `
        <div class="smart-sum-header">
          <span class="smart-sum-title">辨識結果</span>
          <button class="smart-sum-close" title="關閉">&times;</button>
        </div>
        <div class="smart-sum-stats">
          <div class="smart-sum-stat-main">
            <label>合計</label>
            <span class="smart-sum-value">${result.sum}</span>
            <button class="smart-sum-copy" data-value="${result.sum}" title="複製合計">📋</button>
          </div>
          <div class="smart-sum-stat-row">
            <div class="smart-sum-stat">
              <label>平均值</label>
              <span>${result.average}</span>
            </div>
            <div class="smart-sum-stat">
              <label>計數</label>
              <span>${result.count}</span>
            </div>
          </div>
        </div>
        <div class="smart-sum-numbers">
          <label>辨識到的數字</label>
          <div class="smart-sum-num-list">${numbersList}</div>
        </div>
        ${result.rawText ? `<details class="smart-sum-details"><summary>原始 OCR 文字</summary><div class="smart-sum-raw-wrap"><pre>${escapeHtml(result.rawText)}</pre><button class="smart-sum-copy-raw" data-value="${escapeHtml(result.rawText)}" title="複製全部">📋</button></div></details>` : ''}
      `;
    }

    positionPopup(resultPopup, position);
    document.body.appendChild(resultPopup);

    // 綁定事件
    const closeBtn = resultPopup.querySelector('.smart-sum-close');
    if (closeBtn) closeBtn.addEventListener('click', removeResultPopup);

    const copyBtn = resultPopup.querySelector('.smart-sum-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyBtn.dataset.value).then(() => {
          copyBtn.textContent = '✅';
          setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
        });
      });
    }

    const copyRawBtn = resultPopup.querySelector('.smart-sum-copy-raw');
    if (copyRawBtn) {
      copyRawBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyRawBtn.dataset.value).then(() => {
          copyRawBtn.textContent = '✅';
          setTimeout(() => { copyRawBtn.textContent = '📋'; }, 1500);
        });
      });
    }

    // 拖曳移動視窗
    makeDraggable(resultPopup, resultPopup.querySelector('.smart-sum-header'));

    // 點擊外部關閉
    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEscClose);
    }, 100);
  }

  function onClickOutside(e) {
    if (resultPopup && !resultPopup.contains(e.target)) {
      removeResultPopup();
    }
  }

  function onEscClose(e) {
    if (e.key === 'Escape') {
      removeResultPopup();
    }
  }

  // 定位浮動視窗
  function positionPopup(popup, position) {
    popup.style.position = 'fixed';
    popup.style.zIndex = '2147483647';

    let left = position.left;
    let top = position.top;

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';

    requestAnimationFrame(() => {
      const rect = popup.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        popup.style.left = Math.max(10, window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        popup.style.top = Math.max(10, position.top - rect.height - 20) + 'px';
      }
    });
  }

  // 移除 overlay
  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      selectionBox = null;
    }
  }

  // 移除結果視窗
  function removeResultPopup() {
    if (resultPopup) {
      resultPopup.remove();
      resultPopup = null;
    }
    document.removeEventListener('mousedown', onClickOutside);
    document.removeEventListener('keydown', onEscClose);
  }

  // HTML 跳脫
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 讓元素可拖曳（透過 handle 拖動 target）
  function makeDraggable(target, handle) {
    let dragX = 0, dragY = 0;
    let isDragging = false;

    handle.addEventListener('mousedown', (e) => {
      // 忽略關閉按鈕的點擊
      if (e.target.closest('.smart-sum-close')) return;

      isDragging = true;
      dragX = e.clientX - target.offsetLeft;
      dragY = e.clientY - target.offsetTop;

      const onMove = (e) => {
        if (!isDragging) return;
        target.style.left = (e.clientX - dragX) + 'px';
        target.style.top = (e.clientY - dragY) + 'px';
      };

      const onUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
})();
