// ─── QA WIKI RICH TEXT EDITOR ─────────────────────────────────────────────────
// Two modes only: Markdown (write) and Preview (read)

const Editor = {
  el: null, mdArea: null, previewEl: null,
  onChange: null, mode: 'markdown',
  _token: null,

  init(containerId, initialContent, onChange, token) {
    this.onChange = onChange;
    this._token = token;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="rte-wrap">
        <div class="rte-toolbar" id="rte-toolbar">
          <div class="rte-toolbar-group">
            <button class="rte-btn rte-btn-active" id="rte-mode-markdown" title="Markdown">&#9998; Markdown</button>
            <button class="rte-btn" id="rte-mode-preview" title="Preview">&#128065; Preview</button>
          </div>
          <div class="rte-divider"></div>
          <div class="rte-toolbar-group" id="md-toolbar-btns">
            <button class="rte-btn" data-insert="**text**" title="Bold"><b>B</b></button>
            <button class="rte-btn" data-insert="*text*" title="Italic"><i>I</i></button>
            <button class="rte-btn" data-insert="~~text~~" title="Strikethrough"><s>S</s></button>
            <div class="rte-divider"></div>
            <button class="rte-btn" data-insert="# " data-line="true" title="Heading 1">H1</button>
            <button class="rte-btn" data-insert="## " data-line="true" title="Heading 2">H2</button>
            <button class="rte-btn" data-insert="### " data-line="true" title="Heading 3">H3</button>
            <div class="rte-divider"></div>
            <button class="rte-btn" data-insert="- " data-line="true" title="Bullet list">&#8226; List</button>
            <button class="rte-btn" data-insert="1. " data-line="true" title="Numbered list">1. List</button>
            <button class="rte-btn" data-insert="- [ ] " data-line="true" title="Checklist">&#9745; Check</button>
            <button class="rte-btn" data-insert="> " data-line="true" title="Blockquote">&#10077; Quote</button>
            <div class="rte-divider"></div>
            <button class="rte-btn" id="rte-inline-code-btn" title="Inline code">&lt;code&gt;</button>
            <button class="rte-btn" id="rte-codeblock-btn" title="Code block">{} Block</button>
            <button class="rte-btn" id="rte-table-btn" title="Insert table">&#9776; Table</button>
            <button class="rte-btn" data-insert="---" data-line="true" title="Divider">&#8212; Line</button>
            <button class="rte-btn" id="rte-link-btn" title="Insert link">&#128279; Link</button>
            <button class="rte-btn" id="rte-img-btn" title="Upload image">&#128247; Image</button>
          </div>
        </div>

        <div class="rte-panels">
          <div class="rte-panel" id="rte-panel-markdown">
            <textarea class="rte-markdown-area" id="rte-markdown" spellcheck="true" placeholder="Write in Markdown...

# Heading 1
## Heading 2

**bold**, *italic*, \`inline code\`

- bullet list
1. numbered list
- [ ] checkbox

\`\`\`robot
*** Test Cases ***
My Test
    Log    Hello
\`\`\`

| Col 1 | Col 2 |
| --- | --- |
| Cell | Cell |"></textarea>
          </div>
          <div class="rte-panel" id="rte-panel-preview" style="display:none">
            <div class="rte-preview-body article-content" id="rte-preview-content"></div>
          </div>
        </div>

        <div class="rte-statusbar">
          <span id="rte-wordcount">0 words</span>
          <span id="rte-charcount">0 chars</span>
          <span id="rte-img-status" style="margin-left:auto;color:var(--green);display:none"></span>
        </div>
      </div>
      <input type="file" id="rte-file-input" accept="image/*" style="display:none">
    `;

    this.mdArea = document.getElementById('rte-markdown');
    this.previewEl = document.getElementById('rte-preview-content');
    this.mode = 'markdown';

    // Set initial content
    this.mdArea.value = initialContent || '';
    this.updateWordCount();
    this.bindToolbar();
    this.bindEditor();
  },

  bindToolbar() {
    // Mode toggle
    document.getElementById('rte-mode-markdown')?.addEventListener('click', () => this.setMode('markdown'));
    document.getElementById('rte-mode-preview')?.addEventListener('click', () => this.setMode('preview'));

    // Insert/wrap buttons
    document.querySelectorAll('.rte-btn[data-insert]').forEach(btn => {
      btn.addEventListener('click', () => {
        const insert = btn.dataset.insert;
        const isLine = btn.dataset.line === 'true';
        const ta = this.mdArea;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;

        if (isLine) {
          // Insert at beginning of current line
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          ta.value = val.slice(0, lineStart) + insert + val.slice(lineStart);
          ta.selectionStart = ta.selectionEnd = lineStart + insert.length + (start - lineStart);
        } else {
          const selected = val.slice(start, end) || insert.replace(/\*/g,'').replace(/~/g,'') || 'text';
          ta.value = val.slice(0, start) + insert.replace('text', selected) + val.slice(end);
          ta.selectionStart = start;
          ta.selectionEnd = start + insert.replace('text', selected).length;
        }
        ta.focus();
        this.triggerChange();
        this.updateWordCount();
      });
    });

    // Inline code button (backtick wrap)
    document.getElementById('rte-inline-code-btn')?.addEventListener('click', () => {
      const ta = this.mdArea;
      if (!ta) return;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const selected = ta.value.slice(start, end) || 'code';
      const wrapped = '`' + selected + '`';
      ta.value = ta.value.slice(0, start) + wrapped + ta.value.slice(end);
      ta.selectionStart = start + 1;
      ta.selectionEnd = start + 1 + selected.length;
      ta.focus();
      this.triggerChange();
    });

    // Code block
    document.getElementById('rte-codeblock-btn')?.addEventListener('click', async () => {
      const lang = await (window.showPrompt ? window.showPrompt({
        title: 'Code Block',
        message: 'Enter language (python, javascript, robot, bash, sql...)',
        placeholder: 'robot',
        defaultValue: 'robot',
        confirmText: 'Insert'
      }) : Promise.resolve(prompt('Language:', 'robot')));
      if (lang === null) return;
      const ta = this.mdArea;
      const start = ta.selectionStart;
      const selected = ta.value.slice(start, ta.selectionEnd);
      const block = '\n```' + (lang||'') + '\n' + (selected || '# Your code here') + '\n```\n';
      ta.value = ta.value.slice(0, start) + block + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = start + block.length;
      ta.focus();
      this.triggerChange();
    });

    // Table
    document.getElementById('rte-table-btn')?.addEventListener('click', async () => {
      const rows = await (window.showPrompt ? window.showPrompt({
        title: 'Insert Table', message: 'Number of rows (including header):',
        defaultValue: '3', confirmText: 'Next'
      }) : Promise.resolve('3'));
      if (rows === null) return;
      const cols = await (window.showPrompt ? window.showPrompt({
        title: 'Insert Table', message: 'Number of columns:',
        defaultValue: '3', confirmText: 'Insert'
      }) : Promise.resolve('3'));
      if (cols === null) return;
      const r = parseInt(rows) || 3, c = parseInt(cols) || 3;
      let table = '\n| ' + Array(c).fill('Column').map((v,i) => v + (i+1)).join(' | ') + ' |\n';
      table += '| ' + Array(c).fill('---').join(' | ') + ' |\n';
      for (let i = 0; i < r - 1; i++) {
        table += '| ' + Array(c).fill('Cell').join(' | ') + ' |\n';
      }
      table += '\n';
      const ta = this.mdArea;
      const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + table + ta.value.slice(pos);
      ta.selectionStart = ta.selectionEnd = pos + table.length;
      ta.focus();
      this.triggerChange();
    });

    // Link
    document.getElementById('rte-link-btn')?.addEventListener('click', async () => {
      const url = await (window.showPrompt ? window.showPrompt({
        title: 'Insert Link', placeholder: 'https://example.com',
        defaultValue: 'https://', confirmText: 'Insert'
      }) : Promise.resolve(prompt('URL:', 'https://')));
      if (!url) return;
      const ta = this.mdArea;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const text = ta.value.slice(start, end) || 'link text';
      const md = '[' + text + '](' + url + ')';
      ta.value = ta.value.slice(0, start) + md + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + md.length;
      ta.focus();
      this.triggerChange();
    });

    // Image upload
    document.getElementById('rte-img-btn')?.addEventListener('click', () => {
      document.getElementById('rte-file-input')?.click();
    });
    document.getElementById('rte-file-input')?.addEventListener('change', e => {
      const files = Array.from(e.target.files || []);
      files.forEach(f => this.uploadImageFile(f));
      e.target.value = '';
    });
  },

  bindEditor() {
    this.mdArea?.addEventListener('input', () => {
      this.updateWordCount();
      this.triggerChange();
    });

    // Paste image support
    this.mdArea?.addEventListener('paste', async e => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (file) await this.uploadImageFile(file);
      }
    });

    // Tab key = indent
    this.mdArea?.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = this.mdArea;
        const start = ta.selectionStart;
        ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = start + 2;
        this.triggerChange();
      }
    });
  },

  setMode(mode) {
    this.mode = mode;
    const mdPanel = document.getElementById('rte-panel-markdown');
    const previewPanel = document.getElementById('rte-panel-preview');
    const btnMd = document.getElementById('rte-mode-markdown');
    const btnPr = document.getElementById('rte-mode-preview');
    const toolbarBtns = document.getElementById('md-toolbar-btns');

    if (mode === 'markdown') {
      mdPanel.style.display = '';
      previewPanel.style.display = 'none';
      btnMd.classList.add('rte-btn-active');
      btnPr.classList.remove('rte-btn-active');
      if (toolbarBtns) toolbarBtns.style.display = '';
      this.mdArea?.focus();
    } else {
      mdPanel.style.display = 'none';
      previewPanel.style.display = '';
      btnMd.classList.remove('rte-btn-active');
      btnPr.classList.add('rte-btn-active');
      if (toolbarBtns) toolbarBtns.style.display = 'none';
      this.updatePreview();
    }
  },

  updatePreview() {
    if (!this.previewEl) return;
    const md = this.mdArea?.value || '';
    this.previewEl.innerHTML = renderMarkdownFull(md);
    setTimeout(() => {
      if (window.SyntaxHL) SyntaxHL.applyToContainer(this.previewEl);
      if (window.addCopyButtons) addCopyButtons(this.previewEl);
    }, 50);
  },

  async uploadImageFile(file) {
    if (!file.type.startsWith('image/')) { toast('Only image files allowed', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('Image too large (max 8MB)', 'error'); return; }
    this.showImgStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (this._token) headers['X-Auth-Token'] = this._token;
    try {
      const resp = await fetch('/api/uploads/image', { method: 'POST', headers, body: formData, credentials: 'include' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      const ta = this.mdArea;
      const pos = ta.selectionStart;
      const md = '\n![' + (data.filename || 'image') + '](' + data.url + ')\n';
      ta.value = ta.value.slice(0, pos) + md + ta.value.slice(pos);
      ta.selectionStart = ta.selectionEnd = pos + md.length;
      this.showImgStatus('Image uploaded!');
      this.triggerChange();
    } catch(err) {
      this.showImgStatus('Upload failed: ' + err.message, true);
      toast('Image upload failed: ' + err.message, 'error');
    }
  },

  showImgStatus(msg, isError = false) {
    const el = document.getElementById('rte-img-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--red)' : 'var(--green)';
    el.style.display = 'inline';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  },

  updateWordCount() {
    const text = this.mdArea?.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const el1 = document.getElementById('rte-wordcount');
    const el2 = document.getElementById('rte-charcount');
    if (el1) el1.textContent = words + ' word' + (words !== 1 ? 's' : '');
    if (el2) el2.textContent = text.length + ' chars';
  },

  getValue() {
    return this.mdArea?.value || '';
  },

  triggerChange() {
    if (this.onChange) this.onChange(this.getValue());
  }
};

// ─── MARKDOWN → HTML (for Preview + Article Reader) ──────────────────────────
function renderMarkdownFull(md) {
  if (!md || !md.trim()) return '<p style="color:var(--text4);font-style:italic">Nothing to preview yet...</p>';

  // Step 0: Normalize line endings (Windows CRLF → LF)
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip standalone digit-only lines (orphaned line numbers from old editor)
  md = md.replace(/^(\d+)\s*$/gm, '');

  // Strip leading "N " (digit space) from lines inside code blocks that got corrupted
  // e.g. "0 install robotframework" → "install robotframework"
  // BUT only when outside code fences to avoid modifying real content
  const fenceRanges = [];
  let fenceMatch;
  const fenceRx = /```[\s\S]*?```/g;
  while ((fenceMatch = fenceRx.exec(md)) !== null) {
    fenceRanges.push([fenceMatch.index, fenceMatch.index + fenceMatch[0].length]);
  }
  md = md.split('\n').map((line, lineIdx) => {
    const pos = md.split('\n').slice(0, lineIdx).join('\n').length + lineIdx;
    const inFence = fenceRanges.some(([s, e]) => pos >= s && pos <= e);
    if (!inFence && /^\d+ \S/.test(line)) {
      return line.replace(/^\d+ /, '');
    }
    return line;
  }).join('\n');

  // Step 1: Protect code blocks first (before any escaping)
  const codeBlocks = [];
  let html = md.replace(/```([\w-]*)\r?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = codeBlocks.length;
    // Escape HTML inside code blocks only
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    codeBlocks.push('<pre class="code-block" data-lang="' + (lang||'') + '"><code>' + escaped.replace(/^\n|\n$/g,'') + '</code></pre>');
    return '\x00CODE' + i + '\x00';
  });

  // Step 2: Protect inline code
  const inlineCodes = [];
  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const i = inlineCodes.length;
    const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    inlineCodes.push('<code>' + escaped + '</code>');
    return '\x00IC' + i + '\x00';
  });

  // Step 3: Escape remaining HTML
  html = html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Step 4: Images (before links)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;margin:8px 0;display:block">');

  // Step 5: Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Step 6: Headings (must be at start of line)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Step 7: Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Step 8: HR
  html = html.replace(/^---+$/gm, '<hr>');

  // Step 9: Bold / italic / strikethrough (order matters — longest first)
  html = html.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/gs, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/gs, '<s>$1</s>');

  // Step 10: Checklists (before bullets)
  html = html.replace(/^- \[x\] (.+)$/gim, '<div class="checklist-item done"><input type="checkbox" checked disabled> <span>$1</span></div>');
  html = html.replace(/^- \[ \] (.+)$/gim, '<div class="checklist-item"><input type="checkbox" disabled> <span>$1</span></div>');

  // Step 11: Tables
  html = html.replace(/^\|(.+)\|[ \t]*\r?\n\|[ \t]*[-:| \t]+\|[ \t]*\r?\n((?:\|.+\|[ \t]*\r?\n?)+)/gm, (_, header, body) => {
    const ths = header.split('|').map(c => c.trim()).filter(Boolean).map(c => '<th>' + c + '</th>').join('');
    const trs = body.trim().split('\n').map(row => {
      const tds = row.split('|').map(c => c.trim()).filter(Boolean).map(c => '<td>' + c + '</td>').join('');
      return '<tr>' + tds + '</tr>';
    }).join('');
    return '<table class="rte-table"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
  });

  // Step 12: Unordered lists — group consecutive bullet lines
  html = html.replace(/((?:^- .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .filter(l => /^- /.test(l.trim()))
      .map(l => '<li>' + l.trim().replace(/^- /, '') + '</li>').join('');
    return '<ul>' + items + '</ul>\n';
  });

  // Step 13: Ordered lists — group consecutive numbered lines
  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, match => {
    const items = match.trim().split('\n')
      .filter(l => /^\d+\. /.test(l.trim()))
      .map(l => '<li>' + l.trim().replace(/^\d+\. /, '') + '</li>').join('');
    return '<ol>' + items + '</ol>\n';
  });

  // Step 14: Paragraphs — split on blank lines, wrap plain text only
  const BLOCK = /^<(h[1-6]|ul|ol|pre|blockquote|table|hr|div|img|figure|p|checklist)[\s>\/]/i;
  html = html.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return '';
    if (BLOCK.test(block)) return block;
    if (block.startsWith('\x00CODE')) return block;
    if (block.startsWith('<div class="checklist')) return block;
    // Single newlines → <br> inside paragraph
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  // Step 15: Restore protected blocks
  codeBlocks.forEach((v, i) => { html = html.split('\x00CODE' + i + '\x00').join(v); });
  inlineCodes.forEach((v, i) => { html = html.split('\x00IC' + i + '\x00').join(v); });

  return html;
}

// Fallback if showPrompt not loaded yet
if (!window.showPrompt) {
  window.showPrompt = ({ title, defaultValue = '', placeholder = '' }) =>
    Promise.resolve(window.prompt(title, defaultValue));
}

window.Editor = Editor;
window.renderMarkdownFull = renderMarkdownFull;
