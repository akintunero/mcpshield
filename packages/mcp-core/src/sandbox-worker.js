const { parentPort, workerData } = require('worker_threads');

(async () => {
  try {
    const { pluginId, entrypoint, method, args } = workerData;

    // Load the plugin module in isolation
    const mod = require(entrypoint);
    const plugin = mod.default || mod;

    // Call the requested method
    const handler = plugin[method] || plugin.capabilities?.[method];
    if (!handler) {
      throw new Error(`Method "${method}" not found on plugin "${pluginId}"`);
    }

    const result = await handler(...args);
    parentPort?.postMessage(result);
  } catch (e) {
    parentPort?.postMessage({ error: e.message });
  }
})();
