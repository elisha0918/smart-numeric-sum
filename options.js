// === Options Script (options.js) ===

document.addEventListener('DOMContentLoaded', () => {
  // 開啟 Chrome 快捷鍵設定頁面
  document.getElementById('btn-open-shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // 取得目前快捷鍵顯示
  chrome.commands.getAll((commands) => {
    const activateCmd = commands.find(c => c.name === 'activate-selection');
    if (activateCmd && activateCmd.shortcut) {
      document.getElementById('current-shortcut').textContent = activateCmd.shortcut;
    } else {
      document.getElementById('current-shortcut').textContent = '未設定';
    }
  });
});
