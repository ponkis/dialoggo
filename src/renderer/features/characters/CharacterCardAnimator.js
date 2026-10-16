/**
 * Animates the sprite thumbnails on character cards (idle blinks on hover or
 * selection, a short talk when picked). One character can appear on several
 * cards (its pack plus Favorites/Recent), so state is tracked per card key.
 */
function createCharacterCardAnimator() {
  const cardAnimState = new Map();
  const cardKeysByCharacterId = new Map();

  function resolveCardKeys(characterIdOrCardKey) {
    return cardAnimState.has(characterIdOrCardKey) ?
      [characterIdOrCardKey] :
      Array.from(cardKeysByCharacterId.get(characterIdOrCardKey) || []);
  }

  function clearTimer(cardState) {
    clearInterval(cardState.timer);
    clearTimeout(cardState.timer);
    cardState.timer = null;
  }

  function setCardFrame(cardState, frames, index) {
    const frameUrl = frames[index];
    if (!frameUrl) return;
    cardState.img.src = frameUrl;
    cardState.img.classList.remove('missing-char-icon');
  }

  function restorePreviewImage(cardKey) {
    const cardState = cardAnimState.get(cardKey);
    if (!cardState?.defaultImageUrl) return;
    cardState.img.src = cardState.defaultImageUrl;
    cardState.img.classList.toggle('missing-char-icon', cardState.usesMissingIcon === true);
  }

  function stop(characterIdOrCardKey) {
    resolveCardKeys(characterIdOrCardKey).forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;
      clearTimer(cardState);
      cardState.runId = (cardState.runId || 0) + 1;
      cardState.mode = 'stopped';
    });
  }

  function startIdle(characterIdOrCardKey) {
    resolveCardKeys(characterIdOrCardKey).forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;

      const frames = cardState.char.idleFrames;
      if (!frames?.length) return;

      clearTimer(cardState);
      cardState.runId = (cardState.runId || 0) + 1;
      const runId = cardState.runId;
      cardState.mode = 'idle';
      cardState.frameIndex = 0;
      cardState.direction = 1;
      setCardFrame(cardState, frames, cardState.frameIndex);

      const lastFrame = Math.max(0, frames.length - 1);
      const isCurrentRun = () => cardState.runId === runId && cardState.mode === 'idle';

      const schedule = () => {
        if (!isCurrentRun()) return;
        const hold = 1500 + Math.floor(Math.random() * 2200);
        cardState.timer = setTimeout(playCycle, hold);
      };

      const playCycle = () => {
        if (!isCurrentRun()) return;

        let index = 1;
        let direction = 1;
        const step = () => {
          if (!isCurrentRun()) return;

          cardState.frameIndex = index;
          setCardFrame(cardState, frames, cardState.frameIndex);
          if (index >= lastFrame) direction = -1;
          index += direction;

          if (index <= 0) {
            cardState.frameIndex = 0;
            setCardFrame(cardState, frames, 0);
            schedule();
            return;
          }

          cardState.timer = setTimeout(step, 80);
        };

        cardState.timer = setTimeout(step, 80);
      };

      schedule();
    });
  }

  function startSpeakThenIdle(characterIdOrCardKey) {
    resolveCardKeys(characterIdOrCardKey).forEach((cardKey) => {
      const cardState = cardAnimState.get(cardKey);
      if (!cardState) return;

      const speakFrames = cardState.char.speakFrames;
      if (!speakFrames?.length) {
        startIdle(cardKey);
        return;
      }

      clearTimer(cardState);
      cardState.runId = (cardState.runId || 0) + 1;
      const runId = cardState.runId;
      cardState.mode = 'speak';
      cardState.frameIndex = 0;
      cardState.direction = 1;
      setCardFrame(cardState, speakFrames, cardState.frameIndex);

      cardState.timer = setInterval(() => {
        if (cardState.runId !== runId || cardState.mode !== 'speak') return;

        cardState.frameIndex += cardState.direction;
        if (cardState.frameIndex >= speakFrames.length - 1) cardState.direction = -1;
        else if (cardState.frameIndex <= 0) {
          startIdle(cardKey);
          return;
        }

        setCardFrame(cardState, speakFrames, cardState.frameIndex);
      }, 70);
    });
  }

  function getMode(cardKey) {
    return cardAnimState.get(cardKey)?.mode ?? null;
  }

  function hasCard(cardKey) {
    return cardAnimState.has(cardKey);
  }

  function registerCard(cardKey, cardState) {
    cardAnimState.set(cardKey, {
      timer: null,
      runId: 0,
      frameIndex: 0,
      direction: 1,
      mode: 'idle',
      ...cardState,
    });
  }

  function renameCard(previousCardKey, nextCardKey) {
    const cardState = cardAnimState.get(previousCardKey);
    if (!cardState) return;
    cardAnimState.delete(previousCardKey);
    cardAnimState.set(nextCardKey, cardState);
  }

  function unregisterCard(cardKey) {
    cardAnimState.delete(cardKey);
  }

  function trackCharacterCard(characterId, cardKey) {
    if (!cardKeysByCharacterId.has(characterId)) {
      cardKeysByCharacterId.set(characterId, new Set());
    }
    cardKeysByCharacterId.get(characterId).add(cardKey);
  }

  return {
    getMode,
    hasCard,
    registerCard,
    renameCard,
    restorePreviewImage,
    startIdle,
    startSpeakThenIdle,
    stop,
    trackCharacterCard,
    unregisterCard,
  };
}

module.exports = {
  createCharacterCardAnimator,
};
