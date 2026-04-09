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
npm run cli -- upgrade agentdock.yml --dry-run
npm run cli -- upgrade agentdock.yml --dry-run --json
npm run cli -- upgrade agentdock.yml --write ./agentdock.v2.yml
npm run cli -- upgrade agentdock.yml --backup
```

## Current behavior

- manifest v2 支持 `sources[*].destination`
- v1 manifest 仍可读取并校验
- `upgrade` 可将 v1 升级为 v2
- `upgrade --dry-run` 可先查看 diff 预览，不写回文件
- `upgrade --dry-run --json` 输出机器可读 diff 结果（单行 JSON）
- `upgrade --write <path>` 将升级结果写到新文件，保留原文件不变
- `upgrade --backup` 原位升级前生成备份文件（`<manifest>.bak.<timestamp>`）
- templates 在 `export` 阶段完成 `{{VAR_NAME}}` 渲染
- `install` 默认会先做冲突预检查，发现任一目标已存在即终止
- `install --overwrite` 允许覆盖已存在文件
