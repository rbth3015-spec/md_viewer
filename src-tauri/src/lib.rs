use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

/// 탭마다 하나씩, 열려 있는 파일의 감시자
#[derive(Default)]
struct WatchState(Mutex<HashMap<String, RecommendedWatcher>>);

const MD_EXTS: [&str; 6] = ["md", "markdown", "mdown", "mkd", "mdx", "txt"];

/// 파일을 UTF-8 텍스트로 읽는다. 깨진 바이트는 대체 문자로 바꾸고 BOM은 제거한다.
#[tauri::command]
fn read_markdown(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

/// 편집한 내용을 저장한다.
#[tauri::command]
fn write_markdown(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 실행 인자 중 실제로 있는 파일만 절대 경로로 골라낸다.
fn files_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            if p.is_absolute() {
                p
            } else {
                cwd.join(p)
            }
        })
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// 파일을 더블클릭해서 실행했을 때 넘어온 경로들
#[tauri::command]
fn initial_files() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    files_from_args(&args, &cwd)
}

/// 같은 폴더에 있는 마크다운 파일 이름 (이름순)
#[tauri::command]
fn list_markdown(dir: String) -> Result<Vec<String>, String> {
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .is_some_and(|x| MD_EXTS.contains(&x.to_ascii_lowercase().as_str()))
        })
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    Ok(names)
}

/// 파일이 바뀌면 "file-changed" 이벤트(경로)를 보낸다.
/// 많은 편집기가 저장할 때 파일을 지우고 새로 만들기 때문에, 파일이 아닌 폴더를 지켜본다.
#[tauri::command]
fn watch_file(app: AppHandle, state: State<WatchState>, path: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if map.contains_key(&path) {
        return Ok(());
    }
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or("폴더를 찾을 수 없습니다")?
        .to_path_buf();
    let name = target.file_name().map(|n| n.to_os_string());
    let emit_path = path.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
            return;
        }
        if event
            .paths
            .iter()
            .any(|p| p.file_name().map(|n| n.to_os_string()) == name)
        {
            let _ = app.emit("file-changed", &emit_path);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    map.insert(path, watcher);
    Ok(())
}

/// 탭을 닫으면 그 파일 감시를 멈춘다.
#[tauri::command]
fn unwatch_file(state: State<WatchState>, path: String) {
    state.0.lock().unwrap().remove(&path);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 이미 켜져 있으면 새 창을 띄우지 않고, 기존 창에 탭으로 연다
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = files_from_args(&args, Path::new(&cwd));
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(WatchState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            write_markdown,
            initial_files,
            list_markdown,
            watch_file,
            unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MD Viewer");
}
