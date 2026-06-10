// PTY 冒烟测试：用 portable-pty 在 ConPTY 里跑 `cmd /c claude --version`，读取输出。
// 验证「原生终端起 claude」这条链路在本机可用。
// 运行：cargo run --example pty_smoke --manifest-path apps/desktop/src-tauri/Cargo.toml
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;

fn main() {
    let sys = native_pty_system();
    let pair = sys
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .expect("openpty");

    let mut cmd = if cfg!(windows) {
        let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut c = CommandBuilder::new(comspec);
        c.arg("/c");
        c.arg("claude");
        c.arg("--version");
        c
    } else {
        let mut c = CommandBuilder::new("claude");
        c.arg("--version");
        c
    };
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }

    let mut child = pair.slave.spawn_command(cmd).expect("spawn");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().expect("reader");
    let mut out = String::new();
    let mut buf = [0u8; 1024];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => out.push_str(&String::from_utf8_lossy(&buf[..n])),
            Err(_) => break,
        }
    }
    let _ = child.wait();

    println!("--- PTY OUTPUT START ---");
    print!("{out}");
    println!("\n--- PTY OUTPUT END ---");
    if out.contains("Claude") || out.chars().any(|c| c.is_ascii_digit()) {
        println!("RESULT: OK (PTY 能在本机起 claude 并读到输出)");
    } else {
        println!("RESULT: 可疑（没读到预期输出）");
    }
}
