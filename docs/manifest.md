# AgentDock Manifest v2

## 版本策略

- `version` 表示 manifest schema version
- 当前版本为 `2`
- `version: 1` 仍可被读取与校验，用于兼容旧清单
- `upgrade` 命令可将 v1 自动升级到 v2

## 顶层字段

### version
- 必填
- 当前支持：`1`、`2`
- 推荐使用：`2`

### project
- 必填对象
- 字段：
  - `name`：必填，非空字符串
  - `description`：可选，字符串

### sources
- 必填数组
- 每一项字段：
  - `id`：必填，唯一
  - `type`：必填，枚举：`file` | `directory`
  - `path`：必填，非空路径字符串
  - `destination`：v2 新增，可选；安装目标相对路径
  - `include`：可选，字符串数组，仅 `directory` 可用
  - `exclude`：可选，字符串数组，仅 `directory` 可用

#### destination 规则
- `file`：若未填写，默认推导为 `./<原文件名>`
- `directory`：若未填写，默认推导为 `./<source-id>/`
- `export` 会把 destination 写入 install-plan
- `install` 会按 destination 恢复目标路径

### templates
- 可选数组
- 每一项字段：
  - `id`：必填，唯一
  - `source`：必填，模板源路径
  - `destination`：必填，目标相对路径
  - `variables`：可选，键值对
- 模板在 `export` 阶段完成 `{{VAR_NAME}}` 渲染
- 缺失变量时 `export` 直接失败

### outputs
- 必填对象
- 字段：
  - `type`：当前固定为 `directory`
  - `path`：必填，非空路径字符串

### install
- 可选对象
- 字段：
  - `mode`：可选，`package` | `direct`
  - `targetPath`：可选，默认安装目标路径
  - `overwrite`：可选，布尔值，作为 install 默认覆盖策略

### options
- 可选对象
- 字段：
  - `includeHidden`：可选，布尔值
  - `overwrite`：可选，布尔值

## 语义规则

- `project.name` 必须存在且非空
- `sources[*].id` 不能重复
- `templates[*].id` 不能重复
- `sources[*].type` 只能是 `file` 或 `directory`
- `file` 类型 source 不能使用 `include` / `exclude`
- `outputs.type` 只能是 `directory`
- `install.mode` 若存在，只能是 `package` 或 `direct`

## upgrade

```bash
agentdock upgrade agentdock.yml
agentdock upgrade agentdock.yml --dry-run
agentdock upgrade agentdock.yml --dry-run --json
agentdock upgrade agentdock.yml --write ./agentdock.v2.yml
agentdock upgrade agentdock.yml --backup
agentdock upgrade agentdock.yml --force --dry-run
```

当前支持：
- v1 -> v2
- 自动补充 `sources[*].destination`
- `--dry-run` 预览 diff，不写回清单
- `--json` 输出机器可读结果；与 `--dry-run` 组合时包含 diff 数组
- `--write <path>` 写出升级后的新清单文件，不改原文件
- `--backup` 原位升级前生成备份文件：`<manifest>.bak.<timestamp>`
- `--force` 即使清单已是 v2，也按当前规则重新处理并输出差异

## 示例

```yaml
version: 2
project:
  name: agentdock-demo
sources:
  - id: workspace
    type: directory
    path: ./workspace
    destination: ./restored/workspace
  - id: settings
    type: file
    path: ./workspace/settings.json
    destination: ./restored/config/settings.json
```
