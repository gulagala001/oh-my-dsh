import { fileURLToPath } from 'node:url';

// OS processes cannot follow Electron's virtual paths inside the Desktop runtime.
export function desktopResourcePath(url) {
  const path = fileURLToPath(url);
  return process.versions.electron ? path.replace(/([\\/])app\.asar(?=[\\/]dsh[\\/]node_modules[\\/])/u, '$1app.asar.unpacked') : path;
}
