import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { OblivionisConfig, defaultConfig } from "@oblivionis/shared";

/**
 * 配置文件持久化。
 * 默认查找顺序：
 *   1. 环境变量 OBLIVIONIS_CONFIG 指定的路径
 *   2. 当前工作目录下的 ./config.json
 *   3. ~/.oblivionis/config.json
 * 都不存在时，在 ~/.oblivionis/config.json 落一份默认配置。
 */
export function resolveConfigPath(): string {
  if (process.env.OBLIVIONIS_CONFIG) return resolve(process.env.OBLIVIONIS_CONFIG);
  const cwdCfg = resolve(process.cwd(), "config.json");
  if (existsSync(cwdCfg)) return cwdCfg;
  return resolve(homedir(), ".oblivionis", "config.json");
}

export class ConfigStore {
  readonly path: string;
  private current: OblivionisConfig;

  constructor(path = resolveConfigPath()) {
    this.path = path;
    this.current = this.load();
  }

  get(): OblivionisConfig {
    return this.current;
  }

  private load(): OblivionisConfig {
    if (existsSync(this.path)) {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      // zod 会补齐缺省字段；解析失败直接抛，避免带病运行
      return OblivionisConfig.parse(raw);
    }
    const cfg = defaultConfig();
    this.save(cfg);
    return cfg;
  }

  save(cfg: OblivionisConfig): OblivionisConfig {
    const parsed = OblivionisConfig.parse(cfg);
    // 安全硬约束：App Secret 只存 OS 凭据管理器，绝不写盘（也不进内存 config / WS 广播）。
    // 运行时真正用的密钥在 secret-store.ts（来自 Tauri 经 env 注入的凭据管理器值）。
    parsed.feishu.appSecret = "";
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(parsed, null, 2), "utf8");
    this.current = parsed;
    return parsed;
  }

  /** 局部更新并落盘 */
  update(mut: (cfg: OblivionisConfig) => void): OblivionisConfig {
    const next = structuredClone(this.current);
    mut(next);
    return this.save(next);
  }
}
