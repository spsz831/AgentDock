# AgentDock MVP 边界文档

更新时间：2026-04-09 15:39:04

---

## 1. 项目定位

AgentDock 是一个面向 **Claude Code** 与 **Codex** 的本地工作环境重建工具。

它解决的问题不是“备份整台旧电脑”，而是：

> 在一台新电脑安装完 Claude Code 与 Codex 之后，尽快恢复旧电脑上的 MCP、Skill、Plugin 与相关配置模板，使环境可以快速进入可用状态。

AgentDock 的核心目标：

- 可迁移
- 可重建
- 可审计
- 敏感信息隔离
- 尽量自动恢复，而不是逐项手工安装

---

## 2. 工作原理

AgentDock 的工作原理是：

### 旧电脑：导出环境定义

扫描并导出以下“可重建信息”：

- Claude Code 的 MCP 定义
- Claude Code 的 Skill 定义
- Claude Code 的 Plugin 定义
- Codex 的 MCP 定义
- Codex 的 Skill 定义
- Codex 的 Plugin 定义
- 配置模板
- overlay / launcher / helper scripts
- 依赖说明
- 环境变量占位说明

导出的结果不是缓存备份，而是一份 **manifest（环境清单）**。

这份 manifest 描述的是：

> 这套环境由哪些组件构成，每个组件从哪里来，应该如何在另一台机器上恢复。

### 新电脑：按清单重建

新电脑先安装基础运行环境，然后 AgentDock 根据 manifest 执行：

- 写入配置模板
- 恢复 MCP 定义
- 恢复 Skill 定义
- 恢复 Plugin 定义
- 生成 launcher / overlay
- 检查依赖与缺失项
- 提示用户补 key / env

所以 AgentDock 的本质是：

> 导出“环境定义”，再在新机器上按定义重建。

---

## 3. 为什么不是直接拷贝旧电脑目录

不建议直接整包复制：

- `~/.claude`
- `~/.codex`
- cache
- tmp
- auth 文件
- 登录态文件

原因：

- 容易带入无用缓存
- 机器相关路径可能失效
- 运行状态不可控
- 安全风险高
- 不适合作为开源工具

AgentDock 采用的原则是：

> 同步“定义”和“来源”，不直接同步“运行态”和“敏感态”。

---

## 4. AgentDock v0.1 MVP 范围

### 4.1 支持同步 / 重建的对象

#### A. Claude Code

- MCP
- Skills
- Plugins
- 相关配置模板

#### B. Codex

- MCP
- Skills
- Plugins
- overlay
- launcher
- helper scripts

#### C. Shared

- manifest 清单
- `.env.example`
- install / export / doctor / list 脚本
- 使用说明文档

---

## 5. 明确不同步的对象

第一版明确不做以下内容：

- API Key 真值
- token / cookie / auth.json
- 登录态
- 聊天历史
- cache 缓存
- 临时目录
- 本机运行状态
- GUI 面板
- 自动云端双向同步

原因：

- 安全风险高
- 机器耦合强
- 可移植性差
- 超出 MVP 范围

---

## 6. 插件系统是否纳入 MVP

纳入。

但要区分“同步什么”。

### 6.1 插件系统纳入范围

同步这些：

- `plugin.json`
- `marketplace.json`
- 插件来源信息
- 插件安装说明
- 所需环境变量名
- 本地插件定义文件

### 6.2 插件系统不纳入范围

不同步这些：

- 插件 cache
- 临时下载产物
- 插件运行时状态
- 登录态与授权文件

结论：

> AgentDock 同步的是插件的“可重建定义”，不是插件缓存本身。

---

## 7. MVP 命令范围

AgentDock v0.1 只定义 4 个核心命令：

### 7.1 `agentdock export`

作用：

- 从旧电脑导出当前可迁移环境定义
- 生成 manifest、模板、说明与占位文件

### 7.2 `agentdock install`

作用：

- 在新电脑按 manifest 重建 Claude Code / Codex 环境

### 7.3 `agentdock doctor`

作用：

- 检查本机基础依赖是否齐全
- 检查哪些 key / env 缺失
- 检查哪些组件无法直接恢复

### 7.4 `agentdock list`

作用：

- 列出当前可管理对象
- 按 agent / type / source 分类查看

---

## 8. 新电脑的恢复流程

### 步骤 1：安装基础环境

至少包括：

- Claude Code
- Codex
- Node / npm / npx
- PowerShell / pwsh
- Git
- 其他组件所需依赖

### 步骤 2：执行检查

运行：

```powershell
agentdock doctor
```

确认：

- 基础依赖存在
- 关键路径可写
- 缺失项清晰可见

### 步骤 3：执行安装

运行：

```powershell
agentdock install
```

执行恢复：

- 写入配置模板
- 恢复 MCP
- 恢复 Skills
- 恢复 Plugins
- 恢复 overlay / launcher

### 步骤 4：补敏感信息

用户按提示补：

- API Key
- 环境变量
- 机器相关路径

### 步骤 5：进入可用状态

验证：

- Claude Code 可识别相关能力
- Codex 可识别相关能力
- 关键 launcher / overlay 正常工作

---

## 9. 是否需要 WebDAV

### 结论

**MVP 第一版不强依赖 WebDAV。**

### 原因

如果一开始就强依赖 WebDAV，会明显增加：

- 认证处理复杂度
- 远程路径管理复杂度
- 冲突与覆盖策略复杂度
- 开源使用门槛

对于 MVP，更合理的传输方式是：

1. 本地目录
2. Git 仓库
3. zip 导出包

### WebDAV 在项目中的定位

WebDAV 适合作为二期可选后端，而不是一期前提。

未来可以扩展成：

- `agentdock export --to webdav`
- `agentdock install --from webdav`

也就是说：

> WebDAV 适合做“远程存储后端”，不适合做 MVP 的核心依赖。

---

## 10. 仓库目录草案

```text
AgentDock/
  README.md
  docs/
    MVP_边界文档.md
  manifests/
    agents/
    mcp/
    skills/
    plugins/
  templates/
    claude/
    codex/
    shared/
  scripts/
    export.ps1
    install.ps1
    doctor.ps1
    list.ps1
  examples/
    .env.example
```

---

## 11. MVP 成功标准

如果 AgentDock v0.1 达到以下目标，就算成功：

1. 新电脑在安装 Claude Code / Codex 后，可通过 AgentDock 快速恢复本地能力层
2. 用户不需要再手工逐个安装 MCP / Skill / Plugin
3. 敏感信息不会被导出进仓库
4. 恢复过程可检查、可追踪、可解释
5. 项目结构足够清晰，适合作为开源工具继续迭代

---

## 12. 当前结论

AgentDock v0.1 的正式边界定义为：

> 一个用于在新电脑上快速重建 Claude Code 与 Codex 本地工作环境的开源工具，支持 MCP、Skill、Plugin 与相关配置模板的清单化导出、安装与校验；第一版不同步敏感信息、不依赖 WebDAV、不处理运行时缓存与登录态。

