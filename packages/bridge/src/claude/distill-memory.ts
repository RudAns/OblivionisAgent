import spawn from "cross-spawn";
import { GROUP_MEMORY_BUDGET } from "../group-memory-store.js";

export interface DistillOptions {
  binPath: string;
  cwd: string;
  log?: (msg: string) => void;
}

/**
 * 群记忆提炼（反思式，问答后异步跑）：给定当前 GROUP.md + 最新一轮问答，
 * 输出"更新后的 GROUP.md"（≤配额）或 NO_CHANGE。无状态 haiku 调用，绝不影响主回复。
 *
 * 记的是：群成员偏好/称呼/相处方式、群里的约定与术语、反复出现的话题。
 * 不记：一次性问题、具体技术答案本身、密钥/权限/个人隐私（这些由护栏挡，也不该进记忆）。
 */
export async function distillGroupMemory(
  current: string,
  question: string,
  answer: string,
  senderName: string,
  opts: DistillOptions,
): Promise<string | null> {
  const prompt = [
    "你在维护一个飞书群的长期记忆文件(GROUP.md)。下面是当前记忆和群里最新一轮对话。",
    `任务：判断这轮对话有没有【值得长期记住的群信息】，给出更新后的完整 GROUP.md。`,
    "该记：群成员的称呼/偏好/沟通风格、群里的约定与黑话、反复出现的关注点。",
    "不该记：一次性问题、技术答案本身、密钥/权限/隐私、临时内容。",
    `硬约束：整份 GROUP.md ≤ ${GROUP_MEMORY_BUDGET} 字符。接近上限时合并同类条目、删过时项，不要堆积。`,
    "用简洁的 markdown 列表。若这轮没有值得记的，只输出 NO_CHANGE。",
    "只输出文件内容或 NO_CHANGE，不要解释、不要代码块包裹。",
    "",
    "===== 当前 GROUP.md =====",
    current || "(空)",
    "",
    `===== 最新一轮（${senderName}）=====`,
    `问：${question.slice(0, 1500)}`,
    `答：${answer.slice(0, 1500)}`,
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
      resolve(null);
    }, 60_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const text = out.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/, "").trim();
      if (!text || /NO_CHANGE/i.test(text.slice(0, 40)) || text.length < 3) {
        resolve(null);
        return;
      }
      const capped = text.length > GROUP_MEMORY_BUDGET ? text.slice(0, GROUP_MEMORY_BUDGET) : text;
      opts.log?.(`群记忆更新 (${capped.length} 字)`);
      resolve(capped);
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
