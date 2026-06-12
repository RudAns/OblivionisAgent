import spawn from "cross-spawn";

export interface ClassifyOptions {
  binPath: string;
  cwd: string;
  model?: string; // 默认 haiku（快+省）
  /** best=取最佳匹配；priority=按候选顺序第一个命中 */
  mode?: "best" | "priority";
  log?: (msg: string) => void;
}

/**
 * 用一次快速 LLM 调用，判断用户消息命中哪个候选意图。
 * 返回 1..N（命中第几个意图）或 0（都不命中）。
 * 用 `claude -p --model haiku --tools "" --no-session-persistence`，无副作用、不落会话。
 */
export async function classifyIntent(
  text: string,
  intents: string[],
  opts: ClassifyOptions,
): Promise<number> {
  if (intents.length === 0) return 0;
  const list = intents.map((it, i) => `${i + 1}. ${it}`).join("\n");
  const rule =
    opts.mode === "priority"
      ? "按从上到下的顺序逐个判断，返回第一个匹配的编号"
      : "判断最符合下面哪一个候选意图，返回对应编号";
  const prompt =
    `你是一个意图分类器。${rule}(纯数字)；如果都不符合，回复 0。不要解释、不要多余文字。\n\n` +
    `【用户消息】\n${text}\n\n【候选意图】\n${list}\n0. 都不符合\n\n只回复一个数字：`;

  const model = opts.model || process.env.OBLIVIONIS_INTENT_MODEL || "haiku";
  const out = await runText(prompt, model, opts);
  if (out === null) {
    opts.log?.("意图分类失败(分类器出错/超时) -> 交给默认边");
    return -1; // 出错：和"都不匹配(0)"区分开，让路由只走 fallback、别瞎猜第一条
  }
  const m = out.match(/-?\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  const result = n >= 0 && n <= intents.length ? n : 0;
  opts.log?.(`意图分类 -> ${result} (${result === 0 ? "默认" : intents[result - 1]})`);
  return result;
}

function runText(prompt: string, model: string, opts: ClassifyOptions): Promise<string | null> {
  const args = [
    "-p",
    "--model",
    model,
    "--tools",
    "",
    "--permission-mode",
    "default",
    "--no-session-persistence",
    "--output-format",
    "text",
  ];
  return new Promise<string | null>((resolve) => {
    const child = spawn(opts.binPath, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 30_000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => (out += c));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out.trim());
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
