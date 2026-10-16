const {
  nextPaint,
  sleep,
} = require('../../core/timing');

const WARMUP_SOUND_KEYS = ['click', 'select', 'arrowRight', 'arrowLeft', 'forbidden', 'startupReveal', 'shutdown'];

function resizeIntroCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * The boot overlay (loading animation, asset prewarm, jiggy iris-out reveal)
 * and its reverse played as the window closes.
 */
function createStartupSequence({
  refs,
  constants,
  ui,
  audio,
  images,
  log = null,
}) {
  const loadingFrames = ui.loadingFrames;
  let loadingFrameIdx = 0;
  let loadingTimer = null;
  let revealAudioHandle = null;
  let shutdownPromise = null;

  function showLoadingFrame() {
    const frameUrl = loadingFrames[loadingFrameIdx];
    if (frameUrl && refs.startupLoadingAnim) {
      refs.startupLoadingAnim.src = frameUrl;
    }
  }

  function startLoadingAnim() {
    if (!refs.startupLoadingAnim || loadingTimer) return;

    loadingFrameIdx = 0;
    showLoadingFrame();
    loadingTimer = setInterval(() => {
      loadingFrameIdx = (loadingFrameIdx + 1) % loadingFrames.length;
      showLoadingFrame();
    }, 90);
  }

  function stopLoadingAnim() {
    if (!loadingTimer) return;
    clearInterval(loadingTimer);
    loadingTimer = null;
  }

  function stopRevealSound() {
    if (!revealAudioHandle?.source) {
      revealAudioHandle = null;
      return;
    }

    const {
      source,
      gainNode,
    } = revealAudioHandle;
    revealAudioHandle = null;

    try {
      const ctx = audio.getAudioContext();
      const now = ctx.currentTime;
      const currentGain = Math.max(0.001, gainNode?.gain?.value ?? audio.getMenuSoundVolumeGain());

      if (gainNode) {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentGain, now);
        gainNode.gain.linearRampToValueAtTime(0.001, now + 0.09);
      }

      setTimeout(() => {
        try {
          source.stop();
        } catch { }
      }, 95);
    } catch {
      try {
        source.stop();
      } catch { }
    }
  }

  async function startRevealSound() {
    const revealSoundUrl = audio.getUiSoundUrl('startupReveal');
    if (!revealSoundUrl) return;

    stopRevealSound();

    try {
      const buffer = await audio.loadAudioBuffer(revealSoundUrl);
      revealAudioHandle = audio.playAudioBuffer(buffer, {
        volume: audio.getMenuSoundVolumeGain(),
      });
    } catch {
      revealAudioHandle = null;
    }
  }

  async function prewarmAssets() {
    const imageUrls = loadingFrames.filter(Boolean);
    const revealSoundUrl = audio.getUiSoundUrl('startupReveal');

    await Promise.allSettled([
      ...imageUrls.map((url) => images.load(url).catch(() => null)),
      ...(revealSoundUrl ? [audio.loadAudioBuffer(revealSoundUrl).catch(() => null)] : []),
    ]);
  }

  function scheduleBackgroundAssetWarmup() {
    const deferredAudioUrls = WARMUP_SOUND_KEYS
      .map((key) => audio.getUiSoundUrl(key))
      .filter((url, index, values) => Boolean(url) && values.indexOf(url) === index);

    setTimeout(() => {
      deferredAudioUrls.forEach((url, index) => {
        setTimeout(() => {
          audio.loadAudioBuffer(url).catch(() => null);
        }, index * 40);
      });
    }, 0);
  }

  function drawIntroFrame(ctx, jiggyPath, viewportWidth, viewportHeight, progress) {
    const initialScale = 0.12;
    const finalScale = (Math.hypot(viewportWidth, viewportHeight) * 1.8) / constants.STARTUP_JIGGY_SIZE;
    const scale = initialScale + ((finalScale - initialScale) * progress);
    const rotationDeg = -18 + ((250 - (-18)) * progress);

    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    if (!jiggyPath) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.translate(
      (viewportWidth / 2) + constants.STARTUP_JIGGY_CENTER_OFFSET_X,
      (viewportHeight / 2) + constants.STARTUP_JIGGY_CENTER_OFFSET_Y,
    );
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-(constants.STARTUP_JIGGY_SIZE / 2), -(constants.STARTUP_JIGGY_SIZE / 2));
    ctx.fillStyle = '#ffffff';
    ctx.fill(jiggyPath);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  async function playIntroAnimation(canvas = refs.startupIntroCanvas, {
    reverse = false,
  } = {}) {
    if (!canvas) {
      await sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      await sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    let jiggyPath = null;
    try {
      jiggyPath = new Path2D(constants.STARTUP_JIGGY_PATH_DATA);
    } catch {
      await sleep(constants.STARTUP_INTRO_MS);
      return;
    }

    await new Promise((resolve) => {
      let startTimestamp = null;

      const tick = (timestamp) => {
        if (startTimestamp === null) startTimestamp = timestamp;

        const elapsed = timestamp - startTimestamp;
        const progress = Math.max(0, Math.min(1, elapsed / constants.STARTUP_INTRO_MS));
        const viewport = resizeIntroCanvas(canvas, ctx);

        drawIntroFrame(ctx, jiggyPath, viewport.width, viewport.height, reverse ? 1 - progress : progress);

        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }

        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  function logWarning(message, error) {
    console.warn(`[Dialoggo] ${message.toLowerCase()}`, error);
    log?.warn(message, {
      name: error?.name,
      message: error?.message,
    });
  }

  async function run() {
    if (!refs.startupOverlay) return;

    startLoadingAnim();

    try {
      await nextPaint();
      await prewarmAssets();
    } catch (error) {
      logWarning('Startup prewarm failed', error);
    } finally {
      stopLoadingAnim();
      document.body.classList.remove('startup-loading');
      document.body.classList.add('startup-intro-running');

      try {
        await startRevealSound();
        await Promise.race([
          playIntroAnimation(),
          sleep(constants.STARTUP_INTRO_MS + 180),
        ]);
      } catch (error) {
        logWarning('Startup intro failed', error);
      } finally {
        stopRevealSound();
      }

      await sleep(120);

      document.body.classList.remove('startup-active', 'startup-intro-running');
      document.body.classList.add('startup-complete');

      setTimeout(() => {
        refs.startupOverlay.remove();
      }, 320);

      scheduleBackgroundAssetWarmup();
    }
  }

  async function playShutdownSound() {
    const shutdownSoundUrl = audio.getUiSoundUrl('shutdown');
    if (!shutdownSoundUrl) return;

    try {
      const buffer = await audio.loadAudioBuffer(shutdownSoundUrl);
      audio.playAudioBuffer(buffer, {
        volume: audio.getMenuSoundVolumeGain(),
      });
    } catch { }
  }

  function runShutdown() {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      if (document.body.classList.contains('startup-active')) return;

      const overlay = document.createElement('div');
      overlay.className = 'shutdown-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const canvas = document.createElement('canvas');
      canvas.className = 'startup-intro-canvas';
      overlay.appendChild(canvas);
      document.body.appendChild(overlay);
      document.body.classList.add('shutdown-running');

      try {
        await playShutdownSound();
        await Promise.race([
          playIntroAnimation(canvas, {
            reverse: true,
          }),
          sleep(constants.STARTUP_INTRO_MS + 180),
        ]);
        await sleep(120);
      } catch (error) {
        console.warn('[Dialoggo] shutdown outro failed', error);
      }
    })();

    return shutdownPromise;
  }

  return {
    run,
    runShutdown,
  };
}

module.exports = {
  createStartupSequence,
};
