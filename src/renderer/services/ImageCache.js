const MAX_IMAGE_CACHE_ENTRIES = 120;

/** Decoded-image LRU so sprite frames are only decoded once per session. */
function createImageCache({
  maxEntries = MAX_IMAGE_CACHE_ENTRIES,
} = {}) {
  const cache = new Map();

  function remember(url, image) {
    if (cache.has(url)) {
      cache.delete(url);
    }

    cache.set(url, image);

    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  function load(url) {
    return new Promise((resolve, reject) => {
      if (cache.has(url)) {
        const cachedImage = cache.get(url);
        remember(url, cachedImage);
        resolve(cachedImage);
        return;
      }

      const image = new Image();
      image.onload = () => {
        remember(url, image);
        resolve(image);
      };
      image.onerror = reject;
      image.src = url;
    });
  }

  return {
    load,
  };
}

module.exports = {
  createImageCache,
};
