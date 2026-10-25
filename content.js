// Content Script für Gemini, ChatGPT und Claude: Textmarker und Radierer.
// Markierungen werden pro Chat lokal gespeichert und beim Öffnen wiederhergestellt.
// Gemini erzwingt Trusted Types, deshalb wird das UI nur mit createElement gebaut (kein innerHTML).

(() => {
  'use strict';
  if (window.__lernmodusLoaded) return;
  window.__lernmodusLoaded = true;

  // Pro Seite: wo die Nachrichten stehen, und welcher Pfad ein noch ungespeicherter neuer Chat ist.
  const SITES = {
    'gemini.google.com': {
      messages: 'user-query, model-response',
      role: (host) => (host.tagName === 'USER-QUERY' ? 'user' : 'model'),
      root: (host, role) => role === 'user'
        ? host.querySelector('.query-text') || host
        : host.querySelector('message-content .markdown') || host.querySelector('message-content') || host,
      // u. a. die "Gedanken" von Gemini Pro
      skip: 'model-thoughts, .thoughts-container, .thoughts-header, mat-icon, .cdk-visually-hidden, message-actions, .response-footer, sources-carousel, sources-carousel-inline',
      isDraft: (path) => /\/app\/?$/.test(path),
    },
    'chatgpt.com': {
      messages: '[data-message-author-role]',
      role: (host) => (host.dataset.messageAuthorRole === 'user' ? 'user' : 'model'),
      root: (host) => host.querySelector('.markdown') || host,
      skip: '',
      isDraft: (path) => !path.includes('/c/'),
    },
    'claude.ai': {
      messages: '[data-testid="user-message"], .font-claude-response, .font-claude-message',
      role: (host) => (host.matches('[data-testid="user-message"]') ? 'user' : 'model'),
      root: (host) => host,
      skip: '',
      isDraft: (path) => !path.startsWith('/chat/'),
    },
  };
  SITES['chat.openai.com'] = SITES['chatgpt.com'];

  const site = SITES[location.hostname];
  if (!site) return;

  const SKIP_SELECTOR = [
    'button', 'svg', 'script', 'style', '.sr-only', '.screen-reader-only', '.lm-ui', site.skip,
  ].filter(Boolean).join(',');
  // Gemini-Markierungen liegen aus älteren Versionen ohne Hostnamen im Speicher.
  const keyPrefix = location.hostname === 'gemini.google.com' ? '' : location.hostname;

  const state = {
    active: false,
    erasing: false,
    chatKey: location.pathname,
    highlights: [],
  };

  // ---------- kleine Helfer ----------

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children) if (c != null) el.append(c);
    return el;
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const normKey = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 150);

  let toastTimer;
  function toast(text) {
    let el = document.querySelector('.lm-toast');
    if (!el) {
      el = h('div', { class: 'lm-ui lm-toast' });
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('lm-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('lm-show'), 3000);
  }

  // ---------- Speicher ----------

  const storeKey = (chatKey) => 'hl:' + keyPrefix + chatKey;

  async function loadHighlights() {
    const key = storeKey(state.chatKey);
    const res = await chrome.storage.local.get(key);
    state.highlights = res[key] || [];
  }

  function saveHighlights() {
    const key = storeKey(state.chatKey);
    if (state.highlights.length) chrome.storage.local.set({ [key]: state.highlights });
    else chrome.storage.local.remove(key);
  }

  // ---------- Nachrichten im DOM ----------

  function toMessage(host) {
    const role = site.role(host);
    return { host, role, root: site.root(host, role) };
  }

  // Nur die äußersten Treffer zählen, falls sich Selektoren verschachteln (z. B. bei Claude).
  const isOuter = (el) => !el.parentElement?.closest(site.messages);

  function getMessages() {
    return [...document.querySelectorAll(site.messages)].filter(isOuter).map(toMessage);
  }

  function findMessage(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    let host = el?.closest(site.messages);
    while (host && !isOuter(host)) host = host.parentElement.closest(site.messages);
    if (!host) return null;
    const msg = toMessage(host);
    return msg.root.contains(el) ? msg : null;
  }

  // Liste aller sichtbaren Textknoten einer Nachricht mit ihrer Position im Gesamttext.
  function buildIndex(root) {
    const nodes = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const skipped = n.parentElement?.closest(SKIP_SELECTOR);
        return skipped && root.contains(skipped) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: text.length });
      text += walker.currentNode.data;
    }
    return { nodes, text };
  }

  function offsetOf(index, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      const entry = index.nodes.find((e) => e.node === container);
      if (entry) return entry.start + offset;
    }
    const point = document.createRange();
    point.setStart(container, offset);
    point.collapse(true);
    let pos = 0;
    for (const e of index.nodes) {
      if (point.comparePoint(e.node, 0) >= 0) break;
      pos = e.start + e.node.length;
    }
    return pos;
  }

  function wrapRange(index, start, end, hl) {
    const targets = [];
    for (const e of index.nodes) {
      const nodeEnd = e.start + e.node.length;
      if (nodeEnd <= start || e.start >= end) continue;
      targets.push({ node: e.node, from: Math.max(0, start - e.start), to: Math.min(e.node.length, end - e.start) });
    }
    for (const t of targets) {
      let node = t.node;
      if (!node.data.slice(t.from, t.to).trim()) continue;
      if (t.to < node.length) node.splitText(t.to);
      if (t.from > 0) node = node.splitText(t.from);
      const mark = h('mark', { class: `lm-mark lm-${hl.color}`, dataset: { lmId: hl.id } });
      node.parentNode.insertBefore(mark, node);
      mark.append(node);
    }
  }

  function unwrap(id) {
    document.querySelectorAll(`mark.lm-mark[data-lm-id="${id}"]`).forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      mark.remove();
      parent.normalize();
    });
  }

  // Sucht die gespeicherte Stelle; bei mehreren Treffern gewinnt der mit dem passendsten Text davor.
  function locate(text, hl) {
    let best = -1;
    let bestScore = -1;
    for (let i = text.indexOf(hl.text); i !== -1; i = text.indexOf(hl.text, i + 1)) {
      const before = text.slice(Math.max(0, i - hl.prefix.length), i);
      let score = 0;
      while (score < before.length && before[before.length - 1 - score] === hl.prefix[hl.prefix.length - 1 - score]) score++;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }

  function restoreAll() {
    const missing = state.highlights.filter((hl) => !document.querySelector(`mark.lm-mark[data-lm-id="${hl.id}"]`));
    if (!missing.length) return;
    const msgs = getMessages().map((m) => {
      const index = buildIndex(m.root);
      return { ...m, index, key: normKey(index.text) };
    });
    for (const hl of missing) {
      const msg = msgs.find((m) => m.role === hl.role && m.key === hl.msgKey);
      if (!msg) continue; // Nachricht noch nicht geladen (ältere Nachrichten kommen erst beim Hochscrollen)
      const pos = locate(msg.index.text, hl);
      if (pos < 0) continue;
      wrapRange(msg.index, pos, pos + hl.text.length, hl);
      msg.index = buildIndex(msg.root);
    }
  }

  // Läuft erst, wenn die Seite 400 ms ruhig ist – während eine Antwort gestreamt wird, also gar nicht.
  let restoreTimer;
  function scheduleRestore() {
    if (!state.highlights.length) return;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreAll, 400);
  }

  // ---------- Markieren ----------

  function makeHighlight(index, start, end, role) {
    return {
      id: uid(),
      text: index.text.slice(start, end),
      color: 'yellow',
      role,
      msgKey: normKey(index.text),
      prefix: index.text.slice(Math.max(0, start - 40), start),
      created: Date.now(),
    };
  }

  function removeHighlights(ids) {
    if (!ids.size) return;
    ids.forEach(unwrap);
    state.highlights = state.highlights.filter((x) => !ids.has(x.id));
    saveHighlights();
  }

  // Radierer: jede Markierung, die den Bereich [start, end) auch nur berührt, wird komplett entfernt.
  function eraseRange(msg, index, start, end) {
    const ids = new Set();
    for (const e of index.nodes) {
      if (e.start + e.node.length <= start || e.start >= end) continue;
      for (let p = e.node.parentElement; p && p !== msg.root; p = p.parentElement) {
        if (p.matches('mark.lm-mark')) ids.add(p.dataset.lmId);
      }
    }
    removeHighlights(ids);
  }

  function onMouseUp(e) {
    if (!state.active || e.button !== 0 || e.target.closest('.lm-ui')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const msg = findMessage(range.startContainer);
      if (!msg) return;
      const endMsg = findMessage(range.endContainer);
      if (!endMsg || endMsg.root !== msg.root) {
        toast('Bitte nur innerhalb einer Nachricht markieren.');
        return;
      }
      const index = buildIndex(msg.root);
      let start = offsetOf(index, range.startContainer, range.startOffset);
      let end = offsetOf(index, range.endContainer, range.endOffset);
      while (start < end && /\s/.test(index.text[start])) start++;
      while (end > start && /\s/.test(index.text[end - 1])) end--;
      sel.removeAllRanges();
      if (state.erasing) {
        if (end > start) eraseRange(msg, index, start, end);
        return;
      }
      if (end - start < 2) return;

      const hl = makeHighlight(index, start, end, msg.role);
      wrapRange(index, start, end, hl);
      state.highlights.push(hl);
      saveHighlights();
    }, 0);
  }

  // Mit dem Radierer reicht ein Klick auf eine Markierung.
  function onClick(e) {
    if (!state.active || !state.erasing) return;
    const mark = e.target.closest('mark.lm-mark');
    if (!mark || !window.getSelection().isCollapsed) return;
    e.preventDefault();
    e.stopPropagation();
    removeHighlights(new Set([mark.dataset.lmId]));
  }

  // ---------- Leiste ----------

  let bar;
  function buildBar() {
    if (bar) return bar;
    bar = h('div', { class: 'lm-ui lm-bar' },
      h('button', { class: 'lm-tool lm-pen', title: 'Textmarker', onclick: () => setErasing(false) }, '🖍️'),
      h('button', {
        class: 'lm-tool lm-eraser',
        title: 'Radierer: Markierung anklicken oder darüberziehen',
        onclick: () => setErasing(true),
      }, '🧽')
    );
    document.body.append(bar);
    return bar;
  }

  function updateTools() {
    bar?.querySelector('.lm-pen').classList.toggle('lm-selected', !state.erasing);
    bar?.querySelector('.lm-eraser').classList.toggle('lm-selected', state.erasing);
    document.documentElement.classList.toggle('lm-erasing', state.active && state.erasing);
  }

  function setErasing(erasing) {
    state.erasing = erasing;
    updateTools();
  }

  // Beim Einschalten ist immer der Textmarker aktiv, nicht der Radierer.
  function setActive(active) {
    state.active = active;
    state.erasing = false;
    chrome.storage.local.set({ lmActive: active });
    document.documentElement.classList.toggle('lm-active', active);
    buildBar().classList.toggle('lm-hidden', !active);
    updateTools();
    chrome.runtime.sendMessage({ type: 'state', active }).catch(() => {});
  }

  // ---------- Navigation innerhalb der Seite ----------

  async function onChatChange() {
    const oldKey = state.chatKey;
    const newKey = location.pathname;
    // Neuer Chat: die Chat-ID kommt erst nach der ersten Antwort – Markierungen mitnehmen.
    const carried = site.isDraft(oldKey) && !site.isDraft(newKey) ? state.highlights : [];
    state.chatKey = newKey;
    await loadHighlights();
    if (carried.length && !state.highlights.length) {
      state.highlights = carried;
      chrome.storage.local.remove(storeKey(oldKey));
      saveHighlights();
    }
    scheduleRestore();
  }

  // ---------- Start ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'toggle') return;
    setActive(!state.active);
    sendResponse({ active: state.active });
  });

  (async () => {
    const { lmActive } = await chrome.storage.local.get('lmActive');
    await loadHighlights();
    setActive(lmActive !== false);
    scheduleRestore();

    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);

    new MutationObserver(scheduleRestore).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(() => {
      if (location.pathname !== state.chatKey) onChatChange();
    }, 1000);
  })();
})();
