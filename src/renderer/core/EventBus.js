/**
 * Minimal synchronous event bus used to notify features about cross-cutting
 * changes without wiring them to each other directly.
 */
function createEventBus() {
  const listeners = new Map();

  function on(eventName, listener) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(listener);
    return () => listeners.get(eventName)?.delete(listener);
  }

  function emit(eventName, payload) {
    const eventListeners = listeners.get(eventName);
    if (!eventListeners) return;
    Array.from(eventListeners).forEach((listener) => listener(payload));
  }

  return {
    emit,
    on,
  };
}

const APP_EVENTS = Object.freeze({
  playbackUiSynced: 'playback:ui-synced',
});

module.exports = {
  APP_EVENTS,
  createEventBus,
};
