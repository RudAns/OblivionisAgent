// 探针：拉起 claude 的交互式 PTY，抓它启动时协商的终端模式，判断 Shift+Enter 该发什么序列。
// 运行：cargo run --example pty_probe
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn main() {
    let sys = native_pty_system();
    let pair = sys
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
    let mut cmd = CommandBuilder::new(comspec);
    cmd.arg("/c");
    cmd.arg("claude");
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }
    cmd.cwd("C:/Users/user/Desktop/OblivionisAgent");
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().unwrap();
    let buf = Arc::new(Mutex::new(Vec::<u8>::new()));
    let b2 = buf.clone();
    std::thread::spawn(move || {
        let mut r = reader;
        let mut tmp = [0u8; 8192];
        loop {
            match r.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => b2.lock().unwrap().extend_from_slice(&tmp[..n]),
                Err(_) => break,
            }
        }
    });

    // 等 claude 启动并完成终端模式协商
    std::thread::sleep(Duration::from_secs(5));
    let _ = child.kill();

    let data = buf.lock().unwrap().clone();
    let s = String::from_utf8_lossy(&data);

    println!("=== 抓到 {} 字节 ===", data.len());

    // 关键模式协商检测
    let checks: &[(&str, &str)] = &[
        ("bracketed paste 开启 (\\x1b[?2004h)", "\x1b[?2004h"),
        ("bracketed paste 关闭 (\\x1b[?2004l)", "\x1b[?2004l"),
        ("kitty 键盘协议 push (\\x1b[>...u)", "\x1b[>"),
        ("kitty 键盘协议 enable (\\x1b[>1u)", "\x1b[>1u"),
        ("kitty 查询 (\\x1b[?u)", "\x1b[?u"),
        ("modifyOtherKeys (\\x1b[>4;2m)", "\x1b[>4"),
        ("alt screen (\\x1b[?1049h)", "\x1b[?1049h"),
        ("app cursor keys (\\x1b[?1h)", "\x1b[?1h"),
        ("focus reporting (\\x1b[?1004h)", "\x1b[?1004h"),
    ];
    println!("\n=== 模式协商 ===");
    for (name, seq) in checks {
        println!("  [{}] {}", if s.contains(seq) { "Y" } else { "·" }, name);
    }

    // 把所有 \x1b[ ... 开头、含 > 或 ? 的私有序列摘出来（去重打印），看 claude 到底设了哪些
    println!("\n=== 私有/扩展转义序列(摘录) ===");
    let bytes = &data;
    let mut seen: Vec<String> = Vec::new();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == 0x1b && bytes[i + 1] == b'[' {
            // 抓到字母结尾或 ~ 结尾
            let mut j = i + 2;
            while j < bytes.len() {
                let c = bytes[j];
                if (c as char).is_ascii_alphabetic() || c == b'~' {
                    break;
                }
                j += 1;
            }
            if j < bytes.len() {
                let inner = &bytes[i + 2..=j];
                // 只关心私有(>或?)或 u/~ 结尾的扩展键序列
                let has_priv = inner.iter().any(|&c| c == b'>' || c == b'?');
                let end = bytes[j];
                if has_priv || end == b'u' || end == b'~' {
                    let mut rep = String::from("\\x1b[");
                    for &c in inner {
                        if (0x20..=0x7e).contains(&c) {
                            rep.push(c as char);
                        } else {
                            rep.push_str(&format!("\\x{:02x}", c));
                        }
                    }
                    if !seen.contains(&rep) {
                        seen.push(rep);
                    }
                }
            }
            i = j + 1;
        } else {
            i += 1;
        }
    }
    for r in &seen {
        println!("  {}", r);
    }
}
