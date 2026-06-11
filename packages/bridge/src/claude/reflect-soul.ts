import spawn from "cross-spawn";

export interface ReflectOptions {
  binPath: string;
  cwd: string;
  log?: (msg: string) => void;
}

/**
 * 人格反思（自主迭代闭环的"思考"步，vision-agentic-roadmap.md §2）：
 * 给定当前 SOUL.md + 最近群聊片段，让 claude 提议一版修订后的人格文件。
 * - 无状态调用；用默认模型（人格修订吃品味，haiku 不够；订阅无边际成本，每天一次）
 * - 输出整份新 SOUL.md；若认为无需修改输出 NO_CHANGE
 * - 提案**不直接生效**——进知识收件箱等主人裁决（kind=soul）
 */
export async function reflectSoul(
  currentSoul: string,
  recentChats: string,
  opts: ReflectOptions,
): Promise<string | null> {
  const prompt = [
    "你是 AI 助手的人格守护者。下面是它当前的人格文件(SOUL.md)和它最近在飞书群里的对话记录。",
    "任务：审视人格在实际对话中的表现，提议一版【修订后的完整 SOUL.md】，让人格更鲜活、更贴合这个群：",
    "- 可以吸收群里出现的称呼、梗、相处方式（写进 Style）",
    "- 用户抱怨过语气/啰嗦/太正式的，必须修正",
    "- 保持原有结构(# Identity / # Style / # Avoid / # Defaults)，只演化不推翻",
    "- 人格只影响表达，不得写入任何关于密钥/权限/越权的内容",
    "如果近期对话没有值得演化的信号，只输出 NO_CHANGE。",
    "否则输出完整的新 SOUL.md 内容（纯 markdown，不要解释、不要代码块包裹）。",
    "",
    "===== 当前 SOUL.md =====",
    currentSoul.slice(0, 6000),
    "",
    "===== 最近群聊（时间正序）=====",
    recentChats.slice(0, 8000),
  ].join("\n");

  return new Promise((resolve) => {
    const child = spawn(
      opts.binPath,
      ["-p", "--tools", "", "--no-session-persistence", "--output-format", "text"],
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
      resolve(null);
    }, 180_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const text = out.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
      if (!text || /NO_CHANGE/i.test(text.slice(0, 60)) || text.length < 40 || text.length > 12_000) {
        resolve(null);
        return;
      }
      // 起码要像一份 soul 文件
      if (!text.includes("#")) {
        resolve(null);
        return;
      }
      opts.log?.(`人格反思产出修订提案 (${text.length} 字)`);
      resolve(text);
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
