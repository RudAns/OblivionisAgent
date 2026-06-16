// 实测"软换行"序列：往 claude 输入框打 LINEONE + <候选序列> + LINETWO，**不提交**，
// 用 vte 重建最终屏幕，看输入框里 LINEONE / LINETWO 是同一行(没换行)还是相邻两行(换行成功)。
// 运行：cargo run --example pty_nl -- <candidate>
//   candidate ∈ bp-lf | bp-cr | esc-cr | csi-u | lf | esc-lf | bs-cr
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use vte::{Params, Parser, Perform};

const ROWS: usize = 40;
const COLS: usize = 130;

struct Grid {
    cells: Vec<Vec<char>>,
    r: usize,
    c: usize,
}
impl Grid {
    fn new() -> Self {
        Grid { cells: vec![vec![' '; COLS]; ROWS], r: 0, c: 0 }
    }
    fn p(params: &Params, idx: usize, def: u16) -> usize {
        let v = params.iter().nth(idx).and_then(|s| s.first().copied()).unwrap_or(0);
        (if v == 0 { def } else { v }) as usize
    }
}
impl Perform for Grid {
    fn print(&mut self, ch: char) {
        if self.r < ROWS && self.c < COLS {
            self.cells[self.r][self.c] = ch;
        }
        if self.c + 1 < COLS {
            self.c += 1;
        }
    }
    fn execute(&mut self, byte: u8) {
        match byte {
            0x0d => self.c = 0,
            0x0a => {
                if self.r + 1 < ROWS {
                    self.r += 1;
                } else {
                    self.cells.remove(0);
                    self.cells.push(vec![' '; COLS]);
                }
            }
            0x08 => self.c = self.c.saturating_sub(1),
            0x09 => self.c = ((self.c / 8) + 1) * 8,
            _ => {}
        }
    }
    fn csi_dispatch(&mut self, params: &Params, _i: &[u8], _ig: bool, action: char) {
        match action {
            'H' | 'f' => {
                self.r = Grid::p(params, 0, 1).saturating_sub(1).min(ROWS - 1);
                self.c = Grid::p(params, 1, 1).saturating_sub(1).min(COLS - 1);
            }
            'A' => self.r = self.r.saturating_sub(Grid::p(params, 0, 1)),
            'B' => self.r = (self.r + Grid::p(params, 0, 1)).min(ROWS - 1),
            'C' => self.c = (self.c + Grid::p(params, 0, 1)).min(COLS - 1),
            'D' => self.c = self.c.saturating_sub(Grid::p(params, 0, 1)),
            'G' => self.c = Grid::p(params, 0, 1).saturating_sub(1).min(COLS - 1),
            'd' => self.r = Grid::p(params, 0, 1).saturating_sub(1).min(ROWS - 1),
            'J' => {
                let m = Grid::p(params, 0, 0);
                if m == 2 || m == 3 {
                    self.cells = vec![vec![' '; COLS]; ROWS];
                } else if m == 0 {
                    for cc in self.c..COLS { self.cells[self.r][cc] = ' '; }
                    for rr in self.r + 1..ROWS { self.cells[rr] = vec![' '; COLS]; }
                }
            }
            'K' => {
                let m = Grid::p(params, 0, 0);
                if m == 0 { for cc in self.c..COLS { self.cells[self.r][cc] = ' '; } }
                else if m == 1 { for cc in 0..=self.c.min(COLS - 1) { self.cells[self.r][cc] = ' '; } }
                else { self.cells[self.r] = vec![' '; COLS]; }
            }
            _ => {}
        }
    }
}

fn seq(name: &str) -> Vec<u8> {
    match name {
        "bp-lf" => b"\x1b[200~\n\x1b[201~".to_vec(),
        "bp-cr" => b"\x1b[200~\r\x1b[201~".to_vec(),
        "esc-cr" => b"\x1b\r".to_vec(),
        "esc-lf" => b"\x1b\n".to_vec(),
        "csi-u" => b"\x1b[13;2u".to_vec(),
        "lf" => b"\n".to_vec(),
        "bs-cr" => b"\\\r".to_vec(),
        "esccr-cr" => b"\x1b\r\r".to_vec(),   // 换行序列后跟一个裸回车(模拟"Enter没被拦住")
        "bpcr-cr" => b"\x1b[200~\r\x1b[201~\r".to_vec(),
        _ => b"\n".to_vec(),
    }
}

fn main() {
    let cand = std::env::args().nth(1).unwrap_or_else(|| "bp-cr".into());
    let sys = native_pty_system();
    let pair = sys.openpty(PtySize { rows: ROWS as u16, cols: COLS as u16, pixel_width: 0, pixel_height: 0 }).unwrap();
    let comspec = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".into());
    let mut cmd = CommandBuilder::new(comspec);
    cmd.arg("/c");
    cmd.arg("claude");
    for (k, v) in std::env::vars() { cmd.env(k, v); }
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

    std::thread::sleep(Duration::from_secs(5));
    let _ = writer.write_all(b"LINEONE");
    let _ = writer.flush();
    std::thread::sleep(Duration::from_millis(400));
    let _ = writer.write_all(&seq(&cand));
    let _ = writer.flush();
    std::thread::sleep(Duration::from_millis(400));
    let _ = writer.write_all(b"LINETWO");
    let _ = writer.flush();
    std::thread::sleep(Duration::from_secs(2));
    let _ = child.kill();

    let data = buf.lock().unwrap().clone();
    let mut parser = Parser::new();
    let mut grid = Grid::new();
    for &b in &data {
        parser.advance(&mut grid, b);
    }
    let rows: Vec<String> = grid.cells.iter().map(|r| r.iter().collect::<String>().trim_end().to_string()).collect();

    let r1 = rows.iter().position(|l| l.contains("LINEONE"));
    let r2 = rows.iter().position(|l| l.contains("LINETWO"));
    let same = r1.is_some() && r1 == r2;
    let s = String::from_utf8_lossy(&data);
    let submitted = s.contains("esc to interrupt") || (r1.is_none() && r2.is_some());

    println!("=== 候选: {} ===", cand);
    println!("最终屏幕里 LINEONE 行={:?}  LINETWO 行={:?}", r1, r2);
    let verdict = if submitted && r1.is_none() {
        ">>> 提交了：LINEONE 已发出、不在输入框 ❌"
    } else if same {
        ">>> 没换行：两者同一行(拼接) ❌"
    } else if let (Some(a), Some(b)) = (r1, r2) {
        if b == a + 1 { ">>> 软换行成功：两者相邻两行 ✅" } else { ">>> 不同行但不相邻(存疑)" }
    } else {
        ">>> 标记缺失(存疑)"
    };
    println!("{}", verdict);
    println!("--- 最终屏幕(非空行) ---");
    for (i, l) in rows.iter().enumerate() {
        if !l.is_empty() {
            println!("{:>2}| {}", i, l.chars().take(120).collect::<String>());
        }
    }
}
