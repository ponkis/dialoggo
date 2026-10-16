const {
  getDialogueLetterSpacing,
} = require('./dialogueMetrics');

const DIALOGUE_SHAKE_CYCLE_MS = 280;
const DIALOGUE_SHAKE_SAMPLES = [
  { x: 0, y: 0 },
  { x: -3.1, y: -2.3 },
  { x: 3.8, y: 1.8 },
  { x: -2.4, y: 3.4 },
  { x: 3.1, y: -2.8 },
  { x: -3.6, y: 1.5 },
  { x: 2.1, y: 3.7 },
  { x: 3.3, y: -3.2 },
  { x: -2.5, y: -1.5 },
];

function getDialogueShakeSample(elapsed, index, scale = 1) {
  const sampleDuration = DIALOGUE_SHAKE_CYCLE_MS / DIALOGUE_SHAKE_SAMPLES.length;
  const sampleIndex = Math.floor((elapsed + (index * sampleDuration)) / sampleDuration) % DIALOGUE_SHAKE_SAMPLES.length;
  const sample = DIALOGUE_SHAKE_SAMPLES[sampleIndex < 0 ? sampleIndex + DIALOGUE_SHAKE_SAMPLES.length : sampleIndex];
  return {
    x: sample.x * scale,
    y: sample.y * scale,
  };
}

function parseTranslateYpx(transformValue) {
  if (!transformValue || transformValue === 'none') return 0;
  const match = transformValue.match(/translateY\((-?[0-9.]+)px\)/);
  return match ? parseFloat(match[1], 10) : 0;
}

function getScrollWrapperTranslateYpx(scrollWrapper) {
  if (!scrollWrapper) return 0;

  const transformValue = getComputedStyle(scrollWrapper).transform;
  if (!transformValue || transformValue === 'none') {
    return parseTranslateYpx(scrollWrapper.style.transform);
  }

  const matrixMatch = transformValue.match(/^matrix\(([^)]+)\)$/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(',').map((value) => parseFloat(value.trim()));
    if (values.length >= 6 && Number.isFinite(values[5])) return values[5];
  }

  const matrix3dMatch = transformValue.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((value) => parseFloat(value.trim()));
    if (values.length >= 16 && Number.isFinite(values[13])) return values[13];
  }

  return parseTranslateYpx(scrollWrapper.style.transform);
}

/**
 * N64 display mode: re-draws the dialogue DOM text onto a canvas, downsamples
 * it into chunky pixels, and keeps shaking (**emphasis**) characters animated.
 */
function createN64TextRenderer({
  refs,
  state,
  constants,
  log = null,
}) {
  let hiCanvas = null;
  let smallCanvas = null;
  let resizeRaf = 0;
  let shakeAnimationRaf = 0;

  function getHiCanvas(width, height) {
    if (!hiCanvas || hiCanvas.width !== width || hiCanvas.height !== height) {
      hiCanvas = document.createElement('canvas');
      hiCanvas.width = width;
      hiCanvas.height = height;
    }
    return hiCanvas;
  }

  function getSmallCanvas(width, height) {
    if (!smallCanvas || smallCanvas.width !== width || smallCanvas.height !== height) {
      smallCanvas = document.createElement('canvas');
      smallCanvas.width = width;
      smallCanvas.height = height;
    }
    return smallCanvas;
  }

  function stopShakeLoop() {
    if (!shakeAnimationRaf) return;
    cancelAnimationFrame(shakeAnimationRaf);
    shakeAnimationRaf = 0;
  }

  function syncShakeLoop() {
    const needsLoop = state.n64ModeEnabled && !!refs.dialogueText?.querySelector('.dialogue-char-shake');
    if (!needsLoop) {
      stopShakeLoop();
      return;
    }

    if (shakeAnimationRaf) return;

    const tick = () => {
      shakeAnimationRaf = requestAnimationFrame(tick);
      render();
    };

    shakeAnimationRaf = requestAnimationFrame(tick);
  }

  function clear() {
    stopShakeLoop();
    const canvas = refs.dialogueTextN64Canvas;
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width > 0 && canvas.height > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render() {
    try {
      const canvas = refs.dialogueTextN64Canvas;
      const area = refs.dialogueTextArea;
      if (!state.n64ModeEnabled || !canvas || !area || !refs.dialogueText) {
        stopShakeLoop();
        return;
      }

      const scrollWrapper = refs.dialogueText.querySelector('.dialogue-scroll');
      if (!scrollWrapper) {
        clear();
        return;
      }

      const rect = area.getBoundingClientRect();
      let width = Math.round(rect.width);
      let height = Math.round(rect.height);

      if (width < 12) {
        width = Math.max(48, Math.floor(area.clientWidth), Math.floor(refs.dialogueText.offsetWidth || 0));
      }

      if (height < 12) {
        height = Math.max(33, Math.floor(area.clientHeight), Math.floor(refs.dialogueText.offsetHeight || 0));
      }

      width = Math.min(2048, Math.max(48, width));
      height = Math.min(512, Math.max(33, height));

      const hiResCanvas = getHiCanvas(width, height);
      const hiCtx = hiResCanvas.getContext('2d');
      if (!hiCtx) return;

      const areaStyle = window.getComputedStyle(area);
      const padTop = Number.parseFloat(areaStyle.paddingTop) || 6;
      const padRight = Number.parseFloat(areaStyle.paddingRight) || 0;
      const padLeft = Number.parseFloat(areaStyle.paddingLeft) || 0;
      const textStyle = window.getComputedStyle(refs.dialogueText);
      const font = textStyle.font || constants.N64_TEXT_FONT;
      const letterSpacing = getDialogueLetterSpacing(refs.dialogueText, textStyle);
      const clipWidth = Math.max(1, width - padLeft - padRight);

      hiCtx.clearRect(0, 0, width, height);
      hiCtx.save();
      hiCtx.beginPath();
      hiCtx.rect(padLeft, padTop, clipWidth, 2 * constants.N64_TEXT_LINE_HEIGHT);
      hiCtx.clip();
      hiCtx.font = font;

      if ('letterSpacing' in hiCtx) {
        try {
          hiCtx.letterSpacing = `${letterSpacing}px`;
        } catch { }
      }

      hiCtx.textBaseline = 'top';
      hiCtx.fillStyle = '#ffffff';
      hiCtx.shadowColor = 'transparent';
      hiCtx.shadowOffsetX = 0;
      hiCtx.shadowOffsetY = 0;
      hiCtx.shadowBlur = 0;

      const lineElements = scrollWrapper.querySelectorAll('.line');
      const scrollY = getScrollWrapperTranslateYpx(scrollWrapper);
      const centered = refs.dialogueText.classList.contains('centered');
      const elapsed = performance.now();

      for (let i = 0; i < lineElements.length; i += 1) {
        const lineElement = lineElements[i];
        let y = padTop + (i * constants.N64_TEXT_LINE_HEIGHT) + scrollY;
        if (centered && lineElements.length === 1) {
          y = (height - constants.N64_TEXT_LINE_HEIGHT) / 2;
        }

        const characterElements = Array.from(lineElement.querySelectorAll('.dialogue-char'));
        if (characterElements.length === 0) {
          hiCtx.textAlign = 'left';
          hiCtx.fillStyle = '#ffffff';
          hiCtx.fillText(lineElement.textContent || '', padLeft, y);
          continue;
        }

        let x = padLeft;
        characterElements.forEach((characterElement, index) => {
          const characterText = characterElement.textContent || '';
          const emphasized = characterElement.classList.contains('dialogue-char-emphasis');
          const italic = characterElement.classList.contains('dialogue-char-italic');
          const strikethrough = characterElement.classList.contains('dialogue-char-strikethrough');
          const shakeSample = emphasized ? getDialogueShakeSample(elapsed, index, 1) : null;
          const shakeX = shakeSample ? shakeSample.x : 0;
          const shakeY = shakeSample ? shakeSample.y : 0;

          hiCtx.font = italic ? `italic ${font}` : font;
          hiCtx.fillStyle = '#ffffff';
          hiCtx.fillText(characterText, x + shakeX, y + shakeY);

          const textWidth = hiCtx.measureText(characterText).width;

          if (strikethrough) {
            const lineY = y + shakeY + 16;
            hiCtx.fillRect(x + shakeX, lineY, textWidth, 3);
          }

          x += textWidth + letterSpacing;
        });
      }

      hiCtx.restore();

      const sampleWidth = Math.max(1, Math.floor(width / constants.N64_TEXT_PIXEL_BLOCK));
      const sampleHeight = Math.max(1, Math.floor(height / constants.N64_TEXT_PIXEL_BLOCK));
      const lowResCanvas = getSmallCanvas(sampleWidth, sampleHeight);
      const smallCtx = lowResCanvas.getContext('2d');
      if (!smallCtx) return;

      smallCtx.imageSmoothingEnabled = false;
      smallCtx.clearRect(0, 0, sampleWidth, sampleHeight);
      smallCtx.drawImage(hiResCanvas, 0, 0, sampleWidth, sampleHeight);

      canvas.width = width;
      canvas.height = height;

      const outputCtx = canvas.getContext('2d');
      if (!outputCtx) return;

      outputCtx.imageSmoothingEnabled = false;
      outputCtx.clearRect(0, 0, width, height);
      outputCtx.drawImage(lowResCanvas, 0, 0, width, height);
      syncShakeLoop();
    } catch (error) {
      console.warn('[Dialoggo] N64 dialogue text canvas:', error);
      log?.warn('N64 dialogue text canvas warning', {
        name: error?.name,
        message: error?.message,
      });
    }
  }

  async function repaintDuringScrollTransition(durationMs = 350) {
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      render();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    render();
  }

  function scheduleResize() {
    if (!state.n64ModeEnabled || !refs.dialogueText?.querySelector('.dialogue-scroll')) return;
    if (resizeRaf) cancelAnimationFrame(resizeRaf);

    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      render();
    });
  }

  function observeResize() {
    if (typeof ResizeObserver === 'undefined' || !refs.dialogueTextArea) return;
    new ResizeObserver(() => {
      scheduleResize();
    }).observe(refs.dialogueTextArea);
  }

  /** Repaints when N64 mode is on and dialogue text is showing. */
  function renderIfActive() {
    if (state.n64ModeEnabled && refs.dialogueText?.querySelector('.dialogue-scroll')) {
      render();
    }
  }

  return {
    clear,
    observeResize,
    render,
    renderIfActive,
    repaintDuringScrollTransition,
    stopShakeLoop,
    syncShakeLoop,
  };
}

module.exports = {
  createN64TextRenderer,
  getDialogueShakeSample,
  getScrollWrapperTranslateYpx,
};
