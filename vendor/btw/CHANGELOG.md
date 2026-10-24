# BTW 0.1.4 · DSH 0.2.1-rc.3

[中文](#zh-014) | [English](#en-014)

<a id="zh-014"></a>

## 中文

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-014"></a>

## English

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [BTW 0.1.4](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-btw-0.1.4-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.4-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-btw/blob/main/README_EN.md)

---

# BTW 0.1.3 · DSH 0.2.1-rc.2

[中文](#zh-013) | [English](#en-013)

<a id="zh-013"></a>

## 中文

### 问题修复

- 侧聊以终止回执结束请求，修复结束后仍显示进行中、流中断及取消时状态未收尾的问题。
- 在途请求实际结束前保留会话保护，避免取消后重复启动请求；完整保留已收到的内容与明确错误。

<a id="en-013"></a>

## English

### Bug Fixes

- Settles side-chat requests on terminal receipts, fixing stale running indicators and unfinished state after interrupted streams or cancellation.
- Retains conversation ownership until an in-flight request actually finishes, preventing duplicate requests after cancellation while preserving received content and explicit errors.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [BTW 0.1.3](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.3-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-btw/blob/main/README_EN.md)

---

# DSH BTW 0.1.2 · DSH 0.2.1-rc.2

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 问题修复

- 多个匹配版本的插件入口共用一份旁聊服务、输入触发器和弹窗，避免重复注册。
- 停用一个入口时，其余入口继续提供旁聊；最后一个入口停用后才取消请求并清理界面，重新启用可恢复。

<a id="en-012"></a>

## English

### Bug Fixes

- Matching plugin entries share one side-chat service, input trigger and popover, preventing duplicate registrations.
- Disabling one entry preserves side chat for remaining owners. The last owner cancels requests and releases UI registrations; re-enabling restores the feature.

## 安装 / Installation

在 **插件 → 添加插件** 中安装与完整宿主版本匹配的固定包，保留 profile 和数据，待当前任务结束后重启。共装时请同步更新提供同一能力的插件。

Use **Plugins → Add plugin** to install the fixed package matching the complete host version. Preserve the profile and data, and restart after active tasks finish. Update co-installed distributions together.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH BTW 0.1.2](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.2-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.2-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.zh.md) · [Installation guide](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.md)

---

# DSH BTW 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 其他变更

- 更新中英文功能说明、固定版本安装指南和侧聊展示。
- 源码主线保留构建输入，正式发行包包含可直接安装的客户端产物。

<a id="en-011"></a>

## English

### Other Changes

- Updates Chinese and English feature documentation, fixed-version installation guides and side-chat illustrations.
- Keeps build inputs on the source branch and includes installable client assets in formal release packages.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH BTW 0.1.1](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.1-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-btw/blob/main/docs/install.md)
