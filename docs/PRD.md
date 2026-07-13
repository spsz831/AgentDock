# AgentDock 产品需求文档（PRD / 北极星）

> 版本：v1.0（2026-07-12）
> 状态：**生效中** — 后续所有功能取舍、版本排期、文案对外口径均以本文为准。
> 文档层级：本文是**产品级**北极星；命令级实现细节见 `docs/scan-design.md`，manifest 格式见 `docs/manifest.md`，发布流程见 `docs/release.md`。

---

## 0. 一句话定位

**AgentDock 是「AI 编码助手（Claude Code / Codex）环境的迁移、备份与版本化工具」——你的 AI 编程助手的 dotfiles 工具。**

把你在 A 机器上花几周调好的 MCP Server、自定义 Skill、Agent、Plugin、Hook、记忆文件与 settings，**原样、安全、可复现地**搬到 B 机器 / 新同事的机器 / CI 沙箱 / Git 仓库，**而且绝不把 token 一起泄露出去**。

---

## 1. 产品愿景（Vision）

> 让"重建一套顺手的 AI 编码环境"从「半天手工拷贝 + 祈祷别漏文件别泄密」，变成「一条命令 + 一份填好 .env」。

AI 编码助手正在成为开发者的核心生产力。但这类工具的环境配置（MCP、Skill、Agent、Plugin、记忆）高度个性化、高度分散、且混合着机密。目前没有任何工具"懂"这套结构——通用 dotfiles 管理器只搬文件、不懂语义，手动迁移则极易漏配、漏格、泄密。

AgentDock 要成为这个细分赛道的**默认工具**：领域感知、安全优先、对迁移闭环负责。

---

## 2. 我们解决的真问题（Problem）

### 2.1 现状：通用工具 + 手工迁移

| 现状做法 | 它搞不定的事 |
|---|---|
| **chezmoi / dotbot / yadm** | 只搬文件、做模板；**不懂** Claude 的 `settings.json` vs `.claude.json` 结构差异，不知道 `settings.env` 里混着 token，更不会自动跳过 `auth.json` |
| **git + 手动 commit** | 容易把 `auth.json`、`logs.sqlite`、真实 token 一起提交；跨机器路径（绝对 home）失效；无"可迁移 vs 运行态"的概念 |
| **rsync / 云盘同步** | 全量复制，sqlite/cache 也跟着走；机密与定义混在一起，无法审计 |
| **复制粘贴 + 截图发给同事** | 不可复现、不可版本化、无法审计"到底迁了什么" |

### 2.2 真实场景痛点（基于 `~` 结构调研）

- **格式差异**：Claude 用 JSON（`settings.json` + `.claude.json`），Codex 用 TOML（`config.toml`）。
- **配置散落**：MCP 定义**不在** `settings.json` 而在 `.claude.json#mcpServers`；Codex 的 MCP 在 `config.toml` 的 `mcp_servers`。
- **敏感与定义混杂**：`settings.json.env` 段里 `GITHUB_TOKEN` 和 `theme: dark` 躺在一起，要保留定义、隔离 token。
- **运行态污染**：`auth.json`、`.credentials.json`、`logs.sqlite`、`cache/`、`goals/` 是纯凭据/运行产物，**绝不能迁移**，但手工/通用工具会一股脑复制。

手动迁移一次平均 30–60 分钟，且每次都有遗漏与泄密风险。

---

## 3. 目标用户（Target Users）

| 画像 | 典型诉求 | AgentDock 给什么 |
|---|---|---|
| **独立开发者 / 重度 AI 编码用户** | 多机（台式+笔记本+云沙箱）环境一致 | `scan` 一次捕获，`install` 处处还原 |
| **团队 Tech Lead** | 把团队沉淀的 Skill/Agent/MCP 模板化下发 | 可版本化、可审计的"环境即代码"包 |
| **DevOps / 平台工程** | 给 CI 沙箱注入一致的 AI 助手配置 | 安全打码 + `.env` 注入，CI 友好 |
| **开源作者** | 把自己的 AI 工作流随仓库分享（不含密钥） | 敏感隔离 + `.env.example`，可直接进 Git |

**非目标用户**（明确排除）：只想同步任意文件的普通用户、需要双向实时同步的协作者、寻找"AI 助手本身"的人。

---

## 4. 核心场景（Use Cases）

1. **换新机 / 重装**：`scan --agent all` → 把产物提交到 Git/云盘 → 新机 `install` 还原 → 填 `.env` → 环境 1:1 回来了。
2. **团队环境标准化**：Lead `scan` 出团队基线包，成员 `install` 即获得统一 MCP/Skill。
3. **CI 注入**：`.github/workflows` 里 `install` 环境包 + `secrets` 注入 `.env`，沙箱获得与本地一致的 AI 助手配置。
4. **安全审计/体检**：`doctor` 回答"我的配置健康吗？迁得了吗？有没有 token 泄露？"——用户一跑就有反馈。
5. **跨 AI 助手**：同一份 Skill/Agent，从 Claude 迁移描述、Codex 侧 `scan --agent codex` 各取所需。

---

## 5. 定位与差异化（Positioning & Moat）

**赛道选择（关键决策）**：100% 押注「AI 编码助手环境迁移」这一**空白细分赛道**，彻底放弃通用文件打包定位。

护城河来自**领域知识**，而非搬运能力：

```
                懂领域结构？        敏感隔离？        运行态跳过？      跨 AI 助手？
chezmoi/dotbot       ✗                ✗                ✗                ✗
git+手动             ✗(靠人)           ✗                ✗                ✗
rsync/云盘           ✗                ✗                ✗                ✗
AgentDock            ✓                ✓(三层)           ✓(强制)           ✓(扫描器抽象)
```

通用工具"懒得做、也做不对"的事，正是 AgentDock 的全部价值：
- **懂格式**：JSON（Claude）与 TOML（Codex）分别解析。
- **懂位置**：精确知道 MCP 在哪、定义与凭据怎么分离。
- **懂机密**：字段名 + 值双重识别，替换为 `{{占位}}`，生成 `.env.example`。
- **懂边界**：运行态文件**强制跳过**，即使用户强制也拦下。

---

## 6. 竞品分析（Competitive Landscape）

| 工具 | 类型 | 优势 | 短板（我们的机会） |
|---|---|---|---|
| **chezmoi** | dotfiles 管理器 | 模板强、加密可选 | 不懂 AI 助手结构，需手写模板；无敏感自动识别 |
| **dotbot** | dotfiles 符号链接 | 极简 | 纯文件层，无语义；无机密隔离 |
| **yadm** | git 化 dotfiles | 加密集成 | 同 chezmoi，无领域感知 |
| **手动 git/rsync** | 手工 | 零门槛 | 泄密风险高、不可复现、无审计 |
| **（空缺）** | **AI 助手环境专用** | — | **当前无人占据 → AgentDock 的机会** |

**结论**：通用 dotfiles 工具功能强大但"领域盲"；我们要的不是在它们旁边多一个，而是占据"AI 助手环境"这一它们不会认真做的空白格。

---

## 7. 产品边界（Scope / Non-goals）

> 这是历史上"定位与实现偏差"的根源。本 PRD 明确划界，任何超出以下范围的提案须回到本文复议。

**明确做（In-scope）**
- 领域感知的 `scan` / `export` / `install` / `doctor` / `list` / `validate`。
- 敏感信息三层隔离（识别 → 替换 → 告警），`.env.example` 生成。
- 运行态文件强制跳过（安全红线）。
- 跨机/跨版本迁移与还原闭环。

**明确不做（Out-of-scope / Non-goals）**
- ❌ **通用文件同步工具**（rsync/云盘替代品）。
- ❌ **通用 dotfiles 管理器**（与 chezmoi 直接竞争，且无差异化）。
- ❌ **AI 编码助手本身**（不做模型、不做对话）。
- ❌ **配置内容的"优化建议 / 智能改写"**（只搬运、不评判）。
- ❌ **双向实时同步 / 协同编辑**（单向迁移 + 版本化即可）。
- ❌ **托管云服务 / 账号体系**（v0.x 阶段纯 CLI + 本地/ Git 文件，不绑云）。

---

## 8. 功能矩阵（Feature Matrix）

| 命令 | 层 | 定位 | 状态 |
|---|---|---|---|
| `scan` | 领域 | 发现+提取+分类+产出 v3 manifest + `.env.example` + 报告 | ✅ Claude / Codex 双闭环 |
| `export --from-scan` | 桥接 | 把 v3 扫描产物打包成 `install` 可消费的稳定包（默认打码，`--env` 回注） | ✅ 已实现 |
| `install` | 引擎 | 从包安全还原到目标目录（越界校验/锁/原子写/幂等） | ✅ 已加固 |
| `doctor` | 领域 | 环境体检：配置健康度、可迁移性、是否泄密 | ✅ 已实现 |
| `list` | 领域 | 列出已捕获的 MCP/Skill/Agent 等 | ✅ 已实现 |
| `validate` | 引擎 | 校验 manifest 合法性 | ✅ |

---

## 9. 架构概览（Architecture）

两层解耦：领域层负责"理解 AI 助手结构"，引擎层负责"安全搬运"。一份安全加固（P0 路径穿越修复 / 文件锁 / 原子写 / 幂等）两层受益。

```
┌──────────────────────────────────────────────────────────────┐
│  领域层 (Domain)           懂 AI 助手结构、敏感、运行态          │
│   scan ──> manifest v3 ──> export --from-scan ──┐              │
│   doctor  list                                     │           │
└───────────────────────────────────────────────────┼──────────┘
                                                     ▼
┌──────────────────────────────────────────────────────────────┐
│  引擎层 (Engine)           安全搬运工（与领域无关）             │
│   export  install  validate                                  │
│   防御：safeResolveWithin / 锁 / tmp+rename 原子写 / 幂等       │
└──────────────────────────────────────────────────────────────┘
                         ▼
                   install ──> 目标机环境（填 .env 后 1:1 还原）
```

数据流闭环：
```
scan → manifest v3 → export --from-scan → 稳定包 → install → 目标机
   ↑________ validate（校验）________│
```

---

## 10. 安全与信任模型（Security & Trust）

这是产品的信任基石，**不可妥协**：

1. **识别双判**：字段名（`env`/`token`/`apiKey`/`secret`/`password`/`auth`）+ 值形态（`sk-`/`ghp_`/`xoxb_`/`Bearer `）双重命中，降误报。
2. **替换占位**：命中改写为 `{{AGENTDOCK_<AGENT>_<KEY>}}`，原值进 `.env.example`，**绝不落盘**。
3. **运行态红线**：`auth.json` / `.credentials.json` / `logs.sqlite` / `cache/` / `goals/` **强制跳过**，即使用户 `--include-secrets` 也拦下（连读都不读）。
4. **引擎防御**：`install` 对每目标路径做越界校验（阻止 `../../` 穿越）；输出/目标目录持排他锁防并发交错；所有写为 tmp+rename 原子写。
5. **审计可查**：`scan-report.md` 单列"已隔离敏感项"，让用户明确知道"迁了什么、什么需填值"。

**安全 KPI**：敏感泄露事故数 = 0（硬性目标）。

---

## 11. 路线图与里程碑（Roadmap）

| 版本 | 主题 | 范围 | 状态 |
|---|---|---|---|
| **v0.1.2** | 通用打包器（历史） | init/validate/export/install/upgrade | ✅ 已发布（已成过去式，已被 v0.4 精简移除） |
| **v0.2** | 引擎加固 + Claude 扫描闭环 | P0 路径穿越修复/锁/原子写/幂等；`scan --agent claude`；`export --from-scan` 打通 scan→install 闭环 | ✅ 已完成（截至 2026-07-12，48 测全绿） |
| **v0.3** | 覆盖 + 感知 | `doctor` ✅；`scan --agent codex` ✅（TOML 解析 `config.toml`、隔离 `AGENTDOCK_CODEX_*` 占位、强制跳过 `auth.json`/`logs.sqlite`、scan→export→install 闭环打通）；`list` ✅（纯展示清单，v3 直接复用） | ✅ 已完成（截至 2026-07-12，65 测全绿） |
| **v0.4** | 分发 + 跨机 | `npm publish`（shebang / `tsc` 出 `dist/` / 确认 `bin` / 安装文档）；跨机路径重写（绝对 home → 相对占位） | ✅ 已完成（2026-07-13 发布 `agentdock-cli@0.4.0` + `0.4.1` 同步精简版，`npx agentdock-cli` 可用） |
| **v0.5+（远景）** | 团队化 | 团队基线包、CI 集成范例、模板市场（可选） | 🔭 规划中 |

**排期原则**（按用户价值排序，非按技术依赖）：
1. `doctor`（最高即时感知，一跑即有反馈）→ 并行推进 `npm publish`（装得上才算产品）。
2. `scan --agent codex` 做市场扩张。
3. `list` 轻量配合。
4. 内部债（v3→v2 拍平）低优先级。

---

## 12. 成功指标（Success Metrics）

| 指标 | 目标 | 说明 |
|---|---|---|
| **敏感泄露事故数** | 0（硬指标） | 任何发布版本不得出现真实 token 落盘 |
| **端到端迁移成功率** | ≥ 95% | 在干净目标机 `install` 后 `doctor` 自检通过 |
| **安装可达性** | `npx agentdock <cmd>` 可用 | v0.4 达成，作为"产品化"门槛 |
| **认知占位** | 搜索"AI 助手环境迁移"首位 | 赛道空白，需内容占位 |
| **采用信号** | npm 周下载 / GitHub Stars（发布后追踪） | 北极星增长指标 |

---

## 13. 关键决策记录（ADR / Principles）

- **ADR-1 押注领域化，放弃通用**：历史偏差根因是"通用打包"无差异化。一律聚焦 AI 助手环境，护城河清晰、赛道空白。
- **ADR-2 安全不可妥协**：运行态强制跳过、敏感三层隔离为红线，任何"方便"诉求不得突破。
- **ADR-3 引擎/领域解耦**：安全加固一次、两层受益；scan 是生成器、引擎是搬运工。
- **ADR-4 单向迁移 + 版本化**：不做双向实时同步，避免复杂度；环境即代码、可审计、可复现。
- **ADR-5 v0.x 不绑云**：纯 CLI + 本地/Git 文件，降低分发与信任成本；云能力留待 v0.5+ 视采用情况决定。

---

## 14. 文档地图（Doc Map）

| 文档 | 层级 | 职责 |
|---|---|---|
| **`docs/PRD.md`（本文）** | 产品级 | 北极星：定位、用户、场景、边界、路线图、指标 |
| `docs/scan-design.md` | 命令级 | `scan` 命令的设计规格（流程/分类/manifest v3 结构） |
| `docs/manifest.md` | 格式级 | manifest v2/v3 字段定义 |
| `docs/release.md` | 流程级 | 发布与版本维护流程 |
| `README.md` | 对外 | 面向使用者的快速上手（定位表述须与本文一致） |

---

## 15. 下一步行动（Next Step）

v0.3 已于 2026-07-12 全部完成（`doctor` + `scan --agent codex` + `list`，65 测全绿，CLI 端到端验证通过）。**下一步进入 v0.4 `npm publish`**：
1. 构建分发：`tsc` 输出 `dist/`、`bin` 入口加 shebang、README 安装与 Quickstart 稳定化。
2. 名字占名：发布前先确认 `agentdock` 在 npm 未被占用，必要时做一次轻量占位发布。
3. 发布后补：端到端示例、一个最小可演示流程图（scan → export → install / list / doctor）。

> 之所以把 publish 放在 v0.4 而非更早：产品必须先有"装得上"才有意义，但功能面（双助手 + 体检 + 清单）成型后再发，对外口径与 Quickstart 才稳定，避免首发即返工。
