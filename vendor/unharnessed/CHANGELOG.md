# DSH Unharnessed 0.2.4 · DSH 0.2.2-rc.3

[中文](#zh-024) · [English](#en-024)

<a id="zh-024"></a>

## 中文

### 问题修复

- 后台命令完成后，正在进行的对话会在下一步收到结果提醒；空闲会话会自动继续。
- 读取结果、重置 Python 或切换预设后清理过时提醒，停止后不再被迟到通知自动唤醒。
- 后台图片、文件、MCP 附加信息和 Python 意外退出及时通知会话，自主任务达到检查上限后仍会报告结果。

<a id="en-024"></a>

## English

### Bug fixes

- Delivers background command completion at the next step of active work, and resumes idle chats when a result arrives.
- Withdraws obsolete notices after reading results, resetting Python or switching presets, and prevents late notifications from restarting stopped work.
- Delivers background images, files, additional MCP context and unexpected Python exits promptly, and reports final check results when autonomous work reaches its round limit.

## 安装 / Installation

DSH **0.2.2-rc.3** · Node.js **24.9.0+**

[安装包 / Package](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.4-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.4-dsh.0.2.2-rc.3.tgz) · [使用说明 / Guide](https://github.com/gulagala001/dsh-unharnessed/blob/main/README.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.4-dsh.0.2.2-rc.3/SHA256SUMS)

---

# DSH Unharnessed 0.2.3 · DSH 0.2.2-rc.3

[中文](#zh-023) · [English](#en-023)

<a id="zh-023"></a>

## 中文

### 问题修复

- Windows 上自动找到 Git Bash，包括只有 Git cmd 目录在 PATH 中的安装和 Git Bash 插件配置的路径。
- 缺少 shell 时仍可运行 Python；后台命令会给出配置提示，自主任务的 shell 验收也会正确报告缺失。
- 避免将 WSL 启动器用作本机 Python 的 shell。

<a id="en-023"></a>

## English

### Bug fixes

- Automatically finds Git Bash on Windows, including installations with only Git cmd on PATH and paths configured by the Git Bash plugin.
- Keeps Python usable when no shell is available; background commands provide setup guidance and autonomous shell checks report the missing dependency.
- Avoids selecting a WSL launcher as the shell for native Python.

## 安装 / Installation

DSH **0.2.2-rc.3** · Node.js **24.9.0+**

[安装包 / Package](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.3-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.3-dsh.0.2.2-rc.3.tgz) · [使用说明 / Guide](https://github.com/gulagala001/dsh-unharnessed/blob/main/README.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.3-dsh.0.2.2-rc.3/SHA256SUMS)

---

# DSH Unharnessed 0.2.2 · DSH 0.2.2-rc.3

[中文](#中文) · [English](#english)

## 中文

### 新增功能

- 持久 Python、后台 shell、MCP、技能、图片与文件交付、跨重启检查点和原生目标控制。

### 问题修复

- 工具生成的图片与文件明确标注来源，避免被误认为用户重复发送需求。

### 安装

DSH 0.2.2-rc.3：[安装包](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.2-dsh.0.2.2-rc.3.tgz) · [使用说明](README.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/SHA256SUMS)

## English

### Features

- Persistent Python, background shell, MCP, skills, image and file delivery, restart checkpoints and native goal controls.

### Fixes

- Label tool-generated images and files so they can be distinguished from repeated human requests.

### Installation

DSH 0.2.2-rc.3: [Package](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.2-dsh.0.2.2-rc.3.tgz) · [Guide](README_EN.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/SHA256SUMS)
