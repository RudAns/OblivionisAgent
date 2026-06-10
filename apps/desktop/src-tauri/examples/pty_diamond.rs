// 诊断"分隔线上漂浮的 ◇ 菱形"：resume 一个有历史的会话，抓原始字节，
// 检查是 claude 真的输出了 U+25C6/U+25C7，还是 DEC 特殊图形字符集(ESC(0)切换泄漏。
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn main() {
    let sys = native_pty_system();
    let pair = sys
        .openpty(PtySize { rows: 45, cols: 130, pixel_width: 0, pixel_height: 0 })
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

    std::thread::sleep(Duration::from_secs(8));
    let _ = child.kill();

    let data = buf.lock().unwrap().clone();
    println!("=== 共 {} 字节 ===", data.len());

    // 1) DEC 特殊图形字符集切换
    let esc_0 = data.windows(2).filter(|w| w == b"\x1b(").count();
    let mut charset_seqs: Vec<String> = Vec::new();
    for i in 0..data.len().saturating_sub(2) {
        if data[i] == 0x1b && data[i + 1] == b'(' {
            charset_seqs.push(format!("\\x1b({}", data[i + 2] as char));
        }
    }
    charset_seqs.dedup();
    println!("ESC( 字符集切换共 {} 次, 种类: {:?}", esc_0, charset_seqs);

    // 2) 真实的 Unicode 菱形 U+25C6(e29786) / U+25C7(e29787) / U+25C8(e29788)
    for (name, pat) in [("U+25C6 ◆", b"\xe2\x97\x86".as_slice()), ("U+25C7 ◇", b"\xe2\x97\x87".as_slice()), ("U+25C8 ◈", b"\xe2\x97\x88".as_slice())] {
        let hits: Vec<usize> = data
            .windows(3)
            .enumerate()
            .filter(|(_, w)| *w == pat)
            .map(|(i, _)| i)
            .collect();
        println!("{} 出现 {} 次", name, hits.len());
        // 打印前 3 处上下文(前后各 60 字节，可见字符)
        for &h in hits.iter().take(3) {
            let s = h.saturating_sub(60);
            let e = (h + 63).min(data.len());
            let ctx = String::from_utf8_lossy(&data[s..e]);
            let vis: String = ctx
                .chars()
                .map(|c| if c == '\u{1b}' { '␛' } else if c.is_control() { '·' } else { c })
                .collect();
            println!("   ...{}...", vis);
        }
    }

    // 3) 其它可疑装饰字符
    for (name, pat) in [("U+25CA ◊", b"\xe2\x97\x8a".as_slice()), ("U+2756 ❖", b"\xe2\x9d\x96".as_slice())] {
        let n = data.windows(3).filter(|w| *w == pat).count();
        if n > 0 {
            println!("{} 出现 {} 次", name, n);
        }
    }
}
