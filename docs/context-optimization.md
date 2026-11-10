# 上下文优化 / Context optimization

## 中文

OMD 的核心功能，默认开启，在 **设置 → Oh My DSH → 上下文与记忆 → 上下文优化** 可以关掉。

### 做了什么

- **精简工具结果**：只读的 JSON、格式一致的表格和完全相同的连续行会用无损的紧凑写法发送；识别出的成功 Node TAP 测试日志会概括。报错、不认识的日志、写入回执、编辑内容和差异原样保留。
- **重复读取只发变化**：文件照常真实读取。只有本次请求里还留着完整的旧结果时，重复读取才换成引用，有变化就发完整差异；旧结果不在了就重发全文。用 Billion Context 时这类优化自动保守处理。
- **PTC**：只处理程序最终输出给模型的内容，程序变量、中间结果和返回值不变。程序只是原样返回一次原文回查结果时，直接显示结果，去掉重复的 JSON 外壳。
- **整文件写回**：写回整个文件前，会核对是否完整读过当前版本。只读了部分行、被截断的读取不能当作整文件来源，写入会被拒绝，文件保持原样；可以改用局部编辑、分段完整读取或完整快照。
- **截图**：OpenCU 照常观察。同一次请求里已经有完全相同的图片时才折叠重复图，新的观察文字和原始附件保留。

### 新工具

- **`tool_find`**：按需发现可选的 MCP 工具，返回完整的参数和返回说明。普通模式和 PTC 共用一份目录。
- **`context_view`**：给文件、网页或原文引用提供 `raw`、`data`、`article`、`outline`、`query` 几种视图，部分内容会明确标注。完整快照单文件最大 8 MiB，更大的走原生分段读取。
- **读文档**：同一个 `context_view` 能读 DOCX 段落和表格、PDF 文字层、CSV／TSV 单元格和 XLSX 工作表。输入最大 32 MiB、提取结果最大 8 MiB，解析失败或超时会报错。PDF 不做 OCR，DOCX 不保留版式和图片，XLSX 用公式已缓存的值、不重算，不支持旧版 DOC／XLS。提取结果另存可回查，但不能当作写回原文件的依据。
- **`code_search`**：对选定文件做 AST 模式搜索，支持 16 种语言，返回覆盖情况、解析失败、精确位置和分页。先用 glob 或 CodeGraph 选文件。

### 查看原文

精简之前先保存原文。工具卡片上点 **查看原文**，可以看开头、结尾、按行号读、搜索和翻页，很长的单行也能接着读。AI 用 `recall({rawRef, mode, cursor})` 读，或用 `recall({search:"evidence", query})` 搜。

原文和会话里的真实工具调用绑定，重启和分支后仍能查，关闭优化也不会删。控制台可以导出、导入原文档案；迁移时把会话导出和原文档案一起带上，先恢复会话再导入原文。还被引用的原文不会按时间过期。

### 效果统计

控制台的上下文页显示本会话的成功、失败、取消请求数，估算减少的输入，回查和工具发现的开销，处理耗时和原因。只有成功的请求计入节省。这些记录随会话日志保存，重启后还在，分支不继承父会话的记录。这里只统计工具结果的精简，不含历史压缩；实际用量和费用看[监控统计](monitoring.md)。

关掉优化只是停止新的精简，原文回查、CodeGraph、Dream、历史压缩、任务、侧问和分支都照常工作。

## English

Built into OMD and on by default. Turn it off under **Settings → Oh My DSH → Context and memory → Context optimization**.

### What it does

- **Trims tool results**: read-only JSON, uniform tables and identical repeated lines are sent in a lossless compact form, and recognized successful Node TAP test logs are summarized. Errors, unknown logs, write receipts, edits and diffs stay as they are.
- **Repeat reads send only changes**: files are still really read. Only when the full earlier result is still in the current request does a repeat read become a reference or a full diff; otherwise the full result is sent again. With Billion Context these optimizations stay conservative.
- **PTC**: only the program's final output to the model is processed; variables, intermediate results and return values are unchanged. When a program just returns one original-content lookup, the result is shown directly without the repeated JSON wrapper.
- **Whole-file writes**: before writing back a whole file, OMD checks that the current version was read in full. Partial or truncated reads cannot be the source of a whole-file write; the write is rejected and the file is left alone. Use a local edit, complete ranged reads or a complete snapshot instead.
- **Screenshots**: OpenCU still observes as usual. A repeated image is folded only when the exact same image is already in the request; new observation text and original attachments stay.

### New tools

- **`tool_find`**: discovers optional MCP tools on demand with full parameter and return descriptions. Normal mode and PTC share one catalog.
- **`context_view`**: `raw`, `data`, `article`, `outline` and `query` views of files, web pages or original-content references, with partial views clearly marked. Complete snapshots are limited to 8 MiB per file; larger files use native ranged reads.
- **Documents**: the same `context_view` reads DOCX paragraphs and tables, PDF text, CSV / TSV cells and XLSX sheets. Inputs up to 32 MiB, extracted results up to 8 MiB; failed or timed-out parsing reports an error. No OCR for PDF, no layout or images for DOCX, cached formula values for XLSX without recalculation, and no legacy DOC / XLS. Extracted text is saved for lookup but cannot be the basis for writing back the original file.
- **`code_search`**: AST pattern search over selected files in 16 languages, with coverage, parse failures, exact positions and paging. Pick files with glob or CodeGraph first.

### Viewing originals

Originals are saved before trimming. Click **View original** on a tool card to see the start or end, read by line number, search and page, including very long single lines. The AI uses `recall({rawRef, mode, cursor})` to read or `recall({search:"evidence", query})` to search.

Originals are tied to the real tool calls in the conversation and survive restarts and forks; turning optimization off never deletes them. The console can export and import original-content archives. When moving conversations, bring the session export and its archive together, and restore the session before importing the archive. Originals that are still referenced never expire by age.

### Statistics

The Context page in the console shows this session's successful, failed and cancelled requests, estimated input reduction, lookup and tool-discovery overhead, processing time and reasons. Only successful requests count toward savings. The records are saved with the session log and survive restarts; forks do not inherit the parent's records. This only covers trimmed tool results, not history compaction; see [monitoring](monitoring.md) (Chinese) for actual usage and cost.

Turning optimization off only stops new trimming. Original lookups, CodeGraph, Dream, history compaction, tasks, side questions and forks keep working.
