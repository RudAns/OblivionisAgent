import { classifyIntent } from "./claude/classify-intent.js";

async function main() {
  const intents = ["用户想触发打包、角色管线CI或构建（要求执行/运行 CI）"];
  const opts = { binPath: "claude", cwd: process.cwd(), log: (m: string) => console.log("  [log]", m) };
  const cases = [
    "帮我触发一下角色管线CI",
    "跑一下打包",
    "角色管线CI是什么意思？",
    "你好，角色管线怎么用",
  ];
  for (const t of cases) {
    const idx = await classifyIntent(t, intents, opts);
    console.log(JSON.stringify(t), "->", idx, idx === 1 ? "【打包/CI 分支】" : "【默认分支】");
  }
}
main();
