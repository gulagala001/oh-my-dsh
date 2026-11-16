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

[安装包 / Package](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.3-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.3-dsh.0.2.2-rc.3.tgz) · [使用说明 / Guide](README.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.3-dsh.0.2.2-rc.3/SHA256SUMS)

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
