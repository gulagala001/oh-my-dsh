# OMD 0.1.7-rc.2.16

本版配套 DSH 0.1.7-rc.2，继续内置 OpenCU 1.1.7。

修复“需求理解 · OMD UI 增强版”安装时的 `ERR_PNPM_MISSING_TARBALL_INTEGRITY`。已核验的公开发行包先按固定 SHA-256 校验，持久保存后交给 DSH 原生插件管理器安装；完整性校验、兼容性检查与安装脚本授权继续由原有机制处理。

推荐卡片明确标注原作者 **啃轮胎的西狐（WestFox-AwA）**，链接到[原作 dsh-prompt-optimizer](https://github.com/WestFox-AwA/dsh-prompt-optimizer)；**gulagala001** 负责 OMD 适配。基于原作 0.7.4，保留 BSD-3-Clause 许可与署名，非上游官方发行版。

插件仍为独立可选安装，版本保持 0.1.0；手动安装后默认关闭。本次修复在 OMD 安装入口中生效。

## 升级

在 OMD 版本面板更新，或通过当前 profile 的原生插件管理器安装 `github:gulagala001/oh-my-dsh#v0.1.7-rc.2.16`。完整重启 DSH／桌面应用与 Host，确认当前版本为 0.1.7-rc.2.16，再在“设置 → 推荐插件”重试安装。

安装包保存于 OMD 数据目录的 `recommended-packages/`，后续重装可能使用，备份时一并保留。已被其他安装操作损坏的旧锁文件不在本次自动修复范围，见[排障说明](troubleshooting.md)。

<a id="验证"></a>
