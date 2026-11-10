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
const filesNav = $("files-nav");
const tabbar = $("tabbar");
const docName = $("doc-name");
const progress = $("progress");

const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

/* ── 탭 ────────────────────────────────────────
   saved: 디스크에 있는 내용, text: 지금 화면의 내용(편집 중이면 다를 수 있음) */
const tabs = [];
let active = -1;
let tabSeq = 0;
const cur = () => tabs[active] ?? null;
const isDirty = (t) => !!t && t.text !== t.saved;
const makeTab = (path, text) => ({ id: ++tabSeq, path, saved: text, text, scroll: 0, editing: false, cm: null });
let editor = null;

/* ── 저장되는 설정 ─────────────────────────── */
const store = {
  get(k, d) {
    try { return localStorage.getItem(k) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch {}
  },
  json(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
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
  redrawDiagrams();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => redrawDiagrams());

let fontSize = Number(store.get("fontSize", 17));
function setFontSize(px) {
  fontSize = Math.min(24, Math.max(13, px));
  document.documentElement.style.setProperty("--fs", `${fontSize}px`);
  store.set("fontSize", fontSize);
}

function toggleToc() {
  const narrow = matchMedia("(max-width: 860px)").matches;
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

async function ask(msg, okLabel = "버리기") {
  if (!isTauri) return window.confirm(msg);
  return tauri.dialog.ask(msg, { title: "MD Viewer", kind: "warning", okLabel, cancelLabel: "취소" });
}

/* ── 경로 도우미 ───────────────────────────── */
const sepOf = (p) => (p.includes("\\") ? "\\" : "/");
const dirname = (p) => p.slice(0, Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")));
const basename = (p) => p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
// 윈도우 경로는 대소문자를 구분하지 않는다
const samePath = (a, b) => !!a && !!b && (a.includes("\\") ? a.toLowerCase() === b.toLowerCase() : a === b);

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
// scroll: "top" | "keep"(같은 비율 유지) | 숫자(픽셀)
function renderDoc({ scroll = "top", animate = false } = {}) {
  const tab = cur();
  if (!tab) return;
  const ratio = reader.scrollTop / Math.max(1, reader.scrollHeight - reader.clientHeight);
  const { html, headings } = renderMarkdown(tab.text);

  doc.innerHTML = html;
  app.classList.remove("welcome-mode");
  if (animate) {
    doc.style.animation = "none";
    void doc.offsetWidth;
    doc.style.animation = "";
  }

  if (tab.path && isTauri) fixImages(tab.path);
  decorate();
  buildToc(headings);

  reader.style.scrollBehavior = "auto";
  if (scroll === "keep") reader.scrollTop = ratio * (reader.scrollHeight - reader.clientHeight);
  else reader.scrollTop = scroll === "top" ? 0 : scroll;
  reader.style.scrollBehavior = "";
  onScroll();

  renderRich();
  if (find.open) runFind({ keepIndex: true });
}

// 수식·다이어그램이 있을 때만 해당 부품을 불러온다
let richModule;
async function renderRich() {
  const hasMath = doc.querySelector(".math[data-tex]");
  const hasDiagram = doc.querySelector(".diagram[data-src]");
  if (!hasMath && !hasDiagram) return;
  richModule ??= await import("./rich.js");
  if (hasMath) await richModule.renderMath(doc);
  if (hasDiagram) await richModule.renderDiagrams(doc);
}
function redrawDiagrams() {
  if (richModule && doc.querySelector(".diagram")) richModule.renderDiagrams(doc, { force: true });
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

const COPY_ICON =
  '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></svg>';

// 코드 블록마다 복사 버튼 (마우스를 올렸을 때만 보임)
function decorate() {
  for (const pre of doc.querySelectorAll("pre")) {
    if (pre.closest(".diagram")) continue;
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    pre.replaceWith(wrap);
    wrap.append(pre);
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.title = "복사";
    btn.innerHTML = `${COPY_ICON}<span>복사</span>`;
    wrap.append(btn);
  }
}

function buildToc(headings) {
  // 제목이 하나뿐이면(보통 문서 제목) 목차로서 의미가 적으니 h1은 여러 개일 때만 보여준다
  const h1s = headings.filter((h) => h.level === 1).length;
  const list = h1s > 1 ? headings : headings.filter((h) => h.level > 1);
  const minLevel = Math.min(...list.map((h) => h.level));

  tocNav.innerHTML = "";
  if (!list.length) {
    tocNav.innerHTML = `<div class="side-empty">제목이 없는 문서입니다</div>`;
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

/* ── 화면 테두리: 제목, 탭 줄, 편집 표시 ──── */
const tabName = (t) => (t.path ? basename(t.path) : t.label ?? "제목 없음");

function updateChrome() {
  const tab = cur();
  const name = tab ? tabName(tab) : "";
  const dirty = isDirty(tab);
  docName.textContent = name;
  docName.title = tab?.path ?? "";
  docName.classList.toggle("dirty", dirty);
  document.title = name ? `${dirty ? "● " : ""}${name} — MD Viewer` : "MD Viewer";
  if (isTauri) tauri.window.getCurrentWindow().setTitle(document.title).catch(() => {});
  app.classList.toggle("editing", !!tab?.editing);
  renderTabbar();
}

function renderTabbar() {
  app.classList.toggle("has-tabs", tabs.length > 1);
  tabbar.innerHTML = "";
  tabs.forEach((t, i) => {
    const el = document.createElement("div");
    el.className = `tab${i === active ? " active" : ""}${isDirty(t) ? " dirty" : ""}`;
    el.dataset.index = i;
    el.title = t.path ?? "";
    el.innerHTML = `<span class="tab-name"></span><button class="tab-close" title="닫기 (Ctrl+W)" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg></button>`;
    el.querySelector(".tab-name").textContent = tabName(t);
    tabbar.append(el);
  });
  tabbar.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

tabbar.addEventListener("click", (e) => {
  const el = e.target.closest(".tab");
  if (!el) return;
  const i = Number(el.dataset.index);
  if (e.target.closest(".tab-close")) closeTab(i);
  else activate(i);
});
tabbar.addEventListener("auxclick", (e) => {
  const el = e.target.closest(".tab");
  if (el && e.button === 1) closeTab(Number(el.dataset.index));
});
// 세로 휠로도 탭 줄을 옆으로 넘긴다
tabbar.addEventListener("wheel", (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    tabbar.scrollLeft += e.deltaY;
    e.preventDefault();
  }
}, { passive: false });

/* ── 탭 전환·열기·닫기 ─────────────────────── */
function stash() {
  const tab = cur();
  if (!tab) return;
  tab.scroll = reader.scrollTop;
  if (editor && tab.editing) tab.cm = editor.view.state;
}

async function activate(i, { animate = false } = {}) {
  if (i < 0 || i >= tabs.length) return;
  if (i !== active) stash();
  active = i;
  const tab = cur();
  if (tab.editing) await ensureEditor(tab);
  renderDoc({ scroll: tab.scroll, animate });
  updateChrome();
  refreshFiles();
  saveSession();
}

// 지금 탭 바로 뒤에 넣는다 (복원할 때는 맨 뒤에)
function addTab(tab, { atEnd = false } = {}) {
  const i = atEnd || active === -1 ? tabs.length : active + 1;
  tabs.splice(i, 0, tab);
  return i;
}

async function openPath(path, { activateTab = true } = {}) {
  const existing = tabs.findIndex((t) => samePath(t.path, path));
  if (existing !== -1) {
    if (activateTab) await activate(existing);
    return true;
  }
  let text;
  try {
    text = await tauri.core.invoke("read_markdown", { path });
  } catch {
    if (activateTab) toast(`열 수 없습니다: ${basename(path)}`);
    forgetRecent(path);
    return false;
  }
  const i = addTab(makeTab(path, text), { atEnd: !activateTab });
  if (activateTab) await activate(i, { animate: true });
  else if (active === -1) await activate(i);
  else renderTabbar();
  store.set("lastDir", dirname(path));
  rememberRecent(path);
  tauri.core.invoke("watch_file", { path }).catch(() => {});
  return true;
}

async function openMany(paths) {
  const list = paths.filter((p) => MD_EXT.test(p));
  if (!list.length) {
    if (paths.length) toast("마크다운 파일만 열 수 있습니다");
    return;
  }
  for (const p of list) await openPath(p);
}

async function closeTab(i = active) {
  const tab = tabs[i];
  if (!tab) return;
  if (isDirty(tab)) {
    if (i !== active) await activate(i);
    if (!(await ask(`'${tabName(tab)}'의 변경 내용을 저장하지 않았습니다. 버리고 닫을까요?`))) return;
  }
  if (tab.path && isTauri) tauri.core.invoke("unwatch_file", { path: tab.path }).catch(() => {});
  if (i === active) {
    tabs.splice(i, 1);
    active = -1;
    if (!tabs.length) return showWelcome();
    await activate(Math.min(i, tabs.length - 1));
  } else {
    tabs.splice(i, 1);
    if (i < active) active--;
    renderTabbar();
    saveSession();
  }
}

async function openDialog() {
  if (!isTauri) return browserPick();
  const picked = await tauri.dialog.open({
    multiple: true,
    directory: false,
    defaultPath: store.get("lastDir", undefined),
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mdx", "txt"] }],
  });
  if (picked) openMany([].concat(picked));
}

// 브라우저에서 미리보기할 때(개발용)
function browserPick() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: ".md,.markdown,.txt", multiple: true });
  input.onchange = () => openBrowserFiles([...input.files]);
  input.click();
}
async function openBrowserFiles(files) {
  for (const f of files) {
    const tab = makeTab(null, await f.text());
    tab.label = f.name;
    stash();
    await activate(addTab(tab), { animate: true });
  }
}

/* ── 최근 파일 · 탭 복원 ───────────────────── */
function rememberRecent(path) {
  const list = store.json("recent", []).filter((p) => !samePath(p, path));
  list.unshift(path);
  store.set("recent", JSON.stringify(list.slice(0, 8)));
}
function forgetRecent(path) {
  store.set("recent", JSON.stringify(store.json("recent", []).filter((p) => !samePath(p, path))));
}
function saveSession() {
  if (!isTauri || restoring) return;
  const paths = tabs.filter((t) => t.path).map((t) => t.path);
  store.set("session", JSON.stringify({ paths, active: cur()?.path ?? null }));
}
let restoring = false;

/* ── 편집 ─────────────────────────────────── */
let liveTimer;
async function ensureEditor(tab) {
  if (!editor) {
    const { createEditor } = await import("./editor.js");
    editor = createEditor($("editor"), {
      onChange(text) {
        const t = cur();
        if (!t) return;
        t.text = text;
        updateChrome();
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => renderDoc({ scroll: "keep" }), 120);
      },
      onScroll: syncPreview,
    });
  }
  tab.cm ??= editor.newState(tab.text);
  editor.swap(tab.cm);
}

async function setEditing(on) {
  const tab = cur();
  if (!tab) return newDocument();
  if (on) await ensureEditor(tab);
  else if (editor) tab.cm = editor.view.state;
  tab.editing = on;
  updateChrome();
  if (on) editor.focus();
}

// 원문을 스크롤하면 미리보기도 같은 비율만큼 따라온다
function syncPreview(scroller) {
  const ratio = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  reader.style.scrollBehavior = "auto";
  reader.scrollTop = ratio * (reader.scrollHeight - reader.clientHeight);
  reader.style.scrollBehavior = "";
}

async function newDocument() {
  stash();
  const tab = makeTab(null, "");
  tab.editing = true;
  await activate(addTab(tab));
  editor.focus();
}

async function save({ as = false } = {}) {
  const tab = cur();
  if (!tab) return;
  if (!isTauri) return toast("브라우저 미리보기에서는 저장할 수 없습니다");
  let path = tab.path;
  if (as || !path) {
    const dir = store.get("lastDir", "");
    path = await tauri.dialog.save({
      defaultPath: path ?? (dir ? `${dir}${sepOf(dir)}제목 없음.md` : "제목 없음.md"),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return false;
  }
  const content = tab.text;
  try {
    await tauri.core.invoke("write_markdown", { path, content });
  } catch (e) {
    toast(`저장하지 못했습니다: ${e}`);
    return false;
  }
  tab.saved = content;
  if (!samePath(path, tab.path)) {
    if (tab.path) tauri.core.invoke("unwatch_file", { path: tab.path }).catch(() => {});
    tab.path = path;
    store.set("lastDir", dirname(path));
    rememberRecent(path);
    tauri.core.invoke("watch_file", { path }).catch(() => {});
    if (tab === cur()) {
      renderDoc({ scroll: "keep" });
      refreshFiles();
    }
    saveSession();
  }
  updateChrome();
  toast("저장했습니다");
  return true;
}

/* ── 옆 칸: 목차 · 같은 폴더 파일 ─────────── */
function setSideMode(mode) {
  app.dataset.side = mode;
  store.set("side", mode);
  for (const b of document.querySelectorAll(".side-tab")) b.classList.toggle("active", b.dataset.mode === mode);
  if (mode === "files") refreshFiles();
}

async function refreshFiles() {
  if (app.dataset.side !== "files") return;
  const tab = cur();
  filesNav.innerHTML = "";
  if (!tab?.path || !isTauri) {
    filesNav.innerHTML = `<div class="side-empty">저장된 파일을 열면 같은 폴더의 문서가 보입니다</div>`;
    return;
  }
  const dir = dirname(tab.path);
  const names = await tauri.core.invoke("list_markdown", { dir }).catch(() => []);
  if (cur() !== tab) return;
  filesNav.innerHTML = "";
  const folder = document.createElement("div");
  folder.className = "side-folder";
  folder.textContent = basename(dir) || dir;
  folder.title = dir;
  filesNav.append(folder);
  for (const n of names) {
    const a = document.createElement("a");
    a.textContent = n.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, "");
    a.title = n;
    a.dataset.path = `${dir}${sepOf(tab.path)}${n}`;
    if (samePath(a.dataset.path, tab.path)) a.className = "active";
    filesNav.append(a);
  }
}

filesNav.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-path]");
  if (a) openPath(a.dataset.path);
});
for (const b of document.querySelectorAll(".side-tab")) b.addEventListener("click", () => setSideMode(b.dataset.mode));

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
    if (current && app.dataset.side !== "files") current.scrollIntoView({ block: "nearest" });
  });
}
reader.addEventListener("scroll", onScroll, { passive: true });

/* ── 본문 클릭: 복사 버튼, 이미지 확대, 링크 ─ */
doc.addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    const code = copyBtn.parentElement.querySelector("pre code") ?? copyBtn.parentElement.querySelector("pre");
    copyText(code.innerText.replace(/\n$/, "")).then(() => {
      const label = copyBtn.querySelector("span");
      copyBtn.classList.add("done");
      label.textContent = "복사됨";
      setTimeout(() => {
        copyBtn.classList.remove("done");
        label.textContent = "복사";
      }, 1400);
    });
    return;
  }

  const img = e.target.closest("img");
  if (img && !e.target.closest("a")) return zoomImage(img);

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
  const tab = cur();
  if (!tab?.path) return;
  const clean = decodeURI(href.split("#")[0]);
  const target = isAbsoluteLocal(clean) ? clean : resolvePath(dirname(tab.path), clean);
  if (MD_EXT.test(target)) openPath(target);
  else tauri.opener.openPath(target).catch(() => toast("열 수 없는 링크입니다"));
});

tocNav.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  document.getElementById(a.dataset.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ── 이미지 크게 보기 ─────────────────────── */
const lightbox = $("lightbox");
function zoomImage(img) {
  const big = lightbox.querySelector("img");
  big.src = img.currentSrc || img.src;
  big.alt = img.alt;
  lightbox.classList.add("show");
}
const closeLightbox = () => lightbox.classList.remove("show");
lightbox.addEventListener("click", closeLightbox);

/* ── 문서 안 찾기 ─────────────────────────── */
const findbar = $("findbar");
const findInput = $("find-input");
const findCount = $("find-count");
const find = { open: false, ranges: [], index: -1 };
const canHighlight = typeof CSS !== "undefined" && "highlights" in CSS;

function openFind() {
  if (!cur()) return;
  find.open = true;
  findbar.classList.add("show");
  const sel = String(window.getSelection() ?? "").trim();
  if (sel && !sel.includes("\n")) findInput.value = sel;
  findInput.focus();
  findInput.select();
  runFind();
}
function closeFind() {
  find.open = false;
  findbar.classList.remove("show");
  if (canHighlight) {
    CSS.highlights.delete("find");
    CSS.highlights.delete("find-current");
  }
}

function runFind({ keepIndex = false } = {}) {
  const q = findInput.value.trim().toLowerCase();
  find.ranges = [];
  if (q) {
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement.closest(".copy-btn, .katex-mathml, svg") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n; (n = walker.nextNode()); ) {
      const text = n.data.toLowerCase();
      for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) {
        const r = new Range();
        r.setStart(n, i);
        r.setEnd(n, i + q.length);
        find.ranges.push(r);
      }
    }
  }
  if (!keepIndex || find.index >= find.ranges.length) find.index = find.ranges.length ? 0 : -1;
  showFind(!keepIndex);
}

function showFind(scroll = true) {
  const n = find.ranges.length;
  const hasQuery = !!findInput.value.trim();
  findCount.textContent = hasQuery ? (n ? `${find.index + 1} / ${n}` : "없음") : "";
  findbar.classList.toggle("none", hasQuery && !n);
  const current = find.ranges[find.index];
  if (canHighlight) {
    CSS.highlights.set("find", new Highlight(...find.ranges));
    if (current) CSS.highlights.set("find-current", new Highlight(current));
    else CSS.highlights.delete("find-current");
  }
  if (current && scroll) {
    const r = current.getBoundingClientRect();
    const box = reader.getBoundingClientRect();
    if (r.top < box.top + 60 || r.bottom > box.bottom - 40) {
      reader.scrollTo({ top: reader.scrollTop + r.top - box.top - box.height / 3, behavior: "smooth" });
    }
  }
}

function stepFind(dir) {
  const n = find.ranges.length;
  if (!n) return;
  find.index = (find.index + dir + n) % n;
  showFind();
}

findInput.addEventListener("input", () => runFind());
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    stepFind(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeFind();
  }
});
$("find-prev").addEventListener("click", () => stepFind(-1));
$("find-next").addEventListener("click", () => stepFind(1));
$("find-close").addEventListener("click", closeFind);

/* ── 단축키 ───────────────────────────────── */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (lightbox.classList.contains("show")) return closeLightbox();
    if (find.open) return closeFind();
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();

  // 편집기 안에서의 Ctrl+F 는 편집기 자체 찾기에 맡긴다
  if (k === "f" && editor?.hasFocus()) return;

  if (k === "tab") {
    e.preventDefault();
    if (tabs.length > 1) activate((active + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length);
    return;
  }
  if (/^[1-9]$/.test(k)) {
    e.preventDefault();
    const i = k === "9" ? tabs.length - 1 : Number(k) - 1;
    if (i < tabs.length) activate(i);
    return;
  }

  const actions = {
    s: () => save({ as: e.shiftKey }),
    e: () => setEditing(!cur()?.editing),
    n: newDocument,
    o: openDialog,
    w: () => closeTab(),
    f: openFind,
    p: () => window.print(),
    d: cycleTheme,
    "\\": toggleToc,
    "=": () => setFontSize(fontSize + 1),
    "+": () => setFontSize(fontSize + 1),
    "-": () => setFontSize(fontSize - 1),
    0: () => setFontSize(17),
    r: reloadActive,
  };
  if (actions[k]) {
    e.preventDefault();
    e.stopPropagation();
    actions[k]();
  }
}, true); // 편집기보다 먼저 받아서 앱 단축키가 우선하도록

$("btn-open").addEventListener("click", openDialog);
$("btn-theme").addEventListener("click", cycleTheme);
$("btn-toc").addEventListener("click", toggleToc);
$("btn-edit").addEventListener("click", () => setEditing(!cur()?.editing));
$("btn-copy").addEventListener("click", async () => {
  const tab = cur();
  if (!tab) return;
  await copyText(tab.text);
  toast("문서 원문을 복사했습니다");
});

/* ── 드래그 앤 드롭 ───────────────────────── */
const overlay = $("drop-overlay");
if (isTauri) {
  tauri.webview.getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "over") overlay.classList.add("show");
    else overlay.classList.remove("show");
    if (payload.type === "drop") openMany(payload.paths);
  });
} else {
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    overlay.classList.add("show");
  });
  window.addEventListener("dragleave", (e) => !e.relatedTarget && overlay.classList.remove("show"));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    overlay.classList.remove("show");
    openBrowserFiles([...e.dataTransfer.files]);
  });
}

/* ── 파일이 바뀌면 자동 새로고침 ──────────── */
async function reloadTab(tab, { force = false } = {}) {
  const text = await tauri.core.invoke("read_markdown", { path: tab.path }).catch(() => null);
  if (text === null || (text === tab.saved && !force)) return; // 내가 저장한 것이면 무시
  if (isDirty(tab)) {
    if (tab === cur()) toast("다른 곳에서 파일이 바뀌었습니다. 저장하면 덮어씁니다");
    return;
  }
  tab.saved = tab.text = text;
  if (tab === cur() && tab.editing && editor) editor.setText(text);
  else tab.cm = null;
  if (tab === cur()) renderDoc({ scroll: "keep" });
}

function reloadActive() {
  const tab = cur();
  if (!tab?.path || !isTauri) return;
  if (isDirty(tab)) return toast("저장하지 않은 변경 내용이 있어 다시 읽지 않았습니다");
  reloadTab(tab, { force: true });
}

if (isTauri) {
  const timers = new Map();
  tauri.event.listen("file-changed", ({ payload }) => {
    clearTimeout(timers.get(payload));
    timers.set(payload, setTimeout(() => {
      const tab = tabs.find((t) => t.path === payload);
      if (tab) reloadTab(tab);
    }, 120));
  });

  // 앱이 이미 켜져 있을 때 다른 파일을 더블클릭하면 여기로 온다
  tauri.event.listen("open-files", ({ payload }) => openMany(payload));

  // 저장하지 않은 탭이 있으면 창을 닫기 전에 한 번 묻는다
  tauri.window.getCurrentWindow().onCloseRequested(async (event) => {
    stash();
    saveSession();
    const dirty = tabs.filter(isDirty);
    if (!dirty.length) return;
    const names = dirty.map(tabName).join(", ");
    if (!(await ask(`저장하지 않은 문서가 있습니다: ${names}\n버리고 닫을까요?`))) event.preventDefault();
  });
}

/* ── 첫 화면 ──────────────────────────────── */
function showWelcome() {
  active = -1;
  app.classList.add("welcome-mode");
  const recent = isTauri ? store.json("recent", []) : [];
  const recentHtml = recent.length
    ? `<div class="recent"><div class="recent-label">최근 문서</div>${recent
        .map(() => `<a><span class="r-name"></span><span class="r-dir"></span></a>`)
        .join("")}</div>`
    : "";
  doc.innerHTML = `
    <section class="welcome">
      <h1 class="mark">읽기 좋은<br>마크다운<span>.</span></h1>
      <p class="lead">문서를 이 창에 끌어다 놓거나, 파일을 직접 여세요.</p>
      <div class="welcome-actions">
        <button class="open-btn" id="welcome-open">파일 열기</button>
        <button class="open-btn ghost" id="welcome-new">새 문서</button>
      </div>
      ${recentHtml}
      <div class="keys">
        <kbd>Ctrl O</kbd><span>파일 열기</span>
        <kbd>Ctrl N</kbd><span>새 문서</span>
        <kbd>Ctrl E</kbd><span>편집 · 읽기 전환</span>
        <kbd>Ctrl F</kbd><span>문서 안 찾기</span>
        <kbd>Ctrl Tab</kbd><span>다음 탭</span>
        <kbd>Ctrl \\</kbd><span>목차 보이기 · 숨기기</span>
      </div>
    </section>`;
  doc.querySelectorAll(".recent a").forEach((a, i) => {
    a.querySelector(".r-name").textContent = basename(recent[i]);
    a.querySelector(".r-dir").textContent = dirname(recent[i]);
    a.title = recent[i];
    a.addEventListener("click", () => openPath(recent[i]));
  });
  $("welcome-open").addEventListener("click", openDialog);
  $("welcome-new").addEventListener("click", newDocument);
  tocNav.innerHTML = "";
  filesNav.innerHTML = "";
  progress.style.width = "0";
  if (find.open) closeFind();
  updateChrome();
  saveSession();
}

/* ── 시작 ─────────────────────────────────── */
applyTheme(store.get("theme", "system"));
setFontSize(fontSize);
if (store.get("tocHidden", "0") === "1") app.classList.add("toc-hidden");
setSideMode(store.get("side", "toc"));

if (isTauri) {
  // 지난번에 열어 둔 탭을 되살리고, 이번에 더블클릭한 파일은 그 뒤에 연다
  const session = store.json("session", { paths: [], active: null });
  const initial = await tauri.core.invoke("initial_files").catch(() => []);
  restoring = true;
  for (const p of session.paths) await openPath(p, { activateTab: false });
  restoring = false;
  if (initial.length) await openMany(initial);
  else if (tabs.length) {
    const i = tabs.findIndex((t) => samePath(t.path, session.active));
    await activate(i === -1 ? 0 : i);
  }
}
if (!tabs.length) showWelcome();
