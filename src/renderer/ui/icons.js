const SVG_NS = 'http://www.w3.org/2000/svg';

function createHeartIcon({
  filled = true,
  wrapperClassName = '',
  svgClassName = '',
} = {}) {
  const icon = document.createElement('span');
  if (wrapperClassName) icon.className = wrapperClassName;
  icon.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  if (svgClassName) svg.setAttribute('class', svgClassName);

  if (filled) {
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M178,40c-20.2,0-38.7,9.4-50,25.3C116.7,49.4,98.2,40,78,40C44.9,40,18,67,18,100.2c0,70.1,98.1,116.4,102.3,118.3a18,18,0,0,0,15.4,0c4.2-1.9,102.3-48.2,102.3-118.3C238,67,211.1,40,178,40Z');
    svg.appendChild(path);
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '18');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M178,48c-21.6,0-41.3,10.4-50,26.3C119.3,58.4,99.6,48,78,48C48.2,48,24,72.2,24,102c0,66.4,92.5,109.9,96.4,111.7a18.2,18.2,0,0,0,15.2,0C139.5,211.9,232,168.4,232,102C232,72.2,207.8,48,178,48Z');
    svg.appendChild(path);
  }

  icon.appendChild(svg);
  return icon;
}

function createFavoriteHeartIcon(wrapperClassName = 'char-btn-favorite-heart') {
  return createHeartIcon({
    filled: true,
    wrapperClassName,
  });
}

function createEyeIcon({
  open = true,
  wrapperClassName = '',
  svgClassName = '',
} = {}) {
  const icon = document.createElement('span');
  if (wrapperClassName) icon.className = wrapperClassName;
  icon.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '16');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (svgClassName) svg.setAttribute('class', svgClassName);

  const eyeShape = document.createElementNS(SVG_NS, 'path');
  eyeShape.setAttribute('d', 'M16,128c22-44,62-72,112-72s90,28,112,72c-22,44-62,72-112,72S38,172,16,128Z');
  svg.appendChild(eyeShape);

  const pupil = document.createElementNS(SVG_NS, 'circle');
  pupil.setAttribute('cx', '128');
  pupil.setAttribute('cy', '128');
  pupil.setAttribute('r', '28');
  pupil.setAttribute('fill', 'currentColor');
  pupil.setAttribute('stroke', 'none');
  svg.appendChild(pupil);

  if (!open) {
    const slash = document.createElementNS(SVG_NS, 'path');
    slash.setAttribute('d', 'M40,40L216,216');
    svg.appendChild(slash);
  }

  icon.appendChild(svg);
  return icon;
}

module.exports = {
  createEyeIcon,
  createFavoriteHeartIcon,
  createHeartIcon,
};
