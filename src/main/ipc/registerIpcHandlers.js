const {
  registerAppHandlers,
} = require('./handlers/appHandlers');
const {
  registerLogHandlers,
} = require('./handlers/logHandlers');
const {
  registerUpdateHandlers,
} = require('./handlers/updateHandlers');
const {
  registerWindowHandlers,
} = require('./handlers/windowHandlers');

function registerIpcHandlers(dependencies) {
  registerAppHandlers(dependencies);
  registerLogHandlers(dependencies);
  registerUpdateHandlers(dependencies);
  registerWindowHandlers(dependencies);
}

module.exports = {
  registerIpcHandlers,
};
