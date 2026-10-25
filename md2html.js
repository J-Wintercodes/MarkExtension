// Kleiner Markdown→HTML-Konverter für den HTML-Export (reine String-Verarbeitung, kein DOM).

function lmEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lmInline(s) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${lmEscape(c)}</code>`));
  s = s.replace(/\$\$([^$]+)\$\$/g, (m) => keep(lmEscape(m)));
  s = s.replace(/\$([^$\n]+)\$/g, (m) => keep(lmEscape(m)));
  s = lmEscape(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[i]);
}

function lmBuildList(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) {
      html += `</li></${stack.pop().tag}>`;
    }
    const tag = it.ordered ? 'ol' : 'ul';
    let top = stack[stack.length - 1];
    // Listentyp wechselt auf gleicher Ebene (z. B. Stichpunkte → Nummern): neue Liste beginnen.
    if (top && it.indent === top.indent && top.tag !== tag) {
      html += `</li></${stack.pop().tag}>`;
      top = null;
    }
    if (!top || it.indent > top.indent) {
      stack.push({ indent: it.indent, tag });
      html += `<${tag}><li>`;
    } else {
      html += '</li><li>';
    }
    html += lmInline(it.text);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

function lmSplitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function lmMarkdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${lmInline(para.join(' '))}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${lmEscape(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      flush();
      const math = [];
      while (++i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) math.push(lines[i]);
      out.push(`<div class="math">$$${lmEscape(math.join('\n'))}$$</div>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      out.push(`<h${level}>${lmInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${lmMarkdownToHtml(quote.join('\n'))}</blockquote>`);
      continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const head = lmSplitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lmSplitRow(lines[i++]));
      i--;
      out.push(
        '<table><thead><tr>' + head.map((c) => `<th>${lmInline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${lmInline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>'
      );
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (m) {
          items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i].trim();
        } else {
          break;
        }
        i++;
      }
      i--;
      out.push(lmBuildList(items));
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

function lmHtmlDocument(title, md) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${lmEscape(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})"></script>
<style>
  :root { --bg:#fbfaf7; --fg:#1d1d1f; --muted:#6b6b70; --line:#e4e1da; --accent:#5b4bdb; --mark:#fff1a8; --card:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#17171a; --fg:#ececef; --muted:#a0a0a8; --line:#33333a; --accent:#a99cff; --mark:#6b5d14; --card:#202024; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width: 820px; margin: 0 auto; padding: 48px 20px 80px; }
  h1 { font-size: 2rem; line-height:1.2; margin: 0 0 16px; }
  h2 { font-size: 1.35rem; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 2px solid var(--line); }
  h3 { font-size: 1.1rem; margin: 28px 0 8px; }
  blockquote { margin: 12px 0; padding: 10px 16px; background: var(--card); border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; }
  blockquote p { margin: 4px 0; }
  mark { background: var(--mark); color: inherit; padding: 0 2px; border-radius: 3px; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: .9em; background: var(--card); border:1px solid var(--line); padding: 1px 5px; border-radius: 4px; }
  pre { background: var(--card); border:1px solid var(--line); padding: 14px; border-radius: 8px; overflow-x: auto; }
  pre code { border: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; background: var(--card); }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border: 1px solid var(--line); }
  th { background: var(--line); }
  ul, ol { padding-left: 1.4em; }
  li { margin: 3px 0; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
  .math { overflow-x: auto; }
  footer { margin-top: 48px; color: var(--muted); font-size: .85rem; }
  @media print { body { background:#fff; color:#000; } main { padding: 0; } h2 { break-after: avoid; } }
</style>
</head>
<body>
<main>
${lmMarkdownToHtml(md)}
<footer>Erstellt mit Gemini Lernmodus · ${new Date().toLocaleString('de-DE')}</footer>
</main>
</body>
</html>`;
}
