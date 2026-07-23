import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export function useMarkdown() {
  function renderMarkdown(md) {
    if (!md) return '';
    try {
      return DOMPurify.sanitize(marked.parse(String(md)), { USE_PROFILES: { html: true } });
    } catch {
      return `<pre>${String(md).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;
    }
  }
  return { renderMarkdown };
}
