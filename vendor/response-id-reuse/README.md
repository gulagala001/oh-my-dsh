<a name="readme-top"></a>

<h1 align="center">DSH Response ID Reuse</h1>

<p align="center"><strong>续聊时不再每次重传整段历史，只发新内容和上一条回复的 ID。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-response-id-reuse/releases/tag/v0.1.8-dsh.0.2.2-rc.2"><img alt="DSH Response ID Reuse 0.1.8" src="https://img.shields.io/badge/release-0.1.8-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-response-id-reuse/releases"><img alt="GitHub 下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-response-id-reuse/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.2-rc.2" src="https://img.shields.io/badge/DSH-0.2.2--rc.2-0969da?style=flat-square"></a>
</p>

<a name="readme-install"></a>

## 安装

**需要：** DSH **0.2.2-rc.2**，Node.js **24.9.0+**。

在 DSH 里打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.8-dsh.0.2.2-rc.2/gulagala001-dsh-response-id-reuse-0.1.8-dsh.0.2.2-rc.2.tgz
```

校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.8-dsh.0.2.2-rc.2/SHA256SUMS)。装好后自动生效，没有设置项。想恢复原来的行为，在插件页停用或卸载即可。

## 它做什么

服务商用 OpenAI Responses 接口并保存了上一次回复时，插件会在下一次请求里带上 `previous_response_id`，只发送新增的消息。长对话和带图片的对话因此少传很多重复内容。

- 不用配置服务商名单，也不发测试消息。插件从正常回复里判断服务商是否支持，支持才启用。
- 主对话、后台任务和并行的子代理各用各的回复 ID，互不干扰。
- ID 过期或服务商没存上时，这一次请求自动改为发送完整历史，下一次再试着续上。
- 服务商临时出错时，先暂停续传 1 分钟，之后再用一条正常请求重试；反复出错时最长暂停 15 分钟。暂停期间照常发送完整历史。
- DSH 的会话记录不会被改写。

## 常见问题

<details>
<summary>我的服务商支持吗？</summary>

用 OpenAI Responses 接口、并且会保存回复的服务商都能用。不支持的服务商不受影响，请求和不装插件时一样。

</details>

<details>
<summary>会多花钱吗？</summary>

正常情况下传得更少。续传失败时会再完整发送一次，这次失败的请求可能也会被服务商计费。

</details>

## 开发和许可

开发命令和模块说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。代码用 [MIT](LICENSE) 许可。

反馈问题请写明 DSH 和插件版本、所用服务商、操作步骤、期望和实际结果，日志先去掉密钥和个人信息：[Issues](https://github.com/gulagala001/dsh-response-id-reuse/issues)。
