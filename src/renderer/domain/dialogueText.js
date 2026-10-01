const DIALOGUE_SHAKE_MARKER = '**';
const DIALOGUE_ITALIC_MARKER = '_';
const DIALOGUE_STRIKE_MARKER = '~~';

function createDialogueCharacter(value, emphasis = false, italic = false, strikethrough = false) {
  return {
    value,
    emphasis,
    italic,
    strikethrough,
  };
}

function createLineFromCharacters(characters) {
  return {
    text: characters.map((character) => character.value).join(''),
    characters,
  };
}

function getPairedDialogueMarkerStarts(text, marker) {
  const source = String(text || '');
  const markerStarts = [];

  for (let index = 0; index < source.length; index += 1) {
    if (!source.startsWith(marker, index)) continue;
    markerStarts.push(index);
    index += marker.length - 1;
  }

  if (markerStarts.length < 2) return new Set();

  return new Set(markerStarts.slice(0, markerStarts.length - (markerStarts.length % 2)));
}

function parseDialogueMarkup(text) {
  const source = String(text || '').toUpperCase();
  const characters = [];
  let emphasis = false;
  let italic = false;
  let strikethrough = false;

  const pairedShakeStarts = getPairedDialogueMarkerStarts(source, DIALOGUE_SHAKE_MARKER);
  const pairedItalicStarts = getPairedDialogueMarkerStarts(source, DIALOGUE_ITALIC_MARKER);
  const pairedStrikeStarts = getPairedDialogueMarkerStarts(source, DIALOGUE_STRIKE_MARKER);

  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith(DIALOGUE_SHAKE_MARKER, index) && pairedShakeStarts.has(index)) {
      emphasis = !emphasis;
      index += DIALOGUE_SHAKE_MARKER.length - 1;
      continue;
    }

    if (source.startsWith(DIALOGUE_STRIKE_MARKER, index) && pairedStrikeStarts.has(index)) {
      strikethrough = !strikethrough;
      index += DIALOGUE_STRIKE_MARKER.length - 1;
      continue;
    }

    if (source.startsWith(DIALOGUE_ITALIC_MARKER, index) && pairedItalicStarts.has(index)) {
      italic = !italic;
      index += DIALOGUE_ITALIC_MARKER.length - 1;
      continue;
    }

    characters.push(createDialogueCharacter(source[index], emphasis, italic, strikethrough));
  }

  return characters;
}

function normalizeDialogueWrapOptions(optionsOrMaxUnits) {
  if (typeof optionsOrMaxUnits === 'number' && Number.isFinite(optionsOrMaxUnits)) {
    return {
      maxUnits: Math.max(1, optionsOrMaxUnits),
      measureCharacters: null,
    };
  }

  if (typeof optionsOrMaxUnits === 'object' && optionsOrMaxUnits !== null) {
    const parsedMaxUnits = Number(optionsOrMaxUnits.maxUnits);
    return {
      maxUnits: Number.isFinite(parsedMaxUnits) && parsedMaxUnits > 0 ? parsedMaxUnits : 32,
      measureCharacters: typeof optionsOrMaxUnits.measureCharacters === 'function'
        ? optionsOrMaxUnits.measureCharacters
        : null,
    };
  }

  return {
    maxUnits: 32,
    measureCharacters: null,
  };
}

function tokenizeDialogueCharacters(parsedCharacters) {
  const tokens = [];
  let currentType = null;
  let currentCharacters = [];

  function pushCurrentToken() {
    if (currentCharacters.length === 0 || !currentType) return;
    tokens.push({
      type: currentType,
      characters: currentCharacters,
    });
    currentType = null;
    currentCharacters = [];
  }

  parsedCharacters.forEach((character) => {
    if (character.value === '\n') {
      pushCurrentToken();
      tokens.push({
        type: 'newline',
        characters: [character],
      });
      return;
    }

    const nextType = /\s/.test(character.value) ? 'space' : 'word';
    if (currentType !== nextType) {
      pushCurrentToken();
      currentType = nextType;
    }

    currentCharacters.push(character);
  });

  pushCurrentToken();
  return tokens;
}

function trimDialogueLineWhitespace(characters) {
  let start = 0;
  let end = characters.length;

  while (start < end && /\s/.test(characters[start].value)) {
    start += 1;
  }

  while (end > start && /\s/.test(characters[end - 1].value)) {
    end -= 1;
  }

  return characters.slice(start, end);
}

function takeFittingDialogueSegment(characters, canFitCharacters) {
  let segmentLength = 0;

  for (let index = 0; index < characters.length; index += 1) {
    const candidate = characters.slice(0, index + 1);
    if (index === 0 || canFitCharacters(candidate)) {
      segmentLength = index + 1;
      continue;
    }
    break;
  }

  return characters.slice(0, Math.max(1, segmentLength));
}

function splitStyledTextIntoLines(text, optionsOrMaxUnits = 32) {
  const lines = [];
  const parsedCharacters = parseDialogueMarkup(text);
  const {
    maxUnits,
    measureCharacters,
  } = normalizeDialogueWrapOptions(optionsOrMaxUnits);
  const measureLine = typeof measureCharacters === 'function'
    ? measureCharacters
    : (characters) => characters.length;
  let currentLine = [];

  function canFitCharacters(characters) {
    if (!Array.isArray(characters) || characters.length === 0) return true;
    return measureLine(characters) <= maxUnits;
  }

  function pushCurrentLine(force = false) {
    const trimmedLine = trimDialogueLineWhitespace(currentLine);
    if (trimmedLine.length > 0 || force) {
      lines.push(createLineFromCharacters(trimmedLine));
    }
    currentLine = [];
  }

  function appendWordCharacters(wordCharacters) {
    let remainingCharacters = wordCharacters.slice();

    while (remainingCharacters.length > 0) {
      if (currentLine.length > 0 && canFitCharacters(currentLine.concat(remainingCharacters))) {
        currentLine.push(...remainingCharacters);
        return;
      }

      if (currentLine.length > 0) {
        pushCurrentLine();
        continue;
      }

      if (canFitCharacters(remainingCharacters)) {
        currentLine.push(...remainingCharacters);
        return;
      }

      const fittingSegment = takeFittingDialogueSegment(remainingCharacters, canFitCharacters);
      currentLine.push(...fittingSegment);
      remainingCharacters = remainingCharacters.slice(fittingSegment.length);

      if (remainingCharacters.length > 0) {
        pushCurrentLine(true);
      }
    }
  }

  tokenizeDialogueCharacters(parsedCharacters).forEach((token) => {
    if (token.type === 'newline') {
      pushCurrentLine(true);
      return;
    }

    if (token.type === 'space') {
      if (currentLine.length === 0) return;

      const candidateLine = currentLine.concat(token.characters);
      if (canFitCharacters(candidateLine)) {
        currentLine.push(...token.characters);
        return;
      }

      pushCurrentLine();
      return;
    }

    appendWordCharacters(token.characters);
  });

  if (currentLine.length > 0 || lines.length === 0 || parsedCharacters[parsedCharacters.length - 1]?.value === '\n') {
    pushCurrentLine(true);
  }

  return lines;
}

function splitTextIntoLines(text, optionsOrMaxUnits = 32) {
  return splitStyledTextIntoLines(text, optionsOrMaxUnits).map((line) => line.text);
}

module.exports = {
  getPairedDialogueMarkerStarts,
  parseDialogueMarkup,
  splitStyledTextIntoLines,
  splitTextIntoLines,
};
