import spawn from "cross-spawn";

export interface ParsedSchedule {
  isSchedule: boolean;
  /** "HH:MM"(每天) 或 "every Nm"/"every Nh"(间隔) */
  schedule?: string;
  /** 到点要执行的指令 */
  prompt?: string;
}

export interface ParseScheduleOptions {
  binPath: string;
  cwd: string;
  log?: (msg: string) => void;
}

/** 粗筛：含定时类关键词才值得跑 haiku 解析（普通消息零开销） */
export function looksLikeSchedule(text: string): boolean {
  return /(每天|每日|每周|每隔|每小?时|每.{0,3}分钟|定时|每晚|每早|every\s+\d|daily|each day)/i.test(text);
}

/**
 * 把"每天早9点把昨天的CI结果发群里"这种自然语言解析成定时任务。
 * 无状态 haiku；严格 JSON。解析不出/不是定时请求 → isSchedule:false。
 */
export async function parseSchedule(text: string, opts: ParseScheduleOptions): Promise<ParsedSchedule> {
  const prompt = [
    "判断下面这句话是不是【要求创建一个周期性定时任务】。是的话抽取触发时刻和要执行的指令。",
    "触发时刻 schedule 只能是两种格式：",
    '- "HH:MM" 表示每天该时刻（24 小时制，如 "09:00"）',
    '- "every Nm" 或 "every Nh" 表示每隔 N 分钟/小时',
    "prompt = 到点要让助手执行的事（把'每天9点'之类的时间词去掉，只留要做的事）。",
    "严格输出 JSON：{\"isSchedule\":true/false,\"schedule\":\"...\",\"prompt\":\"...\"}。不是定时请求则 {\"isSchedule\":false}。不要输出别的。",
    "",
    "用户说：",
    text.slice(0, 600),
  ].join("\n");

  return new Promise((resolve) => {
    const child = spawn(
      opts.binPath,
      ["-p", "--model", "haiku", "--tools", "", "--no-session-persistence", "--output-format", "text"],
      { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env },
    );
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => (out += d));
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({ isSchedule: false });
    }, 30_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ isSchedule: false });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const cleaned = out.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        const o = JSON.parse(cleaned) as ParsedSchedule;
        if (o.isSchedule && o.schedule && o.prompt && validSchedule(o.schedule)) {
          opts.log?.(`解析到定时任务: ${o.schedule} → ${o.prompt.slice(0, 40)}`);
          resolve({ isSchedule: true, schedule: o.schedule.trim(), prompt: o.prompt.trim() });
          return;
        }
      } catch {
        /* 非 JSON */
      }
      resolve({ isSchedule: false });
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

function validSchedule(s: string): boolean {
  return /^(\d{1,2}:\d{2}|every\s+\d+\s*[mh])$/i.test(s.trim());
}
