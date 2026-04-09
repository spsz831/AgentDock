# AgentDock Manifest v1.1

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
  - `include`：可选，字符串数组，仅 `directory` 可用
  - `exclude`：可选，字符串数组，仅 `directory` 可用

### templates
- 可选数组
- 每一项字段：
  - `id`：必填，唯一
  - `source`：必填，模板源路径
  - `destination`：必填，目标相对路径
  - `variables`：可选，键值对

### outputs
- 必填对象
- 字段：
  - `type`：当前固定为 `directory`
  - `path`：必填，非空路径字符串

### install
- 可选对象
- 字段：
  - `mode`：可选，`package` | `direct`，当前实现以 `package` 为主
  - `targetPath`：可选，默认安装目标路径
  - `overwrite`：可选，布尔值

### options
- 可选对象
- 字段：
  - `includeHidden`：可选，布尔值
  - `overwrite`：可选，布尔值

## 语义规则

- `version` 必须等于 `1`
- `project.name` 必须存在且非空
- `sources[*].id` 不能重复
- `templates[*].id` 不能重复
- `sources[*].type` 只能是 `file` 或 `directory`
- `file` 类型 source 不能使用 `include` / `exclude`
- `outputs.type` 在 v1.1 中只能是 `directory`
- `install.mode` 若存在，只能是 `package` 或 `direct`
- 所有 `path` / `source` / `destination` 都必须是非空字符串

## 非目标

v1.1 暂不支持：

- 插件执行
- WebDAV 绑定
- 多清单组合
- 远程同步细节
- 完整模板渲染
- direct install 正式执行

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
    include:
      - '**/*.json'
      - '**/*.txt'
  - id: settings
    type: file
    path: ./workspace/settings.json
templates:
  - id: env-template
    source: ./templates/.env.example
    destination: ./.env
    variables:
      APP_NAME: agentdock-demo
outputs:
  type: directory
  path: ./dist/exported
install:
  mode: package
  targetPath: ./dist/restored
  overwrite: false
options:
  includeHidden: true
  overwrite: false
```
