const fs = require('fs');

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 24;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeJsonValue(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) return null;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output = {};

    Object.keys(value).forEach((key) => {
      if (BLOCKED_KEYS.has(key)) return;
      output[key] = sanitizeJsonValue(value[key], depth + 1);
    });

    return output;
  }

  return value;
}

function safeParseJson(rawText, options = {}) {
  const hasFallback = Object.prototype.hasOwnProperty.call(options, 'fallback');
  const {
    fallback = null,
    maxBytes = DEFAULT_MAX_JSON_BYTES,
    label = 'JSON payload',
  } = options;

  try {
    if (typeof rawText !== 'string') {
      throw new TypeError(`${label} must be a string.`);
    }

    if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte limit.`);
    }

    return sanitizeJsonValue(JSON.parse(rawText));
  } catch (error) {
    if (hasFallback) return fallback;
    throw error;
  }
}

function safeReadJsonFile(filePath, options = {}) {
  const fsModule = options.fsModule || fs;
  const stats = fsModule.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`JSON path is not a file: ${filePath}`);
  }

  if (stats.size > (options.maxBytes || DEFAULT_MAX_JSON_BYTES)) {
    const label = options.label || 'JSON file';
    throw new Error(`${label} exceeds the allowed size limit.`);
  }

  const rawText = fsModule.readFileSync(filePath, 'utf8');
  return safeParseJson(rawText, options);
}

module.exports = {
  DEFAULT_MAX_JSON_BYTES,
  safeParseJson,
  safeReadJsonFile,
  sanitizeJsonValue,
};