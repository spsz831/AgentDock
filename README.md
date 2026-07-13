# AgentDock

AgentDock 是 **AI 编码助手（Claude Code / Codex）环境的迁移、备份与版本化工具**——你的 AI 编程助手的 dotfiles 工具。

> 产品定位、目标用户、边界与路线图见 **[产品需求文档 (PRD)](./docs/PRD.md)**，本文档对外口径一律以 PRD 为准。

发布与版本维护请参考：[Release Guide](./docs/release.md) 与 [Changelog](./CHANGELOG.md).

## 安装

AgentDock 以 npm 包发布（包名 `agentdock-cli`，命令为 `agentdock`），要求 Node.js >= 18：

```bash
# 全局安装，获得 agentdock 命令
npm install -g agentdock-cli

# 或免安装直接运行（npx 会临时拉取）
npx agentdock-cli --help
```

安装后所有命令以 `agentdock` 调用，例如 `agentdock scan --agent claude`。
（仓库贡献者仍可用开发模式 `npm run cli -- <command>`。）

## 功能范围（按层）

- `scan`：自动发现并提取 Claude Code / Codex 的 AI 助手环境（MCP / Skill / Agent / Plugin / Hook / 记忆），隔离敏感信息，产出领域化 manifest v3
- `export`：把扫描产物打包成可迁移包（敏感值替换为占位符，绝不写入真实 token）
- `install`：从迁移包还原到目标机（支持 `--env` 回注真实值）
- `validate`：校验清单
- `doctor`：体检当前环境或迁移包——无真实令牌泄露、无运行态文件混入
- `list`：列出已扫描捕获（或安装包包含）的助手环境定义清单，纯展示、不读取源机、不改动任何文件

## Quickstart

```bash
# 安装后所有命令以 agentdock 调用；仓库贡献者可用开发模式 npm run cli -- <command>
npm run cli -- scan
npm run cli -- scan --agent claude --json
npm run cli -- scan --agent claude --root ~ --out ./scan-out
npm run cli -- scan --agent codex --root ~ --out ./scan-codex
npm run cli -- export --from-scan ./scan-out/agentdock.scan.yml --out ./pkg
npm run cli -- export --from-scan ./scan-out/agentdock.scan.yml --out ./pkg --env ./scan-out/.env
npm run cli -- install ./pkg ./restored
npm run cli -- doctor --agent claude --root ~
npm run cli -- doctor --from-scan ./scan-out/agentdock.scan.yml
npm run cli -- doctor --package ./pkg
npm run cli -- doctor --agent claude --root ~ --out ./doctor-out
npm run cli -- list --from-scan ./scan-out/agentdock.scan.yml
npm run cli -- list --from-scan ./scan-out/agentdock.scan.yml --agent codex
npm run cli -- list --package ./pkg
npm run cli -- list --from-scan ./scan-out/agentdock.scan.yml --out ./list-out
```

## 端到端：把 AI 助手环境搬到新机器

假设要把旧机的 Claude Code / Codex 环境整体迁移到新机（含 MCP、Skill、记忆、设置，且**绝不带真实 token**）：

```bash
# 1) 在旧机扫描，隔离敏感信息（产出 agentdock.scan.yml + .env.example）
agentdock scan --agent all --root ~ --out ./scan-out

# 2) 把扫描产物打包成可迁移包（敏感值替换为 {{占位符}}，绝不写入真实 token）
agentdock export --from-scan ./scan-out/agentdock.scan.yml --out ./pkg

# 3) 拷到新机后，体检包：无真实令牌泄露、无运行态文件混入
agentdock doctor --package ./pkg

# 4) 还原到新机（目标机填写 .env 后可用 --env 回注真实值）
agentdock install ./pkg ~

# 5) 查看本次捕获了什么
agentdock list --package ./pkg
```

`scan` 永不读取 `auth.json` / `logs.sqlite` 等运行态文件，真实 token 值不会写入任何产物；`doctor --package` 会二次校验包内无真实令牌泄露。

## Current behavior

- manifest v2 支持 `sources[*].destination`
- v1 manifest 仍可读取并校验（仅用于兼容旧包）
- `validate/export/install/scan/doctor/list --json` 统一为版本化协议（`schemaVersion`、`generatedAt`、`toolVersion`、`command`、`success`、`data`、`errors`）
- 所有 `--json` 的 `errors` 为结构化数组：`[{ code, message }]`
- `scan` 自动发现 AI 助手环境并隔离敏感信息，生成 `agentdock.scan.yml` + `.env.example` + `scan-report.md`：
  - **Claude Code**：MCP（来自 `.claude.json`）、skills、agents、plugins、hooks、记忆文件与 `settings.json`
  - **Codex (OpenAI)**：`config.toml`（含 `mcp_servers` 与 provider 配置）、`AGENTS.md` 记忆文件
- `scan` 永不包含运行态文件：`auth.json` / `.credentials.json` / `logs.sqlite` / `history.sqlite` / `cache` 等，真实 token 值不会写入任何产出；Codex 的 `auth.json` / `logs.sqlite` 同样被强制跳过
- `scan --agent codex` 现已实现：解析 `~/.codex/config.toml`（TOML），将 `mcp_servers` 中的 env 令牌与 provider 令牌隔离为 `{{AGENTDOCK_CODEX_<KEY>}}` 占位符
- `scan` 与 `export`/`install` 已闭环：`export --from-scan <scan>/agentdock.scan.yml` 把 v3 扫描产物打包成 `install` 可直接消费的包（manifest.resolved.json + meta/install-plan.json + payload/sources/*），引擎层 `install` 零改动即可还原
- `--from-scan` 默认把敏感值替换为 `{{AGENTDOCK_<AGENT>_<KEY>}}` 占位符，绝不写入真实 token；传入 `--env <file>` 可在打包时回注真实值（占位符名与 `scan` 产出的 `.env.example` 完全一致）
- `--from-scan` 默认输出到扫描目录的同级 `package/` 子目录（可用 `--out` 覆盖）
- MCP server：Claude 的 MCP 在打包时被聚合写入单一 `.claude.json`（仅 mcpServers 段），适配"还原到全新/目标机"；Codex 的 `mcp_servers` 内嵌在 `config.toml` 中，作为 `settings` 条目整体捕获并在导出时按 TOML 打码还原，绝不生成 `.claude.json`；其它定义（skills/agents/plugins/hooks/记忆/settings）按相对路径原样拷入 `payload/sources/`
- `export --from-scan` 在输出目录持排他锁，错误码复用 `MANIFEST_INVALID`（v3 以外版本）与 `LOCK_TIMEOUT`
- `doctor` 体检当前 AI 助手环境（默认 `--agent all`，复用 scan 的扫描与敏感识别）：配置合法性、可迁移内容清点、敏感泄露风险（自由文本文件中的真实令牌会被标红，因 scan 不对 skill/agent/memory/hook/plugin 打码）、运行态隔离确认
- `doctor --from-scan <yml>` 审计扫描产物：源文件引用完整性、产物无真实令牌泄露、产物无运行态文件、隔离机密数量与 `.env.example` 占位符数量一致
- `doctor --package <dir>` 审计安装包（`payload/sources`）：同样检查无真实令牌泄露、无运行态文件混入
- `doctor --out <dir>` 把体检报告写入 `doctor-report.md`；`--json` 输出机器可读报告（沿用统一协议），发现失败项时退出码非 0
- 错误码新增 `DOCTOR_FAILED`（doctor 运行期异常兜底）
- `list` 列出扫描产物（或安装包）的捕获清单：按助手（Claude Code / Codex）分组展示 MCP / Skill / Agent / Plugin / Hook / Memory / Settings 的名称与计数，并汇总隔离机密数量；`--agent codex` 可仅看 Codex
- `list --from-scan <yml>` 读取 v3 扫描 manifest（`agentdock.scan.yml`）；`list --package <dir>` 读取安装包的 `manifest.resolved.json` 并额外展示 `meta/install-plan.json` 的文件→目标映射
- `list --out <dir>` 把清单写入 `list-report.md`；`--json` 输出机器可读清单（沿用统一协议）
- 错误码新增 `LIST_FAILED`（list 运行期异常兜底）
- templates 在 `export` 阶段完成 `{{VAR_NAME}}` 渲染
- `options.followSymlinks` 默认是 `true`，导出目录时会跟随并复制链接目标内容
- 设置 `options.followSymlinks: false` 可在导出时跳过链接目录/文件
- `install` 默认会先做冲突预检查：已存在且内容相同的文件自动跳过（幂等），仅内容真冲突才报错
- `install --overwrite` 允许覆盖已存在文件
- `install` 对每个目标路径做越界校验，阻止 `destination: ../../../` 形式的路径穿越
- `install` / `export` 在目标/输出目录上持有排他锁，并发执行会被串行化（避免交错损坏）
- 所有写操作（manifest / 包 / 升级结果）均为 tmp + rename 原子写，崩溃不残留半截文件

## JSON Error Codes

- `MISSING_ARGUMENT`
- `MANIFEST_NOT_FOUND`
- `MANIFEST_INVALID`
- `TEMPLATE_VARIABLE_MISSING`
- `MISSING_PACKAGE_MANIFEST`
- `MISSING_INSTALL_PLAN`
- `INSTALL_CONFLICT`
- `PATH_ESCAPE`
- `LOCK_TIMEOUT`
- `SCAN_FAILED`
- `DOCTOR_FAILED`
- `LIST_FAILED`
- `UNKNOWN_ERROR`
