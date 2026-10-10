const labels = {
  click: '点击', drag: '拖动', scroll: '滚动', pressKey: '按键', typeText: '输入文字',
  setValue: '填写内容', paste: '粘贴', selectText: '选择文字', performSecondaryAction: '操作控件',
  getAXState: '查看内容', getScreenshot: '查看画面', getAXStateAndScreenshot: '查看内容与画面',
  goto: '打开网页', back: '返回上一页', forward: '前往下一页', reload: '刷新网页', close: '关闭页面',
  'downloads.save': '保存下载', 'content.export': '导出内容', 'pageAssets.bundle': '保存页面素材',
};
export function computerOperationLabel(operation) {
  if (labels[operation]) return labels[operation];
  if (typeof operation === 'string' && operation.startsWith('playwright.')) {
    const action = operation.split('.').at(-1);
    return ({ click: '点击', fill: '填写内容', type: '输入文字', check: '勾选选项', uncheck: '取消勾选', selectOption: '选择选项', press: '按键', domSnapshot: '查看页面' })[action] ?? '操作网页';
  }
  return '操作电脑';
}
export function computerActivity(state) {
  if (state?.resuming) return '正在恢复';
  if (state?.transitioning) return '正在载入';
  if (state?.status === 'running') return state.operation ? '正在' + computerOperationLabel(state.operation) : '助手正在操作';
  return ({ idle: '就绪', stopped: '已停止 · 可手动操作', stopping: '正在停止', error: '需要处理' })[state?.status] ?? '正在连接';
}
