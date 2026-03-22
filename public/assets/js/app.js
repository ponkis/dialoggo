const path = require('path');
const {
    fileURLToPath
} = require('url');

const publicDir = path.dirname(fileURLToPath(window.location.href));
const rendererEntry = path.join(publicDir, '..', 'src', 'renderer', 'index.js');

require(rendererEntry).startApp();