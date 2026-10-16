/** Play/pause/stop/fast-forward buttons. Blocked buttons stay focusable via aria-disabled. */
function createPlaybackControlsView({
  refs,
  state,
}) {
  function setBlocked(element, blocked) {
    if (!element) return;
    element.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }

  function isBlocked(element) {
    return !!element && element.getAttribute('aria-disabled') === 'true';
  }

  function sync({
    playBlocked,
    pauseBlocked,
    stopBlocked,
    uploadBlocked,
  }) {
    setBlocked(refs.btnPlay, playBlocked);
    refs.btnPlay.title = state.isPaused ? 'Resume' : 'Play';
    setBlocked(refs.btnPause, pauseBlocked);
    setBlocked(refs.btnStop, stopBlocked);
    setBlocked(refs.btnUpload, uploadBlocked);
  }

  function updateFastForwardAvailability(canFastForward) {
    if (!refs.btnFastForward) return;
    setBlocked(refs.btnFastForward, !canFastForward);
    refs.btnFastForward.classList.toggle('fast-forwarding', state.isFastForwarding);
    refs.btnFastForward.title = canFastForward ? 'Hold Shift + Space to fast forward' : 'Fast forward';
  }

  function blurFocusedButton() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    if (!activeElement.matches('#btn-play, #btn-pause, #btn-stop, #btn-fastforward')) return;
    activeElement.blur();
  }

  return {
    blurFocusedButton,
    isBlocked,
    sync,
    updateFastForwardAvailability,
  };
}

module.exports = {
  createPlaybackControlsView,
};
