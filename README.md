# AgentDock

> 你的 AI 编码助手（Claude Code / Codex）的 dotfiles 工具。
> 把 MCP Server、Skill、Agent、Plugin、Hook、记忆**原样、安全、可复现**地搬到哪里都行 —— **而且绝不把 token 一起带走。**

[![npm version](https://img.shields.io/npm/v/agentdock-cli)](https://www.npmjs.com/package/agentdock-cli)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## 为什么需要 AgentDock

你花几周调好的 AI 编码环境，换台机器就归零。现有办法都不靠谱：

- **chezmoi / dotbot / yadm** —— 只搬文件、做模板，**不懂** Claude 的 `settings.json` 与 `.claude.json` 区别，不知道 `settings.env` 里混着 token，更不会自动跳过 `auth.json`。
- **git + 手动提交** —— 容易把 `auth.json`、真实 token 一起提交；跨机器绝对路径失效。
- **rsync / 云盘** —— 全量复制，`sqlite`/`cache` 也跟着走，机密与定义混在一起无法审计。

AgentDock 要做的：让「重建一套顺手的 AI 编码环境」从「半天手工拷贝 + 祈祷别漏别泄密」，变成「一条命令 + 一份填好的 `.env`」。

> 产品定位、边界与路线图见 **[PRD](./docs/PRD.md)**，本文档对外口径一律以 PRD 为准。

## 安装

```bash
# 全局安装，获得 agentdock 命令
npm install -g agentdock-cli

# 或免安装直接运行（npx 会临时拉取）
npx agentdock-cli --help
```

要求 Node.js >= 18。安装后所有命令以 `agentdock` 调用，例如 `agentdock scan --agent claude`。

## 30 秒上手

```bash
# 1. 扫描当前机器的 AI 助手环境（自动隔离敏感信息）
agentdock scan --agent all --root ~ --out ./my-env

# 2. 打包成可迁移包（敏感值替换为占位符，绝不写入真实 token）
agentdock export --from-scan ./my-env/agentdock.scan.yml --out ./my-env-pkg

# 3. 还原到目标机（填好 .env 后可用 --env 回注真实值）
agentdock install ./my-env-pkg ~
```

## 完整迁移：旧机 → 新机

```bash
# 在旧机：扫描并隔离敏感信息（产出 agentdock.scan.yml + .env.example + scan-report.md）
agentdock scan --agent all --root ~ --out ./scan-out

# 打包成可迁移包
agentdock export --from-scan ./scan-out/agentdock.scan.yml --out ./pkg

# 把 ./pkg 拷到新机后，先体检：无真实令牌泄露、无运行态文件混入
agentdock doctor --package ./pkg

# 还原到新机
agentdock install ./pkg ~

# 查看本次捕获了什么
agentdock list --package ./pkg
```

`scan` 永不读取 `auth.json` / `logs.sqlite` 等运行态文件；真实 token 值不会写入任何产物。`doctor --package` 会二次校验包内无真实令牌泄露。

## 命令速查

| 命令 | 作用 | 典型用法 |
|---|---|---|
| `scan` | 发现并提取 AI 助手环境，隔离敏感信息，产出 v3 manifest | `agentdock scan --agent all --root ~ --out ./out` |
| `export` | 把扫描产物打包成可迁移包（默认打码，`--env` 回注） | `agentdock export --from-scan ./out/agentdock.scan.yml --out ./pkg` |
| `install` | 从包安全还原到目标机（越界校验 / 锁 / 原子写 / 幂等） | `agentdock install ./pkg ~` |
| `validate` | 校验 manifest 合法性 | `agentdock validate ./pkg/manifest.resolved.json` |
| `doctor` | 体检环境 / 包：配置健康度、可迁移性、是否泄密 | `agentdock doctor --agent all --root ~` |
| `list` | 列出已捕获的 MCP / Skill / Agent 等定义清单 | `agentdock list --package ./pkg` |

支持的双助手：**Claude Code**（JSON：`settings.json` + `.claude.json`）与 **Codex**（TOML：`config.toml` + `AGENTS.md`）。

## 安全承诺

- **敏感三层隔离**：字段名 + 值形态双重识别，命中即替换为 `{{AGENTDOCK_<AGENT>_<KEY>}}`，原值进 `.env.example`，绝不下盘。
- **运行态强制跳过**：`auth.json` / `.credentials.json` / `logs.sqlite` / `cache/` 等纯凭据 / 运行产物，即使用户强制也拦下（连读都不读）。
- **引擎防御**：`install` 对每目标路径做越界校验（阻止 `../../` 穿越）；输出 / 目标目录持排他锁防并发交错；所有写为 tmp+rename 原子写；已存在且内容相同的文件自动跳过（幂等）。

> 安全 KPI：敏感泄露事故数 = 0（硬性目标）。

## 文档

- [产品需求文档 PRD](./docs/PRD.md) —— 定位、用户、场景、边界、路线图
- [Changelog](./CHANGELOG.md) —— 版本变更
- [Release Guide](./docs/release.md) —— 发布与版本维护

## License

[MIT](./LICENSE)
