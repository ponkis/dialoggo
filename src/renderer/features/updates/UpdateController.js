const {
  formatBytes,
} = require('../../domain/formatBytes');

const RELEASES_PATH = '/releases/latest';

/**
 * The update flow, modeled on Mystral's: an optional silent check at startup,
 * a manual "Check now" in Settings, a confirm prompt, a cancellable download
 * with progress and retry, then launching the installer and closing the app.
 * After an update, the first launch shows "Update installed" with a link to
 * the changes.
 */
function createUpdateController({
  refs,
  appInfo,
  bridge,
  preferences,
  dialog,
  audio,
  startup,
}) {
  const releasesPageUrl = `${appInfo.repositoryUrl}${RELEASES_PATH}`;
  let checking = false;
  let downloading = false;

  function setStatus(text) {
    if (refs.updateStatusText) refs.updateStatusText.textContent = text;
  }

  function setChecking(isChecking) {
    checking = isChecking;
    if (!refs.btnCheckUpdates) return;
    refs.btnCheckUpdates.disabled = isChecking;
    refs.btnCheckUpdates.textContent = isChecking ? 'Checking…' : 'Check now';
  }

  function defaultStatusText() {
    return appInfo.canApplyUpdates ?
      'Checks GitHub for a newer release.' :
      'Development build: new releases open the download page.';
  }

  function showMessage(title, message, extra = {}) {
    dialog.show({
      title,
      message,
      actions: [{
        label: 'OK',
        primary: true,
        onClick: dialog.close,
      }],
      onEscape: dialog.close,
      ...extra,
    });
  }

  function showAvailable(update) {
    const intro = `Dialoggo ${update.latestVersion} is available. You have ${update.currentVersion}.`;
    const size = update.downloadSize ? ` (${formatBytes(update.downloadSize)})` : '';
    const link = update.notesUrl ? {
      label: 'What\'s new?',
      href: update.notesUrl,
    } : null;
    const notNow = {
      label: 'Not now',
      onClick: dialog.close,
    };

    if (update.installMode === 'installer') {
      dialog.show({
        title: 'Update available',
        message: `${intro}\n\nDownload and install it now${size}? Dialoggo will close to finish the update.`,
        link,
        actions: [notNow, {
          label: 'Download and install',
          primary: true,
          onClick: () => void downloadAndInstall(update),
        }],
        onEscape: dialog.close,
      });
      return;
    }

    if (update.installMode === 'disk-image') {
      dialog.show({
        title: 'Update available',
        message: `${intro}\n\nDownload it now${size}? The disk image opens so you can drag Dialoggo into Applications.`,
        link,
        actions: [notNow, {
          label: 'Download',
          primary: true,
          onClick: () => void downloadAndInstall(update),
        }],
        onEscape: dialog.close,
      });
      return;
    }

    dialog.show({
      title: 'Update available',
      message: `${intro}\n\nOpen the release page to download it.`,
      link,
      actions: [notNow, {
        label: 'Open download page',
        primary: true,
        href: update.releaseUrl || releasesPageUrl,
        onClick: dialog.close,
      }],
      onEscape: dialog.close,
    });
  }

  async function check({
    interactive,
  }) {
    if (checking || downloading) return;

    setChecking(true);
    if (interactive) setStatus('Checking for updates…');

    try {
      const result = await bridge.updates.check();

      if (!result?.ok) {
        setStatus('Could not reach GitHub. Try again later.');
        if (interactive) {
          audio.playMenuSound('forbidden');
          showMessage('Update check failed', `Could not check GitHub releases.\n\nCause: ${result?.message || 'Unknown error.'}`);
        }
        return;
      }

      if (result.status === 'available') {
        setStatus(`Dialoggo ${result.latestVersion} is available.`);
        showAvailable(result);
        return;
      }

      const upToDate = result.status === 'no-releases' ?
        'No releases have been published yet.' :
        `Dialoggo ${result.currentVersion} is up to date.`;
      setStatus(upToDate);
      if (interactive) showMessage('No updates found', upToDate);
    } finally {
      setChecking(false);
    }
  }

  async function installDownloadedUpdate(update) {
    dialog.show({
      title: 'Installing update',
      message: `Starting the Dialoggo ${update.latestVersion} installer…`,
    });

    const result = await bridge.updates.install();
    if (!result?.ok) {
      showMessage('Update failed', `The installer could not be started.\n\nCause: ${result?.message || 'Unknown error.'}`);
      return;
    }

    dialog.close();
    await startup.runShutdown();
    bridge.window.close();
  }

  async function downloadAndInstall(update) {
    if (downloading) return;
    downloading = true;

    const versionLabel = `Dialoggo ${update.latestVersion}`;
    dialog.show({
      title: 'Downloading update',
      message: versionLabel,
      progress: true,
      actions: [{
        label: 'Cancel',
        onClick: () => bridge.updates.cancelDownload(),
      }],
      onEscape: () => bridge.updates.cancelDownload(),
    });

    const unsubscribe = bridge.updates.onProgress(({
      receivedBytes,
      totalBytes,
    }) => {
      const text = totalBytes ?
        `${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)}` :
        formatBytes(receivedBytes);
      dialog.setProgress(receivedBytes, totalBytes, text);
    });

    let result;
    try {
      result = await bridge.updates.download();
    } finally {
      unsubscribe();
      downloading = false;
    }

    if (result?.ok) {
      await installDownloadedUpdate(update);
      return;
    }

    if (result?.code === 'canceled') {
      setStatus(`Dialoggo ${update.latestVersion} is available.`);
      showMessage(
        'Update canceled',
        'The update download was canceled. The installer was not launched, and Dialoggo was not changed.',
      );
      return;
    }

    audio.playMenuSound('forbidden');
    dialog.show({
      title: 'Update download failed',
      message: `Dialoggo couldn't download version ${update.latestVersion}.\n\nCause: ${result?.message || 'Unknown error.'}\n\nCheck your connection, then choose Retry to try again.`,
      actions: [{
        label: 'Cancel',
        onClick: dialog.close,
      }, {
        label: 'Retry',
        primary: true,
        onClick: () => void downloadAndInstall(update),
      }],
      onEscape: dialog.close,
    });
  }

  function showUpdateInstalled(updatedFrom) {
    showMessage('Update installed', `Dialoggo was updated to version ${updatedFrom.currentVersion}.`, {
      link: updatedFrom.compareUrl ? {
        label: 'What\'s new?',
        href: updatedFrom.compareUrl,
      } : null,
    });
  }

  function isStartupCheckEnabled() {
    return preferences.readFlag(preferences.keys.checkUpdatesOnStartup, true);
  }

  function initialize() {
    if (refs.updateVersionLabel) refs.updateVersionLabel.textContent = `Version ${appInfo.appVersion}`;
    if (refs.inputCheckUpdates) refs.inputCheckUpdates.checked = isStartupCheckEnabled();
    setStatus(defaultStatusText());
  }

  /** Runs once the startup intro has finished. */
  function runStartupTasks() {
    if (appInfo.updatedFrom) {
      showUpdateInstalled(appInfo.updatedFrom);
      return;
    }

    if (appInfo.canApplyUpdates && isStartupCheckEnabled()) {
      void check({
        interactive: false,
      });
    }
  }

  function bindEvents() {
    refs.btnCheckUpdates?.addEventListener('click', () => {
      void check({
        interactive: true,
      });
    });

    refs.inputCheckUpdates?.addEventListener('change', () => {
      preferences.writeString(preferences.keys.checkUpdatesOnStartup, refs.inputCheckUpdates.checked);
      audio.playMenuSound('click');
    });
  }

  return {
    bindEvents,
    check,
    initialize,
    runStartupTasks,
  };
}

module.exports = {
  createUpdateController,
};
