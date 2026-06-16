// 实证：claude 交互式 TUI 渲染 markdown 水平分割线(---)时到底输出什么字符。
// 起新会话 → 发一条让它回复含 --- 的消息 → 抓渲染字节 → 统计可疑码点。
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
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
    cmd.cwd(".");
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);

    let reader = pair.master.try_clone_reader().unwrap();
    let mut writer = pair.master.take_writer().unwrap();
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

    std::thread::sleep(Duration::from_secs(6)); // 等启动
    let _ = writer.write_all("回复时请精确输出这个 markdown：一行写'甲'，然后一条水平分割线---，然后一行写'乙'。不要解释。".as_bytes());
    let _ = writer.flush();
    std::thread::sleep(Duration::from_millis(600));
    let _ = writer.write_all(b"\r");
    let _ = writer.flush();
    std::thread::sleep(Duration::from_secs(40)); // 等回复渲染
    let _ = child.kill();

    let data = buf.lock().unwrap().clone();
    let s = String::from_utf8_lossy(&data);
    println!("=== 共 {} 字节 ===", data.len());

    // 统计非 ASCII/CJK 码点
    let mut counts: std::collections::HashMap<char, usize> = std::collections::HashMap::new();
    for c in s.chars() {
        let cp = c as u32;
        let is_ascii = cp < 0x80;
        let is_cjk = (0x4e00..=0x9fff).contains(&cp) || (0x3000..=0x303f).contains(&cp) || (0xff00..=0xffef).contains(&cp);
        if !is_ascii && !is_cjk {
            *counts.entry(c).or_insert(0) += 1;
        }
    }
    let mut list: Vec<(char, usize)> = counts.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1));
    println!("=== 非 ASCII/CJK 码点 ===");
    for (c, n) in list.iter().take(30) {
        println!("  U+{:04X} {:?} × {}", *c as u32, c, n);
    }
    // 找"甲""乙"之间的内容（hr 渲染区）
    if let (Some(a), Some(b)) = (s.find('甲'), s.rfind('乙')) {
        if a < b {
            let mid: String = s[a..b].chars().take(400).collect();
            let vis: String = mid
                .chars()
                .map(|c| if c == '\u{1b}' { '␛' } else if c.is_control() && c != '\n' { '·' } else { c })
                .collect();
            println!("=== 甲→乙 之间(hr 渲染区, 去控制符) ===\n{}", vis);
        }
    }
}
