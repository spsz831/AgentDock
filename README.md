# AgentDock

AgentDock 是一个基于单文件 `agentdock.yml` 的本地环境打包、导出与恢复工具。

## MVP 范围

- `init`：初始化项目清单
- `validate`：校验清单
- `export`：按清单导出目录内容为稳定包结构
- `install`：从导出包恢复到目标目录
- `upgrade`：将旧版 manifest 升级到新版结构

## Quickstart

```bash
npm run cli -- validate agentdock.yml
npm run cli -- export agentdock.yml
npm run cli -- install ./dist/exported ./dist/restored
npm run cli -- upgrade agentdock.yml
```

## Current behavior

- manifest v2 支持 `sources[*].destination`
- v1 manifest 仍可读取并校验
- `upgrade` 可将 v1 升级为 v2
- templates 在 `export` 阶段完成 `{{VAR_NAME}}` 渲染
- `install` 默认会先做冲突预检查，发现任一目标已存在即终止
- `install --overwrite` 允许覆盖已存在文件
