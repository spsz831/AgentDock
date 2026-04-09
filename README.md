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
npm run cli -- validate agentdock.yml --json
npm run cli -- init ./my-project --json
npm run cli -- export agentdock.yml
npm run cli -- export agentdock.yml --json
npm run cli -- install ./dist/exported ./dist/restored
npm run cli -- install ./dist/exported ./dist/restored --json
npm run cli -- upgrade agentdock.yml
npm run cli -- upgrade agentdock.yml --dry-run
npm run cli -- upgrade agentdock.yml --dry-run --verbose
npm run cli -- upgrade agentdock.yml --dry-run --json
npm run cli -- upgrade agentdock.yml --write ./agentdock.v2.yml
npm run cli -- upgrade agentdock.yml --backup
npm run cli -- upgrade agentdock.yml --force --dry-run
```

## Current behavior

- manifest v2 支持 `sources[*].destination`
- v1 manifest 仍可读取并校验
- `upgrade` 可将 v1 升级为 v2
- `upgrade --dry-run` 可先查看 diff 预览，不写回文件
- `upgrade --dry-run --json` 输出机器可读 diff 结果（单行 JSON）
- `upgrade --dry-run --json` 还包含 `summary`（`addedDestinationCount`、`changedLineCount`、`sourceCount`、`templateCount`、`warningCount`、`warnings`）
- `init/validate/export/install/upgrade --json` 现已统一为版本化协议（`schemaVersion`、`generatedAt`、`toolVersion`、`command`、`success`、`data`、`errors`）
- `upgrade --json` 的升级专用字段（如 `diff`、`summary`）已统一放入 `data`
- `upgrade` 文本模式默认输出稳定摘要；仅在 `--verbose` 时附加 diff 详情
- 所有 `--json` 的 `errors` 为结构化数组：`[{ code, message }]`
- `upgrade --write <path>` 将升级结果写到新文件，保留原文件不变
- `upgrade --backup` 原位升级前生成备份文件（`<manifest>.bak.<timestamp>`）
- `upgrade --force` 即使已是 v2 也会按当前规则重新处理并输出 diff
- templates 在 `export` 阶段完成 `{{VAR_NAME}}` 渲染
- `install` 默认会先做冲突预检查，发现任一目标已存在即终止
- `install --overwrite` 允许覆盖已存在文件

## JSON Error Codes

- `MISSING_ARGUMENT`
- `MANIFEST_NOT_FOUND`
- `MANIFEST_INVALID`
- `MANIFEST_ALREADY_EXISTS`
- `UNSUPPORTED_MANIFEST_VERSION`
- `TEMPLATE_VARIABLE_MISSING`
- `MISSING_PACKAGE_MANIFEST`
- `MISSING_INSTALL_PLAN`
- `INSTALL_CONFLICT`
- `UNKNOWN_ERROR`
