import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { OblivionisConfig, defaultConfig } from "@oblivionis/shared";

/**
 * 把任意旧版本的原始配置升级到当前 schema 版本。当前仅 v1，是个恒等占位 +
 * 未来改 schema 时的迁移挂钩（在这里把 v1→v2，避免老配置直接 parse 失败）。
 */
function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  // 例：未来 schema 升到 2 时——
  // const r = raw as Record<string, unknown>;
  // if (r.version === 1) { /* …字段迁移… */ r.version = 2; }
  return raw;
}

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

  private parseFile(p: string): OblivionisConfig {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    // zod 会补齐缺省字段；先过 migrate 把旧版本升级到当前 schema
    return OblivionisConfig.parse(migrate(raw));
  }

  private load(): OblivionisConfig {
    if (existsSync(this.path)) {
      try {
        return this.parseFile(this.path);
      } catch (e) {
        // 主配置损坏（写一半 / 手改坏 / 磁盘异常）→ 先尝试用上一份备份恢复，
        // 别直接崩 + 丢掉用户全部节点。主+备份都坏才 fail-closed 抛出。
        const bak = `${this.path}.bak`;
        if (existsSync(bak)) {
          try {
            const recovered = this.parseFile(bak);
            console.warn(`[config] 主配置解析失败(${(e as Error).message})，已从备份恢复：${bak}`);
            this.writeAtomic(recovered); // 把好的备份写回主文件（不走 save 的备份步骤，避免用损坏文件覆盖 .bak）
            return recovered;
          } catch {
            /* 备份也坏 → 落到下面抛出 */
          }
        }
        throw e;
      }
    }
    const cfg = defaultConfig();
    this.save(cfg);
    return cfg;
  }

  /** 原子写：先写临时文件再 rename（同盘 rename 原子）——写一半崩了也不会污染主文件。 */
  private writeAtomic(parsed: OblivionisConfig): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(parsed, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  save(cfg: OblivionisConfig): OblivionisConfig {
    const parsed = OblivionisConfig.parse(cfg);
    // 安全硬约束：App Secret 只存 OS 凭据管理器，绝不写盘（也不进内存 config / WS 广播）。
    // 运行时真正用的密钥在 secret-store.ts（来自 Tauri 经 env 注入的凭据管理器值）。
    parsed.feishu.appSecret = "";
    // 落盘前把现有的「上一份有效配置」复制成 .bak，损坏时可回滚。
    if (existsSync(this.path)) {
      try {
        copyFileSync(this.path, `${this.path}.bak`);
      } catch {
        /* 备份失败不阻断保存 */
      }
    }
    this.writeAtomic(parsed);
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
