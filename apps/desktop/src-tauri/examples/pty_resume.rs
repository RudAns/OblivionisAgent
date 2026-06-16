// 抓交互式 `claude --resume` 在 PTY 里真正吐出的内容，判断是否重放历史。
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn main() {
    let sys = native_pty_system();
    let pair = sys
        .openpty(PtySize { rows: 50, cols: 140, pixel_width: 0, pixel_height: 0 })
        .unwrap();
    let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
    let mut cmd = CommandBuilder::new(comspec);
    cmd.arg("/c");
    cmd.arg("claude");
    cmd.arg("--resume");
    cmd.arg("00000000-0000-0000-0000-000000000000");
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }
    cmd.cwd(".");
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
    std::thread::sleep(Duration::from_secs(9));
    let _ = child.kill();

    let data = buf.lock().unwrap();
    let s = String::from_utf8_lossy(&data);
    // 粗略去掉 ANSI 转义(ESC[ ... 字母)，看实际可见文本
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // 跳过 ESC 后的控制序列直到字母
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&n) = chars.peek() {
                    chars.next();
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else if c == '\n' || !c.is_control() {
            out.push(c);
        }
    }
    // 压缩多余空行
    let cleaned: String = out
        .lines()
        .map(|l| l.trim_end())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    println!("=== 可见文本(去转义) 共 {} 字符 ===", cleaned.len());
    println!("{}", cleaned.chars().take(2800).collect::<String>());
}
