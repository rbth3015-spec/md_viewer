import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// 원문에서도 구조가 보이도록: 기호는 옅게, 제목·강조는 본문 톤 그대로
const mdStyle = HighlightStyle.define([
  { tag: t.heading, color: "var(--text)", fontWeight: "650" },
  { tag: t.heading1, fontSize: "1.18em" },
  { tag: t.heading2, fontSize: "1.08em" },
  { tag: t.strong, color: "var(--text)", fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
  { tag: t.processingInstruction, color: "var(--faint)" },
  { tag: t.contentSeparator, color: "var(--faint)" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.92em", color: "var(--text)" },
  { tag: t.list, color: "var(--text-soft)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--text-soft)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-body)",
    fontSize: "calc(var(--fs) * 0.9)",
    lineHeight: "1.8",
    padding: "48px 0 40vh",
  },
  ".cm-content": { maxWidth: "40rem", margin: "0 auto", padding: "0 36px", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "1.5px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--accent-soft)" },
  ".cm-placeholder": { color: "var(--faint)" },
  ".cm-panels": { backgroundColor: "var(--bg-elev)", color: "var(--text)", borderColor: "var(--rule)" },
  ".cm-panels input, .cm-panels button": { fontFamily: "var(--font-body)" },
  ".cm-searchMatch": { backgroundColor: "var(--mark)" },
});

/** 편집기를 만든다. onChange(text)는 내용이 바뀔 때마다 불린다. */
export function createEditor(parent, { text, onChange, onScroll }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        markdown(),
        syntaxHighlighting(mdStyle),
        placeholder("여기에 쓰기 시작하세요"),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
      ],
    }),
  });
  view.scrollDOM.addEventListener("scroll", () => onScroll(view.scrollDOM), { passive: true });

  return {
    view,
    getText: () => view.state.doc.toString(),
    // 바깥에서 내용을 바꿀 때(다시 읽기 등) 커서 위치는 최대한 유지
    setText(next) {
      const head = Math.min(view.state.selection.main.head, next.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: head },
      });
    },
    focus: () => view.focus(),
  };
}
