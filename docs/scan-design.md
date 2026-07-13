# AgentDock `scan` 命令设计规格

> 本文档由原 `MVP_边界文档.md` 转正而来。原文档承诺"重建 Claude Code / Codex 工作环境"但未落地；
> 本规格定义 `scan` 命令，把该承诺变成可执行的领域逻辑——这是 AgentDock 与通用 dotfiles 工具的分水岭。

## 1. 目标

自动发现并提取开发者机器上 **Claude Code** 与 **Codex** 环境中"可迁移的定义"，
隔离其中的敏感信息（token / 凭据），跳过运行态产物，最终产出：

1. **领域化 manifest v3**（`agentdock.scan.yml`）：描述要迁移的 MCP / Skill / Agent / Plugin / Hook / 记忆。
2. **`.env.example`**：从定义中提取的敏感变量占位清单，供目标机器填值。
3. **人类可读报告**：扫描到了什么、跳过了什么、隔离了什么。

## 2. 痛点（基于真实 `~` 结构调研）

| Agent | 配置散落位置 | 格式 | 关键陷阱 |
|-------|-------------|------|----------|
| Claude Code | `settings.json`（permissions/model/hooks/enabledPlugins/extraKnownMarketplaces/env）、`.claude.json`（`mcpServers`）、`skills/*/SKILL.md`、`agents/*.md`、`plugins/*`、`hooks/*`、`CLAUDE.md` | JSON | MCP 定义**不在** settings.json 而在 `.claude.json`；`settings.json.env` 段**混着 token** 与要迁移的定义 |
| Codex | `config.toml`（model/profiles/projects）、`AGENTS.md`、`auth.json`、`goals/logs.sqlite` | TOML | `auth.json` 是纯凭据**绝不能碰**；`logs.sqlite` 是运行态 |

手动迁移极易漏文件、漏格式、误泄密。chezmoi / dotbot 不懂这些结构，需用户手写模板。

## 3. 命令契约

```
agentdock scan [--agent claude|codex|all] [--root <path>] [--out <dir>] [--json]
```

- 默认 `--agent all`，依次跑 ClaudeScanner、CodexScanner。
- `--root` 覆盖默认 home 推导（便于测试 / CI）。
- 产出落 `--out`（默认 `./agentdock-scan`），含 manifest + `.env.example` + `scan-report.md`。
- `--json` 输出机器可读报告（沿用统一 JSON 协议）。

## 4. 四步流程

```
输入(home/--root)
  └─ 1. 发现    定位各 agent 的配置根（~/.claude, ~/.codex）与子目录
       └─ 2. 提取    ClaudeScanner / CodexScanner 解析各自格式(JSON/TOML)
            └─ 3. 分类  可迁移定义 | 敏感信息(隔离) | 运行态(跳过)
                 └─ 4. 产出  manifest v3 + .env.example + report
```

- **发现**：基于已知路径约定（不靠 glob 全盘扫），对缺失目录静默跳过。
- **提取**：Claude 用 JSON 解析；Codex 用 TOML 解析（`config.toml`）。
- **分类**三桶：
  - *可迁移*：MCP 定义、Skill 目录、Agent 文件、Plugin 注册、Hook 脚本、记忆文件（CLAUDE.md / AGENTS.md）。
  - *敏感隔离*：出现在定义中的 token（见 §5），抽成 `{{VAR}}` 占位，记入 `.env.example`。
  - *运行态跳过*：`.credentials.json`、`auth.json`、`logs.sqlite`、`cache/`、`goals/`——**永不导出**，即使用户开 `--include-secrets` 也强制跳过。

## 5. 敏感信息三层防护

1. **识别**：字段名匹配（`env`/`token`/`apiKey`/`secret`/`password`/`auth`）**与**值匹配（形如 `sk-...`/`ghp_...`/`xoxb-...`/`Bearer `）双重判定，降低误报。
2. **替换**：命中处改写为 `{{AGENTDOCK_<AGENT>_<NAME>}}` 占位，原值进入 `.env.example`。
3. **告警**：报告中单列"已隔离敏感项"，提示用户目标机器需填值。

> 纯凭据文件（`auth.json`、`.credentials.json`）按 §4 运行态规则直接跳过，连读都不读。

## 6. manifest v3 结构（领域化）

从 v2 的扁平 `sources: [{id,type,path,destination}]` 升级为带 agent 语义的树：

```yaml
version: 3
project:
  name: <host>-ai-env
agents:
  claude:
    mcp:                 # 来自 .claude.json mcpServers
      - id: github
        type: mcp
        definitionRef: .claude.json#mcpServers.github
    skills:              # skills/* 目录
      - id: ad-creative
        type: skill
        path: ~/.claude/skills/ad-creative
    agents:              # agents/*.md
      - id: planner
        type: agent
        path: ~/.claude/agents/planner.md
    plugins:             # plugins 注册
      - id: some-marketplace
        type: plugin
        source: ~/.claude/plugins/installed_plugins.json
    hooks:               # hooks 脚本
      - id: pre-commit
        type: hook
        path: ~/.claude/hooks/planning/xxx.ps1
    memory:              # 记忆文件
      - id: claude-md
        type: memory
        path: ~/.claude/CLAUDE.md
  codex:
    mcp: []              # 来自 config.toml mcp_servers
    memory:
      - id: agents-md
        type: memory
        path: ~/.codex/AGENTS.md
secrets:                 # 隔离出的占位清单 → 写入 .env.example
  - key: AGENTDOCK_CLUDE_GITHUB_TOKEN
    source: .claude.json#mcpServers.github.env.GITHUB_TOKEN
```

引擎层（export/install/validate/upgrade）**不改造**，直接消费 `agents.*` 下的条目作为广义 source。
v3 → v2 的向后兼容由 `upgrade` 负责（领域条目拍平回 sources）。

## 7. 与引擎层的关系

```
scan ──产出──> manifest v3 ──> export ──> install
                         ↑
                    validate / upgrade (向后兼容 v2)
```

两层解耦：scan 是"生成器"，引擎是"搬运工"。一份安全加固（P0 穿越 / 锁 / 原子写）两层受益。

## 8. 实现里程碑

- **v0.3（本轮）**：`scan --agent claude` MVP——发现 + 提取 + 分类 + 产出 manifest v3 + `.env.example` + 报告；敏感三层防护；跳过运行态。
- **v0.3 后续**：`scan --agent codex`（TOML 解析）；`doctor`（校验还原完整性）；`list`（列出已扫描环境）。
- **v0.4**：跨机器路径重写（home 绝对路径 → 相对占位）+ `npm publish`。

## 9. 验收标准（v0.3 Claude MVP）

- 在本机 `scan --agent claude` 能产出合法 manifest v3 + `.env.example` + `scan-report.md`。
- `settings.json.env` 里的 token 被替换为 `{{...}}` 且出现在 `.env.example`，原值**不落盘**。
- `auth.json` / `logs.sqlite` / `cache/` 绝不出现在产出中。
- 产出的 manifest 能被现有 `export` 消费并 `install` 还原到干净目录。
