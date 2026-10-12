import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./fonts/noto-serif-kr-600.css";
import "./style.css";
import { renderMarkdown } from "./markdown.js";

const isTauri = "__TAURI_INTERNALS__" in window;
const tauri = isTauri
  ? {
      core: await import("@tauri-apps/api/core"),
      event: await import("@tauri-apps/api/event"),
      webview: await import("@tauri-apps/api/webview"),
      window: await import("@tauri-apps/api/window"),
      dialog: await import("@tauri-apps/plugin-dialog"),
      opener: await import("@tauri-apps/plugin-opener"),
    }
  : null;

const $ = (id) => document.getElementById(id);
const app = $("app");
const reader = $("reader");
const doc = $("doc");
const tocNav = $("toc-nav");
const docName = $("doc-name");
const progress = $("progress");

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;
const state = { path: null, headings: [] };

/* ── 저장되는 설정 ─────────────────────────── */
const store = {
  get(k, d) {
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
};

function applyTheme(mode) {
  app.dataset.themeMode = mode;
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  store.set("theme", mode);
}
function cycleTheme() {
  const order = ["system", "light", "dark"];
  const next = order[(order.indexOf(app.dataset.themeMode) + 1) % order.length];
  applyTheme(next);
  toast({ system: "시스템 설정을 따릅니다", light: "밝은 테마", dark: "어두운 테마" }[next]);
}

let fontSize = Number(store.get("fontSize", 17));
function setFontSize(px) {
  fontSize = Math.min(24, Math.max(13, px));
  document.documentElement.style.setProperty("--fs", `${fontSize}px`);
  store.set("fontSize", fontSize);
}

function toggleToc() {
  const narrow = window.matchMedia("(max-width: 860px)").matches;
  const cls = narrow ? "toc-open" : "toc-hidden";
  app.classList.toggle(cls);
  if (!narrow) store.set("tocHidden", app.classList.contains("toc-hidden") ? "1" : "0");
}

/* ── 알림 ──────────────────────────────────── */
let toastTimer;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

/* ── 경로 도우미 ───────────────────────────── */
const sepOf = (p) => (p.includes("\\") ? "\\" : "/");
const dirname = (p) => p.slice(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")));
const basename = (p) => p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);

function resolvePath(base, rel) {
  const sep = sepOf(base);
  const parts = `${base}${sep}${rel}`.split(/[\\/]+/);
  const out = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  const joined = out.join(sep);
  return base.startsWith("/") && !joined.startsWith("/") ? `/${joined}` : joined;
}

const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href);
const isAbsoluteLocal = (href) => /^[a-z]:[\\/]/i.test(href) || href.startsWith("/");

/* ── 렌더링 ───────────────────────────────── */
function render(source, path, { keepScroll = false } = {}) {
  const ratio = reader.scrollTop / Math.max(1, reader.scrollHeight - reader.clientHeight);
  const { html, headings } = renderMarkdown(source);

  doc.innerHTML = html;
  app.classList.remove("welcome-mode");
  if (!keepScroll) {
    // 새 문서일 때만 살짝 떠오르는 효과
    doc.style.animation = "none";
    void doc.offsetWidth;
    doc.style.animation = "";
  }

  if (path && isTauri) fixImages(path);
  buildToc(headings);

  state.path = path;
  state.headings = headings;
  const name = path ? basename(path) : "";
  docName.textContent = name;
  document.title = name ? `${name} — MD Viewer` : "MD Viewer";
  if (isTauri) tauri.window.getCurrentWindow().setTitle(document.title).catch(() => {});

  reader.style.scrollBehavior = "auto";
  reader.scrollTop = keepScroll ? ratio * (reader.scrollHeight - reader.clientHeight) : 0;
  reader.style.scrollBehavior = "";
  onScroll();
}

function fixImages(path) {
  const base = dirname(path);
  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (isExternal(src) || src.startsWith("data:")) continue;
    let local = decodeURI(src.split(/[?#]/)[0]);
    local = isAbsoluteLocal(local) ? local : resolvePath(base, local);
    img.src = tauri.core.convertFileSrc(local);
  }
}

function buildToc(headings) {
  // 제목이 하나뿐이면(보통 문서 제목) 목차로서 의미가 적으니 h1은 여러 개일 때만 보여준다
  const h1s = headings.filter((h) => h.level === 1).length;
  const list = h1s > 1 ? headings : headings.filter((h) => h.level > 1);
  const minLevel = Math.min(...list.map((h) => h.level));

  tocNav.innerHTML = "";
  if (!list.length) {
    tocNav.innerHTML = `<div class="toc-empty">제목이 없는 문서입니다</div>`;
    return;
  }
  for (const h of list) {
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.text;
    a.dataset.id = h.id;
    a.className = `lv-${h.level - minLevel + 2}`;
    tocNav.append(a);
  }
}

/* ── 스크롤: 진행 막대 + 목차 위치 ─────────── */
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const max = reader.scrollHeight - reader.clientHeight;
    progress.style.width = max > 0 ? `${(reader.scrollTop / max) * 100}%` : "0";

    const links = tocNav.querySelectorAll("a");
    if (!links.length) return;
    const top = reader.getBoundingClientRect().top + 80;
    let current = null;
    for (const a of links) {
      const el = document.getElementById(a.dataset.id);
      if (el && el.getBoundingClientRect().top <= top) current = a;
      else break;
    }
    if (reader.scrollTop >= max - 2) current = links[links.length - 1];
    for (const a of links) a.classList.toggle("active", a === current);
    if (current) current.scrollIntoView({ block: "nearest" });
  });
}
reader.addEventListener("scroll", onScroll, { passive: true });

/* ── 파일 열기 ─────────────────────────────── */
async function openPath(path, opts) {
  try {
    const text = await tauri.core.invoke("read_markdown", { path });
    render(text, path, opts);
    if (!opts?.keepScroll) {
      store.set("lastDir", dirname(path));
      tauri.core.invoke("watch_file", { path }).catch(() => {});
    }
  } catch (e) {
    toast(`열 수 없습니다: ${e}`);
  }
}

async function openDialog() {
  if (!isTauri) return browserPick();
  const picked = await tauri.dialog.open({
    multiple: false,
    directory: false,
    defaultPath: store.get("lastDir", undefined),
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mdx", "txt"] }],
  });
  if (picked) openPath(picked);
}

// 브라우저에서 미리보기할 때(개발용)
function browserPick() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: ".md,.markdown,.txt" });
  input.onchange = async () => input.files[0] && render(await input.files[0].text(), input.files[0].name);
  input.click();
}

/* ── 링크 클릭 ─────────────────────────────── */
doc.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const href = a.getAttribute("href");
  if (href.startsWith("#")) {
    e.preventDefault();
    const el = document.getElementById(decodeURIComponent(href.slice(1)));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  e.preventDefault();
  if (!isTauri) return window.open(href, "_blank");
  if (isExternal(href)) {
    tauri.opener.openUrl(href).catch(() => {});
    return;
  }
  if (!state.path) return;
  const clean = decodeURI(href.split("#")[0]);
  const target = isAbsoluteLocal(clean) ? clean : resolvePath(dirname(state.path), clean);
  if (MD_EXT.test(target)) openPath(target);
  else tauri.opener.openPath(target).catch(() => toast("열 수 없는 링크입니다"));
});

tocNav.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  document.getElementById(a.dataset.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ── 단축키 ───────────────────────────────── */
window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  const actions = {
    o: openDialog,
    d: cycleTheme,
    "\\": toggleToc,
    "=": () => setFontSize(fontSize + 1),
    "+": () => setFontSize(fontSize + 1),
    "-": () => setFontSize(fontSize - 1),
    0: () => setFontSize(17),
    r: () => state.path && isTauri && openPath(state.path, { keepScroll: true }),
  };
  if (actions[k]) {
    e.preventDefault();
    actions[k]();
  }
});

$("btn-open").addEventListener("click", openDialog);
$("btn-theme").addEventListener("click", cycleTheme);
$("btn-toc").addEventListener("click", toggleToc);

/* ── 드래그 앤 드롭 ───────────────────────── */
const overlay = $("drop-overlay");
if (isTauri) {
  tauri.webview.getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "over") overlay.classList.add("show");
    else overlay.classList.remove("show");
    if (payload.type === "drop") {
      const file = payload.paths.find((p) => MD_EXT.test(p));
      if (file) openPath(file);
      else if (payload.paths.length) toast("마크다운 파일만 열 수 있습니다");
    }
  });
} else {
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    overlay.classList.add("show");
  });
  window.addEventListener("dragleave", (e) => !e.relatedTarget && overlay.classList.remove("show"));
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    overlay.classList.remove("show");
    const f = e.dataTransfer.files[0];
    if (f) render(await f.text(), f.name);
  });
}

/* ── 파일이 바뀌면 자동 새로고침 ──────────── */
if (isTauri) {
  let reloadTimer;
  tauri.event.listen("file-changed", ({ payload }) => {
    if (payload !== state.path) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => openPath(state.path, { keepScroll: true }), 120);
  });
}

/* ── 첫 화면 ──────────────────────────────── */
function showWelcome() {
  state.path = null;
  app.classList.add("welcome-mode");
  doc.innerHTML = `
    <section class="welcome">
      <h1 class="mark">읽기 좋은<br>마크다운<span>.</span></h1>
      <p class="lead">문서를 이 창에 끌어다 놓거나, 파일을 직접 여세요.</p>
      <button class="open-btn" id="welcome-open">파일 열기</button>
      <div class="keys">
        <kbd>Ctrl O</kbd><span>파일 열기</span>
        <kbd>Ctrl \\</kbd><span>목차 보이기 · 숨기기</span>
        <kbd>Ctrl D</kbd><span>테마 전환</span>
        <kbd>Ctrl + / -</kbd><span>글자 크기</span>
      </div>
    </section>`;
  $("welcome-open").addEventListener("click", openDialog);
  tocNav.innerHTML = "";
  docName.textContent = "";
}

/* ── 시작 ─────────────────────────────────── */
applyTheme(store.get("theme", "system"));
setFontSize(fontSize);
if (store.get("tocHidden", "0") === "1") app.classList.add("toc-hidden");

const initial = isTauri ? await tauri.core.invoke("initial_file").catch(() => null) : null;
if (initial) openPath(initial);
else showWelcome();
