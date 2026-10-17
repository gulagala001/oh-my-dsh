export const discoveryPorts = Array.from({length: 10}, (_, index) => 19390 + index);

/** One plugin-owned listener, discoverable without sharing its private control token. */
export async function listenExtension(server) {
  for (const port of discoveryPorts) {
    try {
      await new Promise((resolve, reject) => {
        const done = () => { server.off('error', failed); resolve(); };
        const failed = error => { server.off('listening', done); reject(error); };
        server.once('error', failed); server.once('listening', done); server.listen(port, '127.0.0.1');
      });
      return port;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw Object.assign(new Error('OpenCU browser connection ports are occupied; close the duplicate DSH profile and retry.'), {code: 'EXTENSION_PORT_IN_USE'});
}
