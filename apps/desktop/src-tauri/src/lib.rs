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
        // ⚠️ 不能逐块 from_utf8_lossy：多字节 UTF-8(中文3字节/─线3字节)跨块被切断会变 U+FFFD，
        // 字形是菱形——曾被当成"乱码◇"追了很久。残缺尾字节留到下一块拼上再解码。
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let mut out = String::new();
                    loop {
                        match std::str::from_utf8(&pending) {
                            Ok(s) => {
                                out.push_str(s);
                                pending.clear();
                                break;
                            }
                            Err(e) => {
                                let valid = e.valid_up_to();
                                out.push_str(std::str::from_utf8(&pending[..valid]).unwrap());
                                match e.error_len() {
                                    // 尾部字节不完整：保留，等下一块补齐
                                    None => {
                                        pending.drain(..valid);
                                        break;
                                    }
                                    // 真·非法字节：吐替换符并跳过，继续解码剩余
                                    Some(len) => {
                                        out.push('\u{FFFD}');
                                        pending.drain(..valid + len);
                                    }
                                }
                            }
                        }
                    }
                    if !out.is_empty() {
                        let _ = app2.emit("pty-data", PtyData { id: id2.clone(), data: out });
                    }
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
    use std::os::windows::process::CommandExt;
    // 经 cmd 启动 code/start 是为了走 PATHEXT 把 `code`→`code.cmd`；但 cmd 会闪一个黑色控制台窗。
    // CREATE_NO_WINDOW(0x08000000) 让这个中转 cmd 不创建控制台——VSCode/浏览器是独立 GUI 进程，照常打开。
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("用 VSCode 打开失败(确认 code 在 PATH): {e}"))?;
    } else {
        // .html 等：用默认关联程序打开（html 默认即浏览器）
        std::process::Command::new(&comspec)
            .args(["/c", "start", "", &full_str])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 阅读清单：Claude 生成的、给人看的报告/文档统一落在 ~/.oblivionis/reports/ ──────
// 与代码/配置改动彻底分开——只有显式写进这个目录的文件才会出现在 GUI 的「阅读清单」里。
fn reports_dir_path() -> std::path::PathBuf {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    std::path::Path::new(&home).join(".oblivionis").join("reports")
}

/// 列出阅读清单目录里的文件（按修改时间倒序）。目录不存在则创建并返回空列表。
/// 只用 serde_json（已是依赖），避免引入新的 serde derive。
#[tauri::command]
fn list_reports() -> Result<serde_json::Value, String> {
    let dir = reports_dir_path();
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    let mut files: Vec<serde_json::Value> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue; // 跳过隐藏文件
            }
            let ext = p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            let meta = entry.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_ms = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            files.push(serde_json::json!({
                "name": name,
                "path": p.to_string_lossy().to_string(),
                "ext": ext,
                "size": size,
                "modifiedMs": modified_ms,
            }));
        }
    }
    files.sort_by(|a, b| {
        b["modifiedMs"].as_u64().unwrap_or(0).cmp(&a["modifiedMs"].as_u64().unwrap_or(0))
    });
    Ok(serde_json::json!({ "dir": dir.to_string_lossy().to_string(), "files": files }))
}

/// 阅读清单目录的绝对路径——供前端把它作为「公共目录」并进 Markdown 查看器的切换列表。
#[tauri::command]
fn reports_dir() -> String {
    reports_dir_path().to_string_lossy().to_string()
}

// 递归扫 .md 时要跳过的重目录（Unity / 构建产物 / VCS 噪音）。按名小写匹配。
// 注意：不黑名单所有点目录——`.claude` / `.oblivionis` 这类含文档，必须保留。
fn md_skip_dir(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "library" | "temp" | "obj" | "bin" | "logs" | "build" | "builds"
            | "node_modules" | ".git" | ".svn" | ".hg" | ".vs" | ".idea"
            | ".gradle" | "target" | "dist" | "__pycache__" | ".next" | ".cache"
    )
}

/// 递归列出某目录下所有 .md（跳过重目录、限深度/数量）——防 Unity 工程百万文件把界面拖死。
#[tauri::command]
fn list_md_files(dir: String) -> Result<serde_json::Value, String> {
    let root = std::path::Path::new(&dir);
    if !root.is_dir() {
        return Ok(serde_json::json!({ "dir": dir, "files": [], "truncated": false, "exists": false }));
    }
    const MAX_FILES: usize = 4000;
    const MAX_DEPTH: usize = 12;
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut truncated = false;
    let mut stack: Vec<(std::path::PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((d, depth)) = stack.pop() {
        if out.len() >= MAX_FILES {
            truncated = true;
            break;
        }
        let rd = match std::fs::read_dir(&d) {
            Ok(x) => x,
            Err(_) => continue,
        };
        for entry in rd.flatten() {
            let p = entry.path();
            let fname = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                if depth + 1 <= MAX_DEPTH && !md_skip_dir(&fname) {
                    stack.push((p, depth + 1));
                }
                continue;
            }
            let lower = fname.to_lowercase();
            if !(lower.ends_with(".md") || lower.ends_with(".markdown")) {
                continue;
            }
            if out.len() >= MAX_FILES {
                truncated = true;
                break;
            }
            let meta = entry.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_ms = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|x| x.as_millis() as u64)
                .unwrap_or(0);
            let rel = p
                .strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(serde_json::json!({
                "name": fname, "path": p.to_string_lossy().to_string(),
                "rel": rel, "size": size, "modifiedMs": modified_ms,
            }));
        }
    }
    out.sort_by(|a, b| {
        a["rel"].as_str().unwrap_or("").to_lowercase().cmp(&b["rel"].as_str().unwrap_or("").to_lowercase())
    });
    Ok(serde_json::json!({ "dir": dir, "files": out, "truncated": truncated, "exists": true }))
}

/// 读 .md 文件内容（UTF-8，限大小，防误读巨型文件）。
#[tauri::command]
fn read_md(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    const MAX: u64 = 4 * 1024 * 1024;
    if meta.len() > MAX {
        return Err(format!("文件过大（{} KB），超过 {} KB 上限", meta.len() / 1024, MAX / 1024));
    }
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

// ── 飞书 App Secret：存进 Windows 凭据管理器，绝不明文落 config.json ─────────────
const KEYRING_SERVICE: &str = "OblivionisAgent";
const KEYRING_ACCOUNT: &str = "feishu-app-secret";

fn secret_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

/// 从凭据管理器读密钥；不存在/为空返回 None
fn read_feishu_secret() -> Option<String> {
    match secret_entry().ok()?.get_password() {
        Ok(s) if !s.is_empty() => Some(s),
        _ => None,
    }
}

/// 前端「保存并连接」时调用：把 App Secret 写进凭据管理器（留空=清除）。
#[tauri::command]
fn set_feishu_secret(value: String) -> Result<(), String> {
    let entry = secret_entry()?;
    if value.is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// 前端用来决定 Secret 输入框 placeholder（「已保存（留空则沿用）」）——不把密钥本身拉到前端。
#[tauri::command]
fn has_feishu_secret() -> bool {
    read_feishu_secret().is_some()
}

/// 一次性迁移：旧 config.json 里若有明文 appSecret → 存进凭据管理器 + 把文件里那行清空。
/// 返回迁移到的密钥（供本次启动用）。仅在凭据管理器还没有密钥时才会走到这里。
fn migrate_plaintext_secret(cfg_path: &str) -> Option<String> {
    let raw = std::fs::read_to_string(cfg_path).ok()?;
    let mut json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let secret = json.get("feishu")?.get("appSecret")?.as_str()?.to_string();
    if secret.is_empty() {
        return None;
    }
    secret_entry().ok()?.set_password(&secret).ok()?;
    if let Some(s) = json.get_mut("feishu").and_then(|f| f.get_mut("appSecret")) {
        *s = serde_json::Value::String(String::new());
    }
    if let Ok(pretty) = serde_json::to_string_pretty(&json) {
        let _ = std::fs::write(cfg_path, pretty);
    }
    Some(secret)
}

/// 本次启动要交给 bridge 的飞书密钥：凭据管理器优先；没有则尝试从旧 config.json 迁移。
fn feishu_secret_for_bridge(cfg_path: Option<&str>) -> Option<String> {
    read_feishu_secret().or_else(|| cfg_path.and_then(migrate_plaintext_secret))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例：必须第一个注册。再次双击/打开只把已有主窗拉到前台，绝不开第二个 App——
        // 否则两个实例各自拉起 sidecar 抢 8920 端口 + 抢同一飞书长连接登录，会把后台服务整崩。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        // 全局唤起热键：默认不注册，由前端按设置(默认关)动态 register/unregister(避免与别的软件撞键)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(BridgeProc::default())
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_open, pty_write, pty_resize, pty_close, save_paste_image, open_path,
            set_feishu_secret, has_feishu_secret, list_reports,
            reports_dir, list_md_files, read_md
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
            // 只有「主窗」销毁才等于应用退出 → 才杀后台服务。
            // 闪屏(splashscreen)/小人(mascot)窗各自关闭也会触发 Destroyed，绝不能误杀 sidecar——
            // 曾导致闪屏 3s 后自动关闭就把刚起来的后台服务杀掉，表现为"刚连上又断了、再也起不来"。
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<BridgeProc>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
                // 关主窗=用户要退出整个 App。但 mascot 是「隐藏常驻窗」(启动即建、只 show/hide
                // 从不销毁)，只要它还在，进程就不退出 → 留下没有可见窗口的僵尸进程：单实例锁没释放，
                // 下次启动只会去聚焦这个僵尸 → 表现为"打不开"。所以这里显式退出，连带关掉 mascot、
                // 结束进程、释放单实例锁。（这也是之前反复攒出多个实例、互抢端口的总根子。）
                app.exit(0);
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
    if let Some(path) = &cfg {
        cmd = cmd.env("OBLIVIONIS_CONFIG", path);
    }
    // 飞书 App Secret：从 Windows 凭据管理器读出（或首次从旧 config.json 迁移），经 env 交给 bridge。
    // 这样密钥既不明文落 config.json，也不经 WS 广播；bridge 仅在内存里用。
    if let Some(secret) = feishu_secret_for_bridge(cfg.as_deref()) {
        cmd = cmd.env("OBLIVIONIS_FEISHU_SECRET", secret);
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
