# AgentDock Manifest v1

## 顶层字段

### version
- 必填
- 当前固定为 `1`

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

### outputs
- 必填对象
- 字段：
  - `type`：当前固定为 `directory`
  - `path`：必填，非空路径字符串

### options
- 可选对象
- 字段：
  - `includeHidden`：可选，布尔值
  - `overwrite`：可选，布尔值

## 语义规则

- `version` 必须等于 `1`
- `project.name` 必须存在且非空
- `sources[*].id` 不能重复
- `sources[*].type` 只能是 `file` 或 `directory`
- `outputs.type` 在 v1 中只能是 `directory`
- 所有 `path` 都必须是非空字符串

## 非目标

v1 暂不支持：

- 插件执行
- WebDAV 绑定
- 多清单组合
- 远程同步细节
- 脚本化安装编排

## 示例

```yaml
version: 1
project:
  name: agentdock-demo
  description: Minimal demo manifest
sources:
  - id: workspace
    type: directory
    path: ./workspace
  - id: settings
    type: file
    path: ./workspace/settings.json
outputs:
  type: directory
  path: ./dist/exported
options:
  includeHidden: true
  overwrite: false
```
