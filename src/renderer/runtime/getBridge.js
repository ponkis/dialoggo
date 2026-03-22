function getDialoggoBridge() {
  const bridge = globalThis.dialoggo || globalThis.window?.dialoggo;

  if (!bridge) {
    throw new Error('Dialoggo preload bridge is unavailable.');
  }

  return bridge;
}

module.exports = {
  getDialoggoBridge,
};