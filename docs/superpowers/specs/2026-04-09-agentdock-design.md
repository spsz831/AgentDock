# AgentDock 第一版设计说明

- 日期：2026-04-09
- 主题：AgentDock MVP 项目骨架与 manifest 设计

## 1. 目标

AgentDock 第一版定义为：

> 一个基于单文件 `agentdock.yml` 的本地环境打包与导出工具，第一版以 CLI 为主，聚焦初始化、校验、导出。

## 2. 设计结论

### 2.1 技术栈
- Node.js
- TypeScript
- CLI 优先

### 2.2 manifest 形式
- 主格式：YAML
- 主文件：`agentdock.yml`
- JSON 用于内部校验、导出友好格式、schema 配套

### 2.3 配置组织方式
- 第一版采用单文件主清单
- 暂不引入“主清单 + 子模块清单”的拆分模式

### 2.4 MVP 首批命令
- `init`
- `validate`
- `export`

## 3. 方案比较

### 方案 A：文档优先型骨架
优点：规则沉淀快。缺点：缺少可运行闭环。

### 方案 B：CLI 核心型骨架（推荐）
优点：最容易形成可运行 MVP；manifest 演进时改动集中；后续扩展自然。

### 方案 C：未来平台化骨架
优点：长期扩展性更强。缺点：MVP 阶段容易过度设计。

## 4. 推荐方案

采用 **CLI 核心型骨架**，优先围绕 `init / validate / export` 构建最小可运行闭环。

## 5. 仓库目录结构

```text
AgentDock/
├─ docs/
│  ├─ MVP_边界文档.md
│  └─ manifest.md
├─ examples/
│  └─ agentdock.example.yml
├─ schemas/
│  └─ agentdock.schema.json
├─ src/
│  ├─ commands/
│  │  ├─ init.ts
│  │  ├─ validate.ts
│  │  └─ export.ts
│  ├─ core/
│  │  └─ exporter.ts
│  ├─ manifest/
│  │  ├─ load.ts
│  │  ├─ types.ts
│  │  └─ validate.ts
│  ├─ utils/
│  │  └─ fs.ts
│  └─ cli.ts
├─ test/
│  ├─ manifest.test.ts
│  └─ export.test.ts
├─ agentdock.yml
├─ package.json
├─ tsconfig.json
├─ README.md
└─ .gitignore
```

## 6. 模块边界

### commands/
负责 CLI 命令入口与参数分发，不承载核心业务逻辑。

### manifest/
负责读取、解析、类型定义、结构校验与语义校验。

### core/
负责核心业务逻辑，第一版主要是 export 能力。

### utils/
负责文件系统等通用辅助函数。

### schemas/
负责提供 manifest schema，供校验、测试、编辑器提示使用。

### examples/
负责提供示例清单，便于 init 和文档演示。

## 7. manifest 在系统中的定位

- 外部编辑入口：`agentdock.yml`
- 内部表示：TypeScript 类型
- 校验机制分两层：
  1. 结构校验：schema
  2. 语义校验：自定义规则

## 8. MVP 三个命令职责

### init
- 初始化 AgentDock 项目
- 生成示例 `agentdock.yml`
- 预留生成基础目录/模板的能力

### validate
- 校验清单结构是否正确
- 校验必要字段是否完整
- 校验关键语义规则是否满足要求

### export
- 读取清单
- 输出导出结果或导出描述目录
- 为后续 install/import 做兼容预留

## 9. 暂不纳入范围

- 插件系统正式落地
- 强依赖 WebDAV
- 多清单拆分
- GUI / Web 管理界面
- 一开始就做复杂平台化抽象

## 10. 后续顺序建议

1. 正式搭建项目骨架
2. 定义 `agentdock.yml` 第一版字段草案
3. 补 `manifest.md` 与示例文件
4. 实现 `validate` 最小闭环
5. 再实现 `init` 与 `export`

## 11. 成功标准

第一版完成时，应至少满足：

- 能创建标准 AgentDock 项目骨架
- 能读取并校验单文件 `agentdock.yml`
- 能执行最小可用的 `export`
- 目录边界清晰，便于后续扩展 install/import/plugin 能力
