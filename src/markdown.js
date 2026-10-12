import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js/lib/common";

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    const label = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    let body;
    if (lang && hljs.getLanguage(lang)) {
      body = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } else {
      body = escapeHtml(code);
    }
    return `<pre${label}><code class="hljs">${body}</code></pre>`;
  },
})
  .use(footnote)
  .use(taskLists, { enabled: false });

// 넓은 표가 본문을 밀어내지 않도록 감싸기
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";

function slugify(text) {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-") || "section"
  );
}

/** 마크다운을 HTML로 바꾸고, 목차용 제목 목록을 함께 돌려준다. */
export function renderMarkdown(src) {
  const tokens = md.parse(src, {});
  const headings = [];
  const used = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    const level = Number(t.tag.slice(1));
    const text = tokens[i + 1].children
      .filter((c) => c.type === "text" || c.type === "code_inline")
      .map((c) => c.content)
      .join("");
    let id = slugify(text);
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    t.attrSet("id", id);
    if (level <= 4) headings.push({ level, text, id });
  }

  return { html: md.renderer.render(tokens, md.options, {}), headings };
}
