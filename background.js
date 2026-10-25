// Service Worker: Tastenkürzel und Öffnen von claude.ai (ohne Popup-Blocker).

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'openClaude') chrome.tabs.create({ url: 'https://claude.ai/new' });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-lernmodus') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('https://gemini.google.com/')) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle' }).catch(() => {});
  }
});
