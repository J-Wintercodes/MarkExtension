const $ = (id) => document.getElementById(id);

function show(id) {
  for (const s of ['not-gemini', 'reload', 'main']) $(s).hidden = s !== id;
}

function render(state) {
  show('main');
  $('active').checked = state.active;
  $('claude').disabled = state.busy;
  $('stats').textContent = state.messages
    ? `${state.messages} Nachrichten sichtbar · ${state.count} Markierung${state.count === 1 ? '' : 'en'}`
    : 'Kein Chat geöffnet.';
}

async function send(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://gemini.google.com/')) {
    show('not-gemini');
    return;
  }

  try {
    render(await send(tab.id, { type: 'getState' }));
  } catch (_) {
    // Content Script fehlt (Tab war schon vor der Installation offen) → nachträglich einfügen.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['md2html.js', 'content.js'] });
      await new Promise((r) => setTimeout(r, 300));
      render(await send(tab.id, { type: 'getState' }));
    } catch (_) {
      show('reload');
    }
  }

  $('active').addEventListener('change', async (e) => {
    render(await send(tab.id, { type: 'setActive', active: e.target.checked }));
  });
  $('claude').addEventListener('click', async () => {
    await send(tab.id, { type: 'prepareForClaude' });
    window.close();
  });
  $('export').addEventListener('click', async () => {
    await send(tab.id, { type: 'exportHighlights' });
    window.close();
  });
  $('reload-btn').addEventListener('click', () => {
    chrome.tabs.reload(tab.id);
    window.close();
  });
}

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
