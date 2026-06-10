// OblivionisAgent 桌面外壳。
//
// 职责：
//  1) 启动时自动拉起 Bridge sidecar（随应用分发的 oblivionis-bridge.exe），前端经 ws://127.0.0.1:8920 通信。
//     开发时设 OBLIVIONIS_NO_SIDECAR=1 可禁用，改为手动 `pnpm bridge`。
//  2) 提供原生交互式终端(PTY)：用 portable-pty 起一个交互式 `claude`，前端 xterm.js 观看/输入。
//     （这条不依赖任何 Node 原生模块，打包后即可用。）

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct BridgeProc(Mutex<Option<CommandChild>>);

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
struct PtyState {
    map: Mutex<HashMap<String, PtySession>>,
    counter: AtomicU64,
}

#[derive(Clone, serde::Serialize)]
struct PtyData {
    id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct PtyExit {
    id: String,
}

/// 会话是否已存在（决定 --resume 还是 --session-id）。
/// 关键：claude 对"已存在的 id"用 --session-id 会报错，所以只要会话在**任何**项目目录里存在，就必须 --resume。
/// 先按 cwd 编码精确查(去掉结尾的 / \ 再编码)，再兜底跨所有项目目录搜该 id（防 cwd 大小写/结尾分隔符差异）。
fn session_exists(cwd: &str, sid: &str) -> bool {
    if sid.is_empty() {
        return false;
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    if home.is_empty() {
        return false;
    }
    let projects = std::path::Path::new(&home).join(".claude").join("projects");
    let file = format!("{sid}.jsonl");

    if !cwd.is_empty() {
        let trimmed = cwd.trim_end_matches(['/', '\\']);
        let enc: String = trimmed
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        if projects.join(&enc).join(&file).exists() {
            return true;
        }
    }
    if let Ok(rd) = std::fs::read_dir(&projects) {
        for e in rd.flatten() {
            if e.path().join(&file).exists() {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
fn pty_open(
    app: tauri::AppHandle,
    state: tauri::State<PtyState>,
    cwd: String,
    bin: String,
    sid: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // 会话续接：节点有 sessionId 且其 transcript 已存在 -> --resume；否则 --session-id 用同一 id 新建。
    // 这样「终端」与「飞书/测试框」驱动的是同一条会话，终端里能看到该节点的历史并接着聊。
    let resumed = !sid.is_empty() && session_exists(&cwd, &sid);
    let mut claude_args: Vec<String> = Vec::new();
    if !sid.is_empty() {
        claude_args.push(if resumed { "--resume".to_string() } else { "--session-id".to_string() });
        claude_args.push(sid.clone());
    }

    // Windows 上 claude 多为 .cmd，用 cmd.exe(完整路径) /c 包一层最稳；posix 直接起。
    let mut cmd = if cfg!(windows) {
        let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut c = CommandBuilder::new(comspec);
        c.arg("/c");
        c.arg(&bin);
        for a in &claude_args {
            c.arg(a);
        }
        c
    } else {
        let mut c = CommandBuilder::new(&bin);
        for a in &claude_args {
            c.arg(a);
        }
        c
    };
    // 显式继承当前进程环境，确保子进程能通过 PATH 找到 claude/cmd
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }
    if !cwd.is_empty() {
        cmd.cwd(&cwd);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = format!("pty-{}", state.counter.fetch_add(1, Ordering::SeqCst));
    state.map.lock().unwrap().insert(
        id.clone(),
        PtySession {
            master: pair.master,
            writer,
            child,
        },
    );

    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let s = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit("pty-data", PtyData { id: id2.clone(), data: s });
                }
                Err(_) => break,
            }
        }
        let _ = app2.emit("pty-exit", PtyExit { id: id2.clone() });
    });

    Ok(id)
}

#[tauri::command]
fn pty_write(state: tauri::State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut map = state.map.lock().unwrap();
    let s = map.get_mut(&id).ok_or("pty 不存在")?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    let _ = s.writer.flush();
    Ok(())
}

#[tauri::command]
fn pty_resize(state: tauri::State<PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.map.lock().unwrap();
    if let Some(s) = map.get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn pty_close(state: tauri::State<PtyState>, id: String) -> Result<(), String> {
    if let Some(mut s) = state.map.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}

/// 把粘贴的图片(base64)落成临时文件，返回绝对路径。前端再把路径插入 claude 输入框，claude 用 Read 读图。
#[tauri::command]
fn save_paste_image(b64: String, ext: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("图片解码失败: {e}"))?;
    let safe_ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect();
    let safe_ext = if safe_ext.is_empty() { "png".to_string() } else { safe_ext };
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("oblivionis-paste-{nanos}.{safe_ext}"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 点击终端里的文件路径时打开它：.md 用 VSCode，.html 等用默认程序(浏览器)。相对路径按会话 cwd(base) 解析。
#[tauri::command]
fn open_path(path: String, base: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let full = if p.is_absolute() || base.is_empty() {
        p.to_path_buf()
    } else {
        std::path::Path::new(&base).join(p)
    };
    let full_str = full.to_string_lossy().to_string();
    let lower = full_str.to_lowercase();
    let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
    if lower.ends_with(".md") || lower.ends_with(".markdown") {
        std::process::Command::new(&comspec)
            .args(["/c", "code", &full_str])
            .spawn()
            .map_err(|e| format!("用 VSCode 打开失败(确认 code 在 PATH): {e}"))?;
    } else {
        // .html 等：用默认关联程序打开（html 默认即浏览器）
        std::process::Command::new(&comspec)
            .args(["/c", "start", "", &full_str])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BridgeProc::default())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_open, pty_write, pty_resize, pty_close, save_paste_image, open_path
        ])
        .setup(|app| {
            if std::env::var("OBLIVIONIS_NO_SIDECAR").as_deref() != Ok("1") {
                if let Err(e) = spawn_bridge(app.handle()) {
                    eprintln!("[oblivionis] 启动 Bridge sidecar 失败: {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<BridgeProc>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn spawn_bridge(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 配置固定在用户主目录，安装目录通常不可写：%USERPROFILE%\.oblivionis\config.json
    let cfg = std::env::var("USERPROFILE")
        .ok()
        .map(|h| format!("{h}\\.oblivionis\\config.json"));

    let mut cmd = app.shell().sidecar("oblivionis-bridge")?;
    if let Some(path) = cfg {
        cmd = cmd.env("OBLIVIONIS_CONFIG", path);
    }
    let (mut rx, child) = cmd.spawn()?;
    app.state::<BridgeProc>().0.lock().unwrap().replace(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                    print!("[bridge] {}", String::from_utf8_lossy(&b));
                }
                _ => {}
            }
        }
    });
    Ok(())
}
