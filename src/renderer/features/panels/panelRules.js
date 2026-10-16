const PANELS = Object.freeze({
  controls: 'controls',
  backgrounds: 'backgrounds',
  guide: 'guide',
  settings: 'settings',
});

/** Tall panels collapse the preview into a strip and disable playback shortcuts. */
function isTallPanel(panel) {
  return panel === PANELS.settings || panel === PANELS.guide;
}

module.exports = {
  PANELS,
  isTallPanel,
};
