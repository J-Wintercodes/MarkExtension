// Service Worker: Klick aufs Icon bzw. Alt+Shift+L schaltet den Textmarker im aktuellen Tab um.

const SITES = ['https://gemini.google.com/', 'https://chatgpt.com/', 'https://chat.openai.com/', 'https://claude.ai/'];

function setBadge(tabId, active) {
  chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' });
}

async function toggle(tab) {
  if (!SITES.some((s) => tab?.url?.startsWith(s))) return;
  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch (_) {
    // Content Script fehlt (Tab war schon vor der Installation offen) → nachträglich einfügen.
    // Es schaltet sich beim Start selbst ein und meldet den Zustand über 'state'.
    await chrome.storage.local.set({ lmActive: true });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return;
  }
  setBadge(tab.id, res?.active);
}

chrome.action.setBadgeBackgroundColor({ color: '#f2c200' });
chrome.action.onClicked.addListener(toggle);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-textmarker') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'state' && sender.tab) setBadge(sender.tab.id, msg.active);
});
