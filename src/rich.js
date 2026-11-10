// 수식과 다이어그램 — 해당 내용이 있는 문서를 열 때만 불러온다

let katexReady;
function loadKatex() {
  katexReady ??= Promise.all([import("katex"), import("./fonts/katex.css")]).then(([m]) => m.default);
  return katexReady;
}

export async function renderMath(root) {
  const nodes = root.querySelectorAll(".math[data-tex]:not([data-done])");
  if (!nodes.length) return;
  const katex = await loadKatex();
  for (const el of nodes) {
    try {
      katex.render(el.dataset.tex, el, {
        displayMode: el.classList.contains("math-display"),
        throwOnError: false,
        output: "html",
      });
    } catch {
      el.classList.add("math-error");
    }
    el.dataset.done = "1";
  }
}

let mermaidReady;
function loadMermaid() {
  mermaidReady ??= import("mermaid").then((m) => m.default);
  return mermaidReady;
}

// 화면의 색 토큰을 읽어 다이어그램도 같은 톤으로
function themeVariables() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const dark = css.colorScheme === "dark" || document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  return {
    darkMode: dark,
    background: v("--bg"),
    fontFamily: v("--font-body"),
    fontSize: "14px",
    primaryColor: v("--code-bg"),
    primaryTextColor: v("--text"),
    primaryBorderColor: v("--faint"),
    secondaryColor: v("--bg-elev"),
    tertiaryColor: v("--bg-elev"),
    lineColor: v("--muted"),
    textColor: v("--text-soft"),
    noteBkgColor: v("--bg-elev"),
    noteTextColor: v("--text-soft"),
    noteBorderColor: v("--rule"),
    clusterBkg: v("--bg-elev"),
    clusterBorder: v("--rule"),
    edgeLabelBackground: v("--bg"),
  };
}

let seq = 0;
export async function renderDiagrams(root, { force = false } = {}) {
  const nodes = root.querySelectorAll(force ? ".diagram[data-src]" : ".diagram[data-src]:not([data-done])");
  if (!nodes.length) return;
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: themeVariables(),
  });
  for (const el of nodes) {
    const id = `mmd-${++seq}`;
    try {
      const { svg } = await mermaid.render(id, el.dataset.src);
      el.innerHTML = svg;
      el.classList.remove("diagram-error");
    } catch (e) {
      // 그리지 못하면 원문을 그대로 보여준다
      el.classList.add("diagram-error");
      el.title = String(e?.message ?? e);
      document.getElementById(`d${id}`)?.remove(); // mermaid가 남기는 오류 그림 정리
    }
    el.dataset.done = "1";
  }
}
