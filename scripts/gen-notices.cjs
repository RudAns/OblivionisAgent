#!/usr/bin/env node
/*
 * 生成 THIRD-PARTY-NOTICES.md —— 汇总「打包进成品」的第三方依赖(JS 生产依赖 + Rust crate)
 * 的许可证与版权声明，满足 MIT/BSD/ISC/Apache-2.0 等宽松许可「分发时须保留声明」的要求。
 * 本项目自身按 GPL-3.0 授权，不影响也不能覆盖以下组件各自的原始许可。
 *
 * 用法：在仓库根目录执行 `node scripts/gen-notices.cjs`（发布前重跑即可刷新）。
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const sh = (cmd, cwd) =>
  execSync(cmd, { cwd, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();

function findLicenseText(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return null;
    const f = fs
      .readdirSync(dir)
      .find((n) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n) && fs.statSync(path.join(dir, n)).isFile());
    if (!f) return null;
    return fs.readFileSync(path.join(dir, f), "utf8").trim() || null;
  } catch {
    return null;
  }
}

// ---- JS 生产依赖 ----
const js = JSON.parse(sh("pnpm licenses list --prod --json"));
const jsPkgs = [];
for (const spdx of Object.keys(js))
  for (const p of js[spdx])
    jsPkgs.push({
      name: p.name,
      version: (p.versions || []).join(", "),
      spdx,
      homepage: p.homepage || "",
      author: typeof p.author === "string" ? p.author : (p.author && p.author.name) || "",
      text: findLicenseText(p.paths && p.paths[0]),
    });
jsPkgs.sort((a, b) => a.name.localeCompare(b.name));

// ---- Rust crate（cargo metadata，含传递依赖；排除工作区自身）----
let rust = null;
try {
  const meta = JSON.parse(sh("cargo metadata --format-version 1", path.join("apps", "desktop", "src-tauri")));
  const ws = new Set(meta.workspace_members || []);
  const seen = new Set();
  rust = [];
  for (const p of meta.packages) {
    if (ws.has(p.id)) continue;
    const key = p.name + "@" + p.version;
    if (seen.has(key)) continue;
    seen.add(key);
    rust.push({
      name: p.name,
      version: p.version,
      spdx: p.license || (p.license_file ? "(见 license_file)" : "(未声明)"),
      repository: p.repository || "",
    });
  }
  rust.sort((a, b) => a.name.localeCompare(b.name));
} catch {
  rust = null;
}

// ---- 组装 markdown ----
const L = [];
L.push("# Third-Party Notices");
L.push("");
L.push("OblivionisAgent 的成品（桌面 exe / sidecar exe / 安装包）捆绑分发了下列第三方开源组件。");
L.push("本项目自身按 GNU GPL-3.0 授权，但以下各组件仍各自适用其原始许可证；");
L.push("此处保留其许可证与版权声明，以满足 MIT / BSD / ISC / Apache-2.0 等许可「分发须保留声明」的要求。");
L.push("");
L.push("> 本文件由 `scripts/gen-notices.cjs` 自动生成，发布前可重跑刷新。");
L.push("");
L.push("## JavaScript / TypeScript 依赖（生产，随前端与 bridge 打包）");
L.push("");
L.push("共 " + jsPkgs.length + " 个包。");
L.push("");
for (const p of jsPkgs) {
  L.push("### " + p.name + "@" + p.version + "  —  " + p.spdx);
  if (p.homepage) L.push(p.homepage);
  L.push("");
  if (p.text) {
    L.push("```");
    L.push(p.text);
    L.push("```");
  } else {
    L.push("_(包内未附许可证文件；适用 " + p.spdx + (p.author ? "，版权所有 " + p.author : "") + ")_");
  }
  L.push("");
}
L.push("## Rust crate（静态链接进桌面 exe，含传递依赖）");
L.push("");
if (!rust) {
  L.push("_(cargo metadata 未能运行；在 apps/desktop/src-tauri 下跑 `cargo metadata` 后重新生成。)_");
} else {
  L.push("共 " + rust.length + " 个 crate。Rust 生态约定每个 crate 在其源码仓库内附带许可证全文，按 SPDX 适用如下：");
  L.push("");
  L.push("| Crate | 版本 | 许可证 | 仓库 |");
  L.push("|---|---|---|---|");
  for (const c of rust) L.push("| " + c.name + " | " + c.version + " | " + c.spdx + " | " + c.repository + " |");
  L.push("");
}
L.push("## 运行时");
L.push("");
L.push(
  "- **Node.js**（由 @yao-pkg/pkg 打进 bridge sidecar exe）：Node.js 采用 MIT 许可，其内含 V8(BSD)、OpenSSL、ICU、libuv 等组件各有许可，详见 Node.js 发行包内 LICENSE。",
);
L.push(
  "- **Microsoft Edge WebView2 Runtime**：系统运行时组件，由微软按其许可分发，本项目不重分发其二进制。",
);
L.push("");

fs.writeFileSync("THIRD-PARTY-NOTICES.md", L.join("\n"), "utf8");
console.log("写出 THIRD-PARTY-NOTICES.md：JS " + jsPkgs.length + " 包 + Rust " + (rust ? rust.length : 0) + " crate");
