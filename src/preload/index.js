const {
  contextBridge,
  ipcRenderer,
} = require('electron');
const {
  IPC_CHANNELS,
} = require('../shared/ipcChannels');

// The preload runs sandboxed: no Node APIs, only a narrow, typed facade over
// IPC. Every privileged operation lives in a main-process handler.

function logMessage(level, message, meta) {
  ipcRenderer.send(IPC_CHANNELS.log, {
    level,
    message,
    meta,
  });
}

const bridge = {
  app: {
    getInfo() {
      return ipcRenderer.invoke(IPC_CHANNELS.appGetInfo);
    },
    notifyReady(summary) {
      ipcRenderer.send(IPC_CHANNELS.appRendererReady, summary);
    },
  },
  catalog: {
    load() {
      return ipcRenderer.invoke(IPC_CHANNELS.catalogGet);
    },
  },
  window: {
    minimize() {
      ipcRenderer.send(IPC_CHANNELS.windowMinimize);
    },
    close() {
      ipcRenderer.send(IPC_CHANNELS.windowClose);
    },
  },
  log: {
    debug(message, meta) {
      logMessage('debug', message, meta);
    },
    info(message, meta) {
      logMessage('info', message, meta);
    },
    warn(message, meta) {
      logMessage('warn', message, meta);
    },
    error(message, meta) {
      logMessage('error', message, meta);
    },
  },
};

contextBridge.exposeInMainWorld('dialoggo', bridge);
