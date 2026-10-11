function errorMessage(value) {
  return typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : null;
}

export function getScreenLockSetupState(native) {
  const installation = native?.screenLockInstallation;
  const runtime = native?.screenLock;
  if (native?.platform !== 'darwin' || installation == null) return null;
  const installed = installation.installed === true;
  const configured = typeof installation.configured === 'boolean' ? installation.configured : runtime?.configuration?.configured;
  const recoveryRequired = installation.recoveryRequired === true;
  const busy = installation.busy === true;
  const supported = installation.supported !== false;
  const canInstall = supported && installation.canInstall !== false && native.installed === true && !busy && !recoveryRequired && (installation.installed === false || installed && (configured === false || installation.registered === false));
  const canRemove = supported && !busy && (installation.removable === true || installed);
  const canRecover = supported && !busy && recoveryRequired;
  const runtimeAvailable = runtime?.provider?.available;
  return {
    installation, runtime, installed, configured, busy, recoveryRequired, supported,
    canInstall, canRemove, canRecover,
    error: errorMessage(installation.error) ?? errorMessage(installation.lastError),
    runtimeError: errorMessage(runtime?.error),
    status: busy ? '正在处理系统安装' : recoveryRequired ? '需要恢复系统配置' : typeof installation.installed !== 'boolean' ? '安装状态未检测' : !installed ?
      installation.prepared === true ? '安装器已准备 · 待系统授权' : '未安装' :
      configured === false || installation.registered === false ? '已安装 · 配置未完成' : configured === true ? '已安装并配置' : '已安装 · 运行配置待检测',
    runtimeStatus: runtimeAvailable === true ? '可用' : runtimeAvailable === false ? '当前不可用' : '未检测',
  };
}
