const FIELDS = {
  format: 'html',
  maxChars: '300000',
  extraInstructions: '',
};
const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(Object.keys(FIELDS));
  for (const [key, fallback] of Object.entries(FIELDS)) $(key).value = stored[key] ?? fallback;
}

$('save').addEventListener('click', async () => {
  const values = {};
  for (const key of Object.keys(FIELDS)) values[key] = $(key).value.trim();
  await chrome.storage.local.set(values);
  const el = $('save-result');
  el.textContent = 'Gespeichert ✓';
  el.className = 'result ok';
});

load();
