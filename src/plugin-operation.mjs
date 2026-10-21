// Both feature management and OMD updates interpret the same native result.
// Package ownership, reviewed versions and installed-version checks stay with
// their respective callers; this module only classifies the host's outcome.
export function pluginManagementError(error) {
  if (error?.code === 'incompatible-version') {
    const versions = (error.incompatible || []).map(item => `${item.name} ${item.version} 不兼容 DSH ${item.runtimeVersion}`).join('；');
    return `${versions || '插件版本与当前 DSH 不兼容'}。请安装适配版本，或到宿主“插件”页面查看详情`;
  }
  return error?.diagnostic || error?.code || '';
}

export function requirePluginChange(result) {
  if (result?.application === 'failed') {
    if (result.pendingBuilds?.length) throw Error('安装脚本需要授权，请到宿主“插件”页面处理：' + result.pendingBuilds.join('、'));
    const message = result.error?.code === 'incompatible-version' ? pluginManagementError(result.error)
      : result.error?.diagnostic || result.packageResult?.output || result.error?.code || '插件操作失败';
    throw Error(String(message).slice(-2000));
  }
  if (result?.application === 'cancelled') throw Error('操作已取消，可以重试。');
  if (result?.application === 'overridden') throw Error('插件配置被其他配置覆盖，请到宿主“插件”页面检查');
  if (!['applied', 'restart-required'].includes(result?.application)) throw Error('未能确认插件操作结果，请到宿主“插件”页面检查');
  return result.application;
}
