// Node's rename can replace an existing empty directory. Publish with the
// filesystem's no-replace operation so even non-cooperating creators win safely.
let publish;
async function publisher() {
  const { default: koffi } = await import('koffi');
  if (process.platform === 'win32') {
    const kernel = koffi.load('kernel32.dll');
    const move = kernel.func('bool __stdcall MoveFileExW(str16, str16, uint32)');
    const lastError = kernel.func('uint32 __stdcall GetLastError()');
    return (from, to) => {
      if (move(from, to, 0x8)) return true; // WRITE_THROUGH, without REPLACE_EXISTING
      const error = lastError();
      if ([80, 183].includes(error)) return false;
      throw Error(`Cannot publish workspace (Windows error ${error})`);
    };
  }
  const libc = koffi.load(null);
  let move;
  if (process.platform === 'darwin') {
    const rename = libc.func('int renamex_np(str, str, uint32)');
    move = (from, to) => rename(from, to, 4); // RENAME_EXCL
  } else if (process.platform === 'linux') {
    const rename = libc.func('int renameat2(int, str, int, str, uint32)');
    move = (from, to) => rename(-100, from, -100, to, 1); // AT_FDCWD, RENAME_NOREPLACE
  } else {
    throw Error('Exclusive workspace publication is unavailable on this platform');
  }
  return (from, to) => {
    if (move(from, to) === 0) return true;
    const error = koffi.errno();
    if (error === koffi.os.errno.EEXIST || error === koffi.os.errno.ENOTEMPTY) return false;
    throw Error(`Cannot publish workspace (errno ${error})`);
  };
}

export async function publishWorkspace(from, to) {
  publish ??= await publisher();
  return publish(from, to);
}
