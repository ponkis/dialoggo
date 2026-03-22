const {
  startApp
} = require('./controllers/AppController');
const {
  getDialoggoBridge,
} = require('./runtime/getBridge');

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error || 'Unknown startup error'));
}

function renderFatalStartupError(rawError) {
  const error = normalizeError(rawError);
  console.error('[Dialoggo] fatal startup error', error);
  try {
    getDialoggoBridge().log.error('Renderer fatal startup error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  } catch { }

  if (typeof document === 'undefined') return;

  const overlay = document.getElementById('startup-overlay') || document.body;
  if (!overlay || document.getElementById('startup-fatal-error')) return;

  document.body.classList.remove('startup-loading', 'startup-intro-running');
  document.body.classList.add('startup-active');

  const panel = document.createElement('div');
  panel.id = 'startup-fatal-error';
  panel.style.position = 'absolute';
  panel.style.inset = '24px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.justifyContent = 'center';
  panel.style.gap = '12px';
  panel.style.padding = '24px';
  panel.style.background = 'rgba(20, 8, 8, 0.94)';
  panel.style.color = '#f4e7d0';
  panel.style.fontFamily = 'monospace';
  panel.style.whiteSpace = 'pre-wrap';
  panel.style.zIndex = '10000';
  panel.style.border = '1px solid rgba(255,255,255,0.18)';
  panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45)';

  const title = document.createElement('strong');
  title.textContent = 'Dialoggo failed to start';
  title.style.fontSize = '16px';

  const body = document.createElement('div');
  body.textContent = `${error.name}: ${error.message}`;

  panel.appendChild(title);
  panel.appendChild(body);
  overlay.appendChild(panel);
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    renderFatalStartupError(event.error || new Error(event.message));
  });

  window.addEventListener('unhandledrejection', (event) => {
    renderFatalStartupError(event.reason);
  });
}

function boot() {
  startApp();
}

module.exports = {
  startApp: boot
};

try {
  boot();
} catch (error) {
  renderFatalStartupError(error);
}