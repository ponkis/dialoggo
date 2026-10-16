const Viewer = require('viewerjs');

/** Makes the guide screenshots open in a zoomable ViewerJS lightbox. */
function initializeGuideImageViewer(guidePanel) {
  if (!guidePanel) return null;

  const guideImages = Array.from(guidePanel.querySelectorAll('img.guide-shot'));
  if (guideImages.length === 0) return null;

  let viewer = null;

  guideImages.forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.title = 'Open screenshot';
    image.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();

      const viewIndex = guideImages.indexOf(image);
      if (viewIndex >= 0) viewer?.view(viewIndex);
    });
  });

  viewer = new Viewer(guidePanel, {
    button: true,
    className: 'guide-image-viewer',
    filter(image) {
      return image.classList.contains('guide-shot');
    },
    fullscreen: false,
    navbar: true,
    rotatable: false,
    scalable: false,
    title: [1, (image) => image.alt || 'Guide screenshot'],
    toolbar: {
      zoomIn: 1,
      zoomOut: 1,
      oneToOne: 1,
      reset: 1,
      prev: 1,
      next: 1,
    },
    transition: true,
    zIndex: 12000,
  });

  return viewer;
}

module.exports = {
  initializeGuideImageViewer,
};
