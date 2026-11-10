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

/* ── 다이어그램 · 수식 코드 블록 ─────────────
   실제 그리기는 rich.js가 필요할 때만 불러와서 한다 */
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  const t = tokens[idx];
  const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
  if (lang === "mermaid") {
    return `<div class="diagram" data-src="${escapeHtml(t.content)}"><pre><code>${escapeHtml(t.content)}</code></pre></div>\n`;
  }
  if (lang === "math" || lang === "latex" || lang === "katex") {
    return `<div class="math math-display" data-tex="${escapeHtml(t.content.trim())}">${escapeHtml(t.content)}</div>\n`;
  }
  return defaultFence(tokens, idx, opts, env, self);
};

/* ── 수식: $...$ 와 $$...$$ ──────────────────── */
function mathInline(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== "$" || src[start + 1] === "$") return false;
  // 여는 $ 바로 뒤가 공백이면 수식이 아님 (예: "$ 5")
  if (/\s/.test(src[start + 1] ?? " ")) return false;
  // 바로 다음 $ 가 닫는 짝이어야 한다. 그 앞이 공백이면 금액 같은 일반 글로 본다 (예: "$5와 $10")
  let end = start + 1;
  while ((end = src.indexOf("$", end)) !== -1 && src[end - 1] === "\\") end++;
  if (end === -1 || /\s/.test(src[end - 1])) return false;
  // 닫는 $ 바로 뒤가 숫자면 금액일 가능성 (예: "$5와 $10")
  if (/\d/.test(src[end + 1] ?? "")) return false;
  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
}

function mathBlock(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  let firstLine = state.src.slice(pos + 2, max);
  let content;
  let line = startLine;
  if (firstLine.trim().endsWith("$$")) {
    content = firstLine.trim().slice(0, -2);
  } else {
    const lines = [firstLine];
    let found = false;
    while (++line < endLine) {
      pos = state.bMarks[line] + state.tShift[line];
      max = state.eMarks[line];
      const text = state.src.slice(pos, max);
      if (text.trim().endsWith("$$")) {
        lines.push(text.trim().slice(0, -2));
        found = true;
        break;
      }
      lines.push(state.src.slice(state.bMarks[line], max));
    }
    if (!found) return false;
    content = lines.join("\n");
  }
  if (silent) return true;
  const token = state.push("math_block", "", 0);
  token.content = content.trim();
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

md.inline.ruler.after("escape", "math_inline", mathInline);
md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
md.renderer.rules.math_inline = (tokens, idx) =>
  `<span class="math" data-tex="${escapeHtml(tokens[idx].content)}">${escapeHtml(tokens[idx].content)}</span>`;
md.renderer.rules.math_block = (tokens, idx) =>
  `<div class="math math-display" data-tex="${escapeHtml(tokens[idx].content)}">${escapeHtml(tokens[idx].content)}</div>\n`;

/* ── 콜아웃: > [!NOTE] ─────────────────────────
   GitHub 방식과 Obsidian 방식(> [!tip] 제목)을 함께 지원 */
const CALLOUTS = {
  note: "참고", info: "참고", abstract: "요약", summary: "요약",
  tip: "팁", hint: "팁", success: "팁",
  important: "중요", question: "질문",
  warning: "주의", attention: "주의",
  caution: "경고", danger: "경고", error: "경고", bug: "경고",
};
const KIND = {
  info: "note", abstract: "note", summary: "note", question: "important",
  hint: "tip", success: "tip", attention: "warning",
  danger: "caution", error: "caution", bug: "caution",
};

md.core.ruler.after("block", "callout", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== "blockquote_open" || tokens[i + 1].type !== "paragraph_open") continue;
    const inline = tokens[i + 2];
    const m = inline.content.match(/^\[!(\w+)\][+-]?[ \t]*([^\n]*)\n?/);
    if (!m || !CALLOUTS[m[1].toLowerCase()]) continue;
    const type = m[1].toLowerCase();
    const kind = KIND[type] ?? type;
    tokens[i].attrJoin("class", `callout callout-${kind}`);
    inline.content = inline.content.slice(m[0].length);
    const title = new state.Token("html_block", "", 0);
    title.content = `<div class="callout-title">${escapeHtml(m[2].trim() || CALLOUTS[type])}</div>\n`;
    tokens.splice(i + 1, 0, title);
    // 표식만 있던 첫 단락은 비워 둔다
    if (!inline.content.trim()) {
      tokens[i + 2].hidden = tokens[i + 4].hidden = true;
    }
  }
});

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
