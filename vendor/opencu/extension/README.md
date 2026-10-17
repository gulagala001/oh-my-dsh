# OpenCU Chrome / Edge 本地连接扩展

从零实现的 Manifest V3 unpacked 扩展和无依赖 Node ESM HTTP 桥。不会安装 Chrome、触碰已有 extension/profile 或更新当前 DSH。Chrome / Chromium 最低 118；Edge 使用同一 Chromium 扩展 API，但未实机验收。

## 安装与授权

1. **安装（仅首次）**：在 DSH「设置 → 电脑与浏览器 → Chrome / Edge 连接」显示扩展文件夹；在 Chrome `chrome://extensions` / Edge `edge://extensions` 开启开发者模式，点“加载已解压的扩展程序”，选择定位的 `extension` 文件夹。已安装可跳过。
2. **首次允许**：AI 首次使用这个浏览器时，扩展自动弹出「允许连接此浏览器？」窗口。单击「允许并记住」，不复制、不粘贴。本地连接由 DSH 插件自动管理，无需另开服务。也可点扩展图标主动配对。
3. **确认连接**：显示「已连接 · 配对已保存」及蓝色 ON 才是成功；扩展管理页的蓝色开关只表示扩展启用。多浏览器／profile 时由 AI 先选择具体实例，不自动连接所有浏览器。
4. 从 OpenCU 发现并选择普通 HTTP(S) 标签。Chrome 将显示 debugger 提示条；用户可取消提示条或点击扩展中的断开按钮来释放控制。
5. **持久与撤销**：配对写入浏览器 `chrome.storage.local`，DSH 私有目录仅保存凭据摘要及稳定 hostId。扩展公开 key 固定 ID；正常浏览器／DSH／电脑重启和保留身份及数据的更新后自动重连，不再询问。首次从旧版迁移需允许一次；撤销配对、清除扩展数据或卸载重装后需要重新允许。断开会暂停自动重连，可在扩展页再次允许恢复。网络／命令超时仅重建传输，不重试旧输入；每次连接创建全新 epoch，旧目标必须重新发现和选择。冷恢复先清理持久的 held 输入，释放失败保留错误并阻止控制，不以重连绕过。闹钟、选项消息和启动共用恢复过程，防止重复释放。

扩展要求 `debugger` 权限用于真实鼠标/键盘与截图，`scripting`/HTTP(S) host permissions 用于 DOM 观察，`tabs`/`webNavigation` 用于目标与 document identity，`downloads` 用于下载事件，`storage` 用于授权/下载持久化，`alarms` 用于已授权 worker 恢复。无 externally_connectable、外部消息监听、远程代码或任意网页授权入口；仅已配对的本机身份自动恢复连接。

选择标签不会激活它，AI 新建标签使用 `active:false`。输入通过目标 CDP 与焦点模拟派发，不占用全局键鼠；释放时撤销模拟并清理本扩展持有的输入。后台页面的游标动画可延后显示，不阻塞真实操作。动作回执声明 `effectVerified:false`，需要后续观察确认效果。详见[后台操作](<../README.md#后台操作>)。

## 桥 API（供主 agent 集成 Composite backend）

```js
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createExtensionBackend } from '../src/extension/backend.mjs';
import { createBrowserPairing } from '../src/extension/pairing.mjs';
import { listenExtension } from '../src/extension/listen.mjs';

const server = createServer(), dataDir = '/private/opencu-data/extension';
const token = randomBytes(32).toString('hex');
const pairing = createBrowserPairing(dataDir);
await pairing.ready;
const extension = createExtensionBackend({ server, token, dataDir, pairing });
await listenExtension(server);
await pairing.request('Chrome'); // 触发扩展许可；不泄露私有传输 token。
const targets = await extension.listTargets();
const tab = await extension.select(targets.find(t => t.supported));
const observation = await extension.observe(tab, { format: 'both', includeBase64: false });
await extension.act(tab, { action: 'click', elementId: 2 });
await extension.release({ targets: [tab] });
await extension.close();
```

`createExtensionBackend` 同步返回对象；初始化与持久化在首次请求中等待，`await createExtensionBackend(...)` 也有效。

- `listTargets()` → JSON Target[]。`backend:'extension', kind:'tab'`，browserId 与 owned Playwright backend 分离。
- `select(id | Target | {url/title/browserId/kind, expected?})` → Target，要求当前身份并附加 debugger；已由 DevTools / Playwright attach 的 tab 返回 `TARGET_BUSY`，不抢占、不 detach 他人 client。首次附加后的保存／初始化失败会清理自有连接；清理失败保留原错误和释放入口，未初始化连接不能冒充可用。
- `verify(Target)` → `{valid, target?, reason?, error?}`，支持核心冷恢复核验。
- `observe(Target, {format:'ax'|'screenshot'|'both', screenshot?, ax:'native'?, includeBase64?})` → JSON；DOM AX approximation + 数字 elementId、可选官方 native AX、viewport screenshot。截图默认写 `dataDir/observations/<uuid>.png`；includeBase64 才返回 base64，避免预览拿到无意义的大 JSON。
- `act(Target, request)` → JSON；接受核心 camelCase action / `type` aliases：navigate/back/forward/reload/newTab/closeTab/activate/click/doubleClick/rightClick/move/mouseDown/mouseUp/scroll/drag/type/fill/press/keyDown/keyUp/set_value/cursor。导航返回新 occurrence `target`，关闭返回 `closedTargetId`。AbortSignal 只在桥内使用、不发送到扩展。
- `release({targets})` / `release(Target)` / `release()` → `{released, failures?}`，释放 held key/button、移除产品指针、detach 自己的 debugger；失败保留状态并允许重试；服务端释放超时或负回执不会丢弃原会话，阻止新控制并保留释放／断开重试通道，完整释放确认后恢复。输入释放未确认时保留自己持有的 debugger，避免切断后续 keyUp／mouseReleased 重试通道。最终释放记录保存失败时保留待保存状态，重试只补存日志，不重发键鼠或分离后来接入的客户端；保存成功后 observe/act 核验当前 document 并重新 attach。
- `newTab(browserId, url)` → 发现结果，普通 HTTP(S) only；随后从 listTargets/select 获取可控制 Target。
- `deliveries()` / `listDownloads()` → 持久下载事件归并的 JSON 列表。`filename` 是 Chrome 实际下载路径，`attribution:'browser-wide'`，不伪称 tab 归属，不提供任意文件读取/复制。确认写回本地存储失败保留待确认事件与错误，串行队列仍可继续；明确重连后安全重传，服务端去重，成功写回后才移除事件。服务端队列执行时重新核验会话，重连后尚未开始的旧会话写入被拒绝，不覆盖新状态或启动复制。尚未记录的排队事件绑定原连接，断开／重连后失效，不沿用新连接的持久复制授权。已存档事件重传时，仅已知复制失败且会话／事件仍授权的记录重试复制，不重复追加事件；正文已复制但索引失败时保留私有待提交记录，同实例及新进程重试都会校验副本后补存索引，不重读原件或生成第二份副本；副本被改动或记录越界时拒绝恢复并保留文件。交付查询返回当前快照，不等待进行中的持久复制；复制中为 pending，失败保留诊断，已交付副本可继续读取。退出仍等待复制落盘。事件日志末尾未换行或追加部分失败时保留原字节，后续追加先隔离残行，避免已确认新事件在冷重开时被吞掉。
- `getDiagnostics()` → 连接数、pending 命令数、是否需要挂载。
- `handleRequest(req,res)` → boolean，用于已有 HTTP 服务；**在服务自身 UI Origin 检查及 404 handler 之前调用**。传入无 request listener 的 server 时自动挂载，已有 listener 时不抢路由并设置 `routeIntegrationRequired:true`。不自行 listen/close 用户提供的 server。后端关闭开始即拒绝新连接／新控制，并清理排队控制请求，原会话仍可轮询与回传释放结果；并发 close 共享同一收尾，释放未确认保留连接并允许重试 close。

```js
const extension = createExtensionBackend({ token, dataDir });
const server = createServer((req, res) => {
  if (extension.handleRequest(req, res)) return;
  // host 的其余路由与 same-origin 检查
});
```

协议路径 `/opencu-extension/v1/{connect,poll,result,disconnect}`，POST JSON + `Authorization: Bearer <token>`。连接请求含 `protocol:1, authorized:true, debuggerConsent:true, instanceId, browserInstanceId, epoch`。服务仅接受 socket loopback、匹配实际端口的 `Host:127.0.0.1:<port>`、`chrome-extension://[a-p]{32}` Origin 和正确 token；无网页 CORS 授权。token 不进 URL。扩展 endpoint 只能由端口构造，不接受远端 URL 或 redirect。

目标 ID 包含 `extension:<installInstance>/<browserInstance>/<epoch>/<tabId>/<documentId>`。安装实例和配对凭据持久在 local；browser instance 和本次传输仅在 storage.session；每次连接随机 epoch；DOM document UUID + Chrome executeScript documentId 双重核对。DOM 元素 ID 不复用到其他 document。发现／允许／拒绝路由为 `discover,pair,decline`，只接受本机扩展 Origin；发现仅返回 challenge 与 hostId，不暴露控制凭据。`forget` 需配对认证并确认释放。监听 19390–19399 的首个可用端口，DSH 重启换端口也可被重新发现。

## 截图坐标和输入

```js
await extension.act(tab, {
  action: 'click', x: 300, y: 200,
  screenshotId: observation.screenshot.id,
  previewWidth: 600, previewHeight: 400,
});
```

默认 x/y 是返回截图的像素，若产品将图像缩放显示则必须传真实显示图片尺寸（不包含 letterbox 边距）。映射为 `bounds.x + x * bounds.width / previewWidth`，y 同理；不再乘 devicePixelRatio。`coordinateSpace:'css'` 明确使用 viewport CSS 坐标，避开截图映射。导航、滚动、缩放、resize、DOM 几何变化及任何输入都会使旧截图失效；错误要求重新 observe。pinch zoom 非 1 明确拒绝，而普通浏览器 page zoom/Retina 使用实际截图尺寸与 CSS viewport 映射。

点击/Unicode type/fill/key/scroll/drag 使用官方 `chrome.debugger` CDP Input。fill 先选择真实控件文本，再用 Input.insertText 替换。macOS 的组合键同时携带原生编辑命令，Cmd+A、Shift 导航及词／行删除作用于真实编辑器，网页仍可 preventDefault；自动标记使用实际键值。滚轮标记按坐标与增量一次匹配，在提交结算后开始有效期，提交前取消会移除标记。`press` 支持单独 `+` 和 `Control++` 等加号组合，临时组合只释放本次新增的按键，保留此前显式持有的修饰键。`set_value` 使用 native DOM setter 与 **untrusted** input/change 事件，返回 `inputMode:'synthetic-dom'`；自定义网站可能忽略，不应把此操作当作 OS 输入成功。DOM 内容脚本不使用 `.click()` 冒充真实点击。cursor 是 pointer-events:none、aria-hidden 的产品指针，不截获用户点击；释放移除。

## 已实际验证

2026-10-16：真实隔离 Chrome 自动弹窗，原生单击「允许并记住」；重建本地服务及关闭再启动同一隔离浏览器均自动恢复，无二次点击；安装实例不变，重连 epoch 更新，浏览器重启 browserInstanceId 更新。HTTP 配对定点覆盖摘要存储、撤销、拒绝、坏网页 Origin 和旧会话不重放；Edge 与整机重启未实机运行。

历史 2026-10-13：

- `node --check extension/background.js`、`node --check extension/content.js`。
- `node --test test/extension-protocol.test.mjs`：网站 Origin/坏 token/无授权拒绝、epoch 隔离、下载事件幂等与服务重建后读取、Retina + preview 缩放映射边界。
- `OPENCU_EXTENSION_REAL=1 node --test test/extension-protocol.test.mjs test/extension-real.test.mjs`：最终退出 0，真实隔离 Google Chrome for Testing 153，独立 profile + 下载目录；MV3 加载、主动连接、禁止内部页、2× viewport截图按 CSS-sized preview 精准点击、页面 isTrusted:true、中文 type/fill、Enter、合成 set_value、拖拽/滚动旧截图拒绝、真实下载路径/文件内容、navigate/back/forward/reload document 更新、held key/button 持久与释放、释放后重新观察、用户断开。
- 额外真实操作：Playwright 持有同标签时返回 TARGET_BUSY；浏览器重启后未授权且桥 inventory 为空；native AX 获取成功。未触碰用户当前 Chrome 扩展/profile 或当前 DSH。

少量实操测试为 opt-in，不加入默认大套回归。测试专用 launch flags 关闭 Chromium 后台网络及 local-network checks，避免新隔离 profile 的后台服务干扰本地夹具；不是产品安装要求。测试 profile 在本目录 `.verification-*` 下，仅测试会产生，打包必须排除/清理它们。

## 明确限制

- Edge、Windows/多屏/不同系统缩放、实际账号/复杂真实网站、Chrome debugger 提示条取消、MV3 被强制终止时 held 输入释放尚未实机验收；实现持久 held 状态和 fail-closed 恢复，不等于已验收。
- DOM 数字元素覆盖主文档和 open shadow roots；closed shadow / cross-origin iframe 通过新截图坐标操作，非完整 native AX-to-element 定位。native AX 返回 CDP node/backendDOMNodeId，仅观察用。
- viewport 截图，不支持 fullPage 或 pinch-zoom screenshot 操作；不提供 Playwright locator/evaluate 能力，不改 Playwright 全局设置。
- 下载 API 没有可靠 tabId，仅连接授权期间 browser-wide 事件；不自动读取本机任意路径、不替换文件 provider、不处理 upload/dialog/clipboard。Chrome downloads 中的 filename 是实际路径；跨设备交付需主服务后续授权文件桥。
- token 持有者与本机 extension Origin 视为授权客户端；协议不能保护本机恶意进程冒充 Origin。外部网站无法借 token URL/CORS/extension message 任意接入。
- 断连／命令超时不伪称 release 已成功；已配对身份可自动重建传输，但未知结果不重放输入，原目标需要重新发现。主动断开、debugger 提示取消或释放失败仍暂停控制。停止中已发往 Chrome 的动作不能撤销。

核对官方文档：
- https://developer.chrome.com/docs/extensions/reference/api/debugger?hl=en （官方 debugger 权限、Input/Page/Accessibility 允许 domains、attach/getTargets/onDetach）
- https://developer.chrome.com/docs/extensions/reference/api/scripting?hl=en （ISOLATED、documentIds/InjectionResult.documentId、injectImmediately）
- https://developer.chrome.com/docs/extensions/reference/api/downloads?hl=en （持久 download id、绝对 filename、onCreated/onChanged/onErased）
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle?hl=en （Chrome 118 debugger sessions 保活、session/local 持久化）
