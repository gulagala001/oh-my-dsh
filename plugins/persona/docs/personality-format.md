# 人格文件 / Personality files

源码构建以 `package.json` 的完整宿主版本为准，当前默认 `0.2.1-rc.3`；SDK、组件与依赖锁必须来自同一版本。

UTF-8 JSON，最大 1 MiB。UTF-8 JSON, up to 1 MiB.

```json
{
  "format": "dsh.persona",
  "version": 1,
  "name": "晴空",
  "description": "清晰、亲切，带一点轻松的幽默。",
  "modules": {
    "identity": "你叫晴空，是一位可靠、亲切的 AI 助手。",
    "style": "表达自然、清晰，偶尔使用轻松的幽默。",
    "communication": "进度更新简短具体；遇到问题坦诚说明，提问清楚直接。",
    "presentation": "先给出重点，再按需要解释；使用短段落和简洁列表。"
  }
}
```

`name` 为 1–80 字符，不含首尾空格或控制字符。`description` 可省略，最多 1000 字符。`modules` 仅接受上例的四个键，每项是最多 65536 字符的纯文本。省略模块使用默认内容，空字符串不添加该模块的偏好。文件不接受 ID、工具配置、权限、代码执行或额外字段。导入创建新的预设 ID，同名时自动改名，不覆盖现有人设。

`name` contains 1–80 characters without surrounding whitespace or control characters. Optional `description` is limited to 1000 characters. `modules` accepts only the four keys above, each with up to 65536 characters of plain text. Omitted modules use defaults; empty strings add no preference for that module. IDs, tool configuration, permissions, executable code fields and unknown fields are not accepted. Import creates a new preset ID and renames duplicate names without replacing existing presets.

多个窗口编辑人格时，保存会核对最初读取的设置。如果另一处已更改，当前保存会停止，显示最新设置并保留编辑草稿；核对后可再次保存。若正在编辑的预设已被删除，草稿仍可另存为新预设。

When multiple windows edit personalities, each save checks the settings originally read by that editor. If another editor has saved changes, the stale save stops, loads the current settings and keeps the editing draft for review and an explicit retry. A draft whose preset was deleted can be saved as a new preset.
