# 人格文件 / Personality files

[中文首页](../README.md) · [English](../README_EN.md)

人格文件是 UTF-8 编码的 JSON，最大 1 MiB。

A personality file is UTF-8 JSON, up to 1 MiB.

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

| 字段 | 规则 |
| --- | --- |
| `name` | 1–80 个字符，首尾不能有空格或控制字符 |
| `description` | 可省略，最多 1000 个字符 |
| `modules` | 只能用上例的四个键，每项是最多 65536 个字符的纯文本；省略的模块用默认内容，空字符串表示这一项不加偏好 |

文件里不能有 ID、工具配置、权限、可执行代码或其他字段。导入时会新建一个人设，重名时自动改名，不会覆盖已有的人设。

| Field | Rule |
| --- | --- |
| `name` | 1–80 characters, no leading or trailing spaces or control characters |
| `description` | Optional, up to 1000 characters |
| `modules` | Only the four keys above, each plain text up to 65536 characters; omitted modules use defaults, and an empty string adds no preference for that module |

Files cannot contain IDs, tool settings, permissions, executable code or any other fields. Importing creates a new preset and renames it if the name is taken, so existing presets are never overwritten.

多个窗口同时编辑时，如果另一个窗口先保存了，这次保存会停下来，显示最新设置，草稿保留，看过后再保存即可。正在编辑的人设被删掉了，草稿也可以另存为新人设。

If another window saves first while you are editing, your save stops and shows the latest settings. Your draft stays, so you can review it and save again. If the preset you are editing was deleted, you can still save the draft as a new preset.
