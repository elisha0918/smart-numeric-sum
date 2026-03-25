// === Popup Script (popup.js) ===

document.addEventListener('DOMContentLoaded', () => {
  // 開始選取按鈕
  document.getElementById('btn-activate').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'activate-selection' });
      window.close();
    }
  });

  // 設定按鈕
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
