function createDialogueCharacterElement(character, index) {
  const characterSpan = document.createElement('span');
  characterSpan.className = 'dialogue-char';
  characterSpan.textContent = character.value;

  if (character.emphasis && /\S/.test(character.value)) {
    characterSpan.classList.add('dialogue-char-emphasis', 'dialogue-char-shake');
    characterSpan.style.setProperty('--dialogue-char-shake-duration', `${270 + ((index % 5) * 22)}ms`);
    characterSpan.style.setProperty('--dialogue-char-shake-delay', `${-180 - ((index % 7) * 85)}ms`);
    characterSpan.style.setProperty('--dialogue-char-shake-rotate', `${((index % 3) - 1) * 5}deg`);
  }

  if (character.italic && /\S/.test(character.value)) {
    characterSpan.classList.add('dialogue-char-italic');
  }

  if (character.strikethrough && /\S/.test(character.value)) {
    characterSpan.classList.add('dialogue-char-strikethrough');
  }

  return characterSpan;
}

/**
 * The animated dialogue box over the preview: its open/close animation
 * states, mirrored and N64 modes, and the typed-out lines of text.
 */
function createDialogueBoxView({
  refs,
  state,
  n64Text,
}) {
  function getExtraClasses() {
    return `${state.dialogueMirrored ? ' mirrored' : ''}${state.n64ModeEnabled ? ' n64-mode' : ''}`;
  }

  function syncDisplayModes() {
    refs.dialogueBox.classList.toggle('n64-mode', state.n64ModeEnabled);
    refs.dialogueBox.classList.toggle('mirrored', state.dialogueMirrored);
  }

  function syncN64Class() {
    refs.dialogueBox?.classList.toggle('n64-mode', state.n64ModeEnabled);
    if (!state.n64ModeEnabled) n64Text.stopShakeLoop();
  }

  function isOpen() {
    return refs.dialogueContainer?.classList.contains('active') === true;
  }

  /** Updates the footer status dot: 'playing', 'paused', or 'idle'. */
  function setStatus(status) {
    refs.statusDot.classList.toggle('playing', status === 'playing');
    refs.statusDot.classList.toggle('paused', status === 'paused');
  }

  function clearPausedStatus() {
    refs.statusDot.classList.remove('paused');
  }

  function open() {
    refs.dialogueContainer.classList.add('active');
  }

  function resetForPlayback() {
    refs.dialogueText.innerHTML = '';
    n64Text.clear();
    refs.dialogueBox.className = `dialogue-box${getExtraClasses()}`;
    syncDisplayModes();
  }

  function slideIn() {
    void refs.dialogueBox.offsetWidth;
    refs.dialogueBox.classList.add('slide-in');
  }

  function expand() {
    refs.dialogueBox.classList.remove('slide-in');
    refs.dialogueBox.classList.add('expand');
    syncDisplayModes();
  }

  function createScrollWrapper({
    centered,
  }) {
    refs.dialogueText.classList.toggle('centered', centered);

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'dialogue-scroll';
    refs.dialogueText.appendChild(scrollWrapper);
    return scrollWrapper;
  }

  function scrollLinesUp(scrollWrapper, scrollY) {
    scrollWrapper.style.transform = `translateY(-${scrollY}px)`;
  }

  function appendLine(scrollWrapper) {
    const lineElement = document.createElement('span');
    lineElement.className = 'line';
    lineElement.textContent = '';
    scrollWrapper.appendChild(lineElement);
    return lineElement;
  }

  function appendCharacter(lineElement, character, index) {
    if (!lineElement) return;
    lineElement.appendChild(createDialogueCharacterElement(character, index));
    n64Text.syncShakeLoop();
  }

  function shrink() {
    refs.dialogueText.innerHTML = '';
    refs.dialogueText.classList.remove('centered');
    n64Text.clear();
    refs.dialogueBox.className = `dialogue-box shrink${getExtraClasses()}`;
  }

  function slideOut() {
    refs.dialogueBox.classList.remove('shrink');
    refs.dialogueBox.classList.add('slide-out');
  }

  function close() {
    refs.dialogueContainer.classList.remove('active');
    refs.dialogueBox.className = `dialogue-box${getExtraClasses()}`;
    refs.dialogueText.innerHTML = '';
    n64Text.clear();
  }

  function setMirrored(mirrored) {
    refs.dialogueBox.classList.toggle('mirrored', mirrored);
    refs.dialogueBox.classList.toggle('n64-mode', state.n64ModeEnabled);
    n64Text.renderIfActive();
  }

  return {
    appendCharacter,
    appendLine,
    clearPausedStatus,
    close,
    createScrollWrapper,
    expand,
    isOpen,
    open,
    resetForPlayback,
    scrollLinesUp,
    setMirrored,
    setStatus,
    shrink,
    slideIn,
    slideOut,
    syncDisplayModes,
    syncN64Class,
  };
}

module.exports = {
  createDialogueBoxView,
  createDialogueCharacterElement,
};
