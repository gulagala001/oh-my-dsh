# 新 OpenCU 原生后端

入口：`src/native/index.mjs` / `src/native/backend.mjs` 的 `await createNativeBackend({dataDir})`。按平台启动随包 macOS helper、Windows PowerShell/C# helper 或 Linux Python helper；使用公开系统 API，从零实现，不复用旧 CU helper。下列 Quartz/AX 说明针对 macOS。

## 接口

返回七方法，符合 `src/protocol.mjs` 的 plain backend contract：

- `listTargets()` → 应用和窗口 Target 数组。`kind: 'app'`，`targetType: 'application' | 'window'`，`backend: 'native'`。窗口枚举包含非当前前台/Space 的真实窗口，排除透明及 24 点菜单代理窗口。
- `select(target | id | bundleId | {bundleId, launch:true} | {path:'/absolute/App.app', launch:true})` → 激活的 Target。窗口选择需要 AX 权限；launch 是附加的后端直连选择能力，现有 controller 先 inventory 再 select，不会创建不存在的应用。
- `observe(target, {format:'ax'|'screenshot'|'both', scope?:'display', includeBase64?, maxNodes?, maxDepth?, timeoutMs?})` → `observationId/targetId/identity/coordinateSpace/ax/text/screenshot`。`both` 仅一项成功时返回 `partial:true,errors:[...]`，两项失败抛出真实错误。应用截图是主显示器；窗口截图去阴影、保留物理分辨率。
- `act(target, request)` → `{performed:true,type,input}`。支持 click/doubleClick/rightClick/move/mouseDown/mouseUp/drag/scroll/keyDown/keyUp/press/type/fill/setValue/ax_press/activate，`type` 或 `action` 均可。AX 数字 `elementId` 来自最近一次该目标 AX 观察，下一次 AX 观察或 helper 重启即失效。支持明确 `keyCode`，常见键名与组合键；Unicode 文本不动剪贴板，Tab/换行采用真 Tab/Return 事件。
- `release({targets}?)` → `{released,failures,heldKeys,heldButtons}`。OS 输入是全局的，始终释放此 helper/journal 持有的所有输入，不按 targets 过滤。
- `verify(target,{cold?})` → `{valid,target?,reason?,error?}`。核对 PID、公开 libproc 进程起始秒/微秒、bundleId、executable、windowId；cold 还核验标题。裸 ID 无保存 identity 不能冷恢复。
- `close()` → 释放成功后退出。释放失败抛 `RELEASE_FAILED`，helper 继续存活、journal 保留；不假清理。

调用现有核心：

```js
const native = await createNativeBackend({dataDir});
const controller = await createController({dataDir, browser:false, native});
```

插件运行时创建原生后端并交给同一 controller；独立包和 OMD 内置包均包含平台 helper 来源。缺少系统依赖或权限时返回真实后端错误，不使用空实现。

## 坐标与释放

截图的 `width/height` 是实际 PNG 物理像素；`bounds` 是 Quartz 全局屏幕点，`scale/scaleX/scaleY` 是实际比值。点击坐标来自最近 screenshot 的物理像素；转换是 `bounds.origin + point * bounds.size / image.size`。窗口移动/缩放、display geometry 变化或 `mappingId` 不匹配都要求重观察。AX bounds 直接为 Quartz 点，不混用截图像素。不会缩图，暂不接受浏览器后端的 maxWidth/maxHeight 选项。

Down 先原子写 durable input journal 再投递，Up 经真实 `CGEventSource` 状态确认并成功持久化后才移除。拒绝获取用户已经持有的键/按钮。每次投递前核对前台 PID；明确窗口目标还核对 focused AX window。异常尝试 release，失败附在错误详情。stdin 独立 reader 使 release/close/EOF 能取消进行中的 drag/文本；排队 action 带控制 epoch，停止之前的队列不会随后继续执行。

数据目录用 OS `flock` 排除同目录的并发 helper。进程崩溃释放 OS ownership，但不清 journal；下次启动先 release，再允许操作。EOF release 失败退出码 2，journal 仍保留。不是系统全局跨 dataDir 排他，也未实现从物理用户事件自动触发 takeover。

## 平台条件

- **macOS**：使用系统 Accessibility、Quartz 与定向输入，需要对应系统权限。
- **Windows**：Windows 10 1703+ 和系统 .NET Framework；使用 UI Automation、Win32 与 Per-Monitor-V2 物理像素模式，受 UIPI 限制。
- **Linux X11**：Python 3、libX11、libXtst；语义操作与 Unicode 输入需要 python3-pyatspi。
- **Linux Wayland**：系统 RemoteDesktop／ScreenCast portal、PipeWire 与相应依赖；由用户授权共享单个显示器和输入。

Windows 输入 hook 和 Linux XInput2 仅记录所选目标的活动种类、时间与序号，不保存按键内容；缺少监听能力时明确报告。多屏混合缩放不在当前支持范围。
