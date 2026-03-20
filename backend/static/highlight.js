// ─── SYNTAX HIGHLIGHTER ───────────────────────────────────────────────────────
// Plain mode - no color highlighting, just clean escaped code

const SyntaxHL = {
  highlight(code, lang) {
    // Just escape HTML - no coloring
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  applyToContainer(container) {
    container.querySelectorAll('pre.code-block code, pre code').forEach(block => {
      const rawCode = block.innerText || block.textContent || '';
      if (rawCode.trim()) {
        const pre = block.parentElement;
        const lang = pre?.dataset?.lang || '';
        block.innerHTML = this.highlight(rawCode, lang);
      }
    });
  }
};

window.SyntaxHL = SyntaxHL;
