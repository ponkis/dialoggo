/**
 * Window-level chrome: the frameless title bar buttons, the footer version and
 * brand link, and the global click / "forbidden" interface sounds.
 */
function createAppChromeController({
  refs,
  appInfo,
  bridge,
  audio,
  startup,
}) {
  function renderBranding() {
    if (refs.versionLabel) refs.versionLabel.textContent = `v${appInfo.appVersion}`;
    if (refs.brandLink && appInfo.appHomepage) refs.brandLink.href = appInfo.appHomepage;
  }

  function bindWindowControls() {
    refs.btnMinimize?.addEventListener('click', () => {
      bridge.window.minimize();
    });

    refs.btnClose?.addEventListener('click', async () => {
      await startup.runShutdown();
      bridge.window.close();
    });
  }

  function bindInterfaceSounds() {
    document.addEventListener('click', (event) => {
      const element = event.target.closest('button, .reel-arrow, a, .powered-link');
      if (!element) return;
      if (element.disabled || element.getAttribute('aria-disabled') === 'true') return;
      if (element.classList.contains('char-btn') || element.classList.contains('background-card') || element.closest('.reel-arrow')) return;
      if (element.classList.contains('sleeve-tab') || element.closest('.uiverse-rocker-switch')) return;
      audio.playMenuSound('click');
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const element = target.closest('button:disabled, .char-btn.unavailable, [disabled], [aria-disabled="true"]');
      if (element) {
        audio.playMenuSound('forbidden');
        return;
      }

      const computed = window.getComputedStyle(target);
      if (computed.cursor === 'not-allowed') {
        audio.playMenuSound('forbidden');
      }
    }, true);

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const element = target.closest('button:disabled, .char-btn.unavailable');
      if (!element) return;
      audio.playMenuSound('forbidden');
    }, true);
  }

  function bindEvents() {
    bindWindowControls();
    bindInterfaceSounds();
  }

  return {
    bindEvents,
    renderBranding,
  };
}

module.exports = {
  createAppChromeController,
};
