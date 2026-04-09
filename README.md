# AgentDock

AgentDock 是一个基于单文件 `agentdock.yml` 的本地环境打包与导出工具。

## MVP 范围

- `init`：初始化项目清单
- `validate`：校验清单
- `export`：按清单导出目录内容

## Definition of Done

本项目 MVP 至少应满足：

- `npm run build` 可执行
- `npm test` 可执行
- `npm run cli -- validate agentdock.yml` 可执行
