// scripts/release.mjs — 本地一键发版（签名 NSIS 安装包 + latest.json + GitHub Release）
//
// 前置：① 已 bump 好版本号（5 处）+ CHANGELOG；② ~/.tauri/oblivionis-updater.key 在；
//       ③ gh 已登录；④ apps/desktop/src-tauri/binaries 下有 oblivionis-bridge-*.exe。
// 用法：node scripts/release.mjs          （发布说明默认取 CHANGELOG 顶部该版本段）
//       OBL_NOTES_FILE=path node ...      （自定义发布说明文件）
//       OBL_DRY_RUN=1 node ...            （只构建+生成 latest.json，不创建 Release）
//
// 自动更新只对「已装了更新器的版本(≥0.6.0)」生效；首个更新器版本要用户手动装一次。
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "RudAns/OblivionisAgent";
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const KEY_PATH = join(HOME, ".tauri", "oblivionis-updater.key");
const DRY = process.env.OBL_DRY_RUN === "1";

const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });

// 1) 版本号（以 tauri.conf 为准）
const confPath = join(ROOT, "apps/desktop/src-tauri/tauri.conf.json");
const version = JSON.parse(readFileSync(confPath, "utf8")).version;
const tag = `v${version}`;
console.log(`▶ 发版 ${tag}${DRY ? " （DRY RUN）" : ""}`);

// 2) 前置检查
if (!existsSync(KEY_PATH)) die(`找不到更新签名私钥：${KEY_PATH}\n  先跑：pnpm tauri signer generate -w "${KEY_PATH}"`);
const binDir = join(ROOT, "apps/desktop/src-tauri/binaries");
if (!existsSync(binDir) || !readdirSync(binDir).some((f) => /^oblivionis-bridge.*\.exe$/.test(f)))
  die("缺少引擎 sidecar：先在 packages/bridge 跑 `pnpm package`");

// 3) 签名构建 NSIS（externalBin 已把 bridge 一起打进安装包）
// 注意：Tauri build 读 TAURI_SIGNING_PRIVATE_KEY（私钥「内容」），不是 *_PATH —— 所以这里读出文件内容传进去。
console.log("▶ 构建签名安装包（pnpm tauri build）…");
run("pnpm tauri build", {
  cwd: join(ROOT, "apps/desktop"),
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY_PATH, "utf8"),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
  },
});

// 4) 定位产物
const nsisDir = join(ROOT, "apps/desktop/src-tauri/target/release/bundle/nsis");
const files = existsSync(nsisDir) ? readdirSync(nsisDir) : [];
// 按当前版本号挑（nsis 目录里可能残留旧版本的 setup.exe，不能用 find 抓到第一个）
const setup = files.find((f) => f.includes(`_${version}_`) && f.endsWith("-setup.exe"));
const sigFile = files.find((f) => f.includes(`_${version}_`) && f.endsWith("-setup.exe.sig"));
if (!setup || !sigFile) die(`没在 ${nsisDir} 找到 ${version} 的 *-setup.exe / *.sig`);
const signature = readFileSync(join(nsisDir, sigFile), "utf8").trim();

// 5) 发布说明：优先 OBL_NOTES_FILE，否则抽 CHANGELOG 里该版本段
let notes = `OblivionisAgent ${tag}`;
const notesFile = process.env.OBL_NOTES_FILE;
if (notesFile && existsSync(notesFile)) notes = readFileSync(notesFile, "utf8");
else {
  try {
    const cl = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
    const m = cl.match(new RegExp(`(##\\s*\\[${version.replace(/\./g, "\\.")}\\][\\s\\S]*?)(?=\\n##\\s*\\[|$)`));
    if (m) notes = m[1].trim();
  } catch {}
}

// 6) latest.json（更新器读它：version / 该平台的 signature + 安装包下载 URL）
const url = `https://github.com/${REPO}/releases/download/${tag}/${setup}`;
const latest = {
  version,
  notes: notes.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim().slice(0, 180) ?? tag,
  pub_date: new Date().toISOString(),
  platforms: { "windows-x86_64": { signature, url } },
};
const latestPath = join(nsisDir, "latest.json");
writeFileSync(latestPath, JSON.stringify(latest, null, 2));
console.log(`▶ 已生成 latest.json（${setup}）`);

if (DRY) {
  console.log("✓ DRY RUN 完成。产物：\n  " + join(nsisDir, setup) + "\n  " + latestPath);
  process.exit(0);
}

// 7) 创建 GitHub Release（上传 安装包 + latest.json；--latest 让 latest/download 解析到它）
const notesPath = join(nsisDir, "_notes.md");
writeFileSync(notesPath, notes);
console.log("▶ 创建 GitHub Release…");
run(`gh release create ${tag} "${join(nsisDir, setup)}" "${latestPath}" --title "${tag}" --notes-file "${notesPath}" --latest`);
console.log(`✅ 发布完成：https://github.com/${REPO}/releases/tag/${tag}`);
console.log("ℹ 老用户(≤0.5.0 便携版)需手动装这一版；之后版本会自动更新。");
