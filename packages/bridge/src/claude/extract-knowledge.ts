import spawn from "cross-spawn";

export interface ExtractOptions {
  binPath: string;
  cwd: string;
  log?: (msg: string) => void;
}

/**
 * 从一轮群聊问答中提取"值得沉淀为项目长期规则"的候选（知识收件箱的入口）。
 * 无状态 haiku 调用（同 classify-intent 模式），严格 JSON 输出；绝大多数闲聊返回空数组。
 * 失败/超时一律静默返回 []——提取是锦上添花，绝不能影响主回复链路。
 */
export async function extractKnowledge(
  question: string,
  answer: string,
  opts: ExtractOptions,
): Promise<string[]> {
  const prompt = [
    "你是规则提取器。下面是一个项目群里的一轮问答。",
    "任务：判断这轮对话中是否出现了【值得写进项目长期规则文档的指令性内容】，例如：",
    "- 用户纠正了某个流程/约定（\"以后打包前要先跑 lint\"）",
    "- 明确的新规则/偏好（\"CI 结果只发简短中文摘要\"）",
    "- 对助手行为的持久性要求（\"回答这个群的问题永远附上文档链接\"）",
    "不算规则的：一次性问题、闲聊、具体技术答案本身、已经是常识的内容；",
    "也【绝不要】提取这些：助手的语气/人设/口头禅本身（固定称呼、颜文字、\"喵~\"之类）、",
    "路由前缀或系统提示词里已经写死的指令（这些是配置、不是用户当场提出的新规则）。",
    "输出：严格的 JSON 字符串数组（每条规则一句话、祈使句、≤60字），没有则输出 []。不要输出任何其它文字。",
    "",
    "【提问】",
    question.slice(0, 2000),
    "",
    "【回答】",
    answer.slice(0, 2000),
  ].join("\n");

  return new Promise((resolve) => {
    const child = spawn(
      opts.binPath,
      [
        "-p",
        "--model",
        "haiku",
        "--tools",
        "",
        "--no-session-persistence",
        "--output-format",
        "text",
      ],
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
      resolve([]);
    }, 60_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        // 容忍模型外层包了代码块
        const cleaned = out.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        const arr = JSON.parse(cleaned) as unknown;
        if (Array.isArray(arr)) {
          const rules = arr
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter((s) => s.length >= 4 && s.length <= 120)
            .slice(0, 3);
          if (rules.length) opts.log?.(`知识提取: ${rules.length} 条候选`);
          resolve(rules);
          return;
        }
      } catch {
        /* 非 JSON = 无候选 */
      }
      resolve([]);
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}
