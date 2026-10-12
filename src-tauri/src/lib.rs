use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

/// 지금 지켜보고 있는 파일 감시자 (한 번에 하나)
#[derive(Default)]
struct WatchState(Mutex<Option<RecommendedWatcher>>);

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

/// 파일을 더블클릭해서 실행했을 때 넘어온 경로
#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && Path::new(a).is_file())
}

/// 파일이 바뀌면 "file-changed" 이벤트를 보낸다.
/// 많은 편집기가 저장할 때 파일을 지우고 새로 만들기 때문에, 파일이 아닌 폴더를 지켜본다.
#[tauri::command]
fn watch_file(app: AppHandle, state: State<WatchState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or("폴더를 찾을 수 없습니다")?
        .to_path_buf();
    let name = target.file_name().map(|n| n.to_os_string());

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
            let _ = app.emit("file-changed", &path);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // 이전 감시자는 여기서 해제된다
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

/// 새 문서를 시작할 때 이전 파일 감시를 멈춘다.
#[tauri::command]
fn unwatch_file(state: State<WatchState>) {
    *state.0.lock().unwrap() = None;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(WatchState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown,
            write_markdown,
            initial_file,
            watch_file,
            unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MD Viewer");
}
