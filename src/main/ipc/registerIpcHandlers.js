const {
  registerAppHandlers,
} = require('./handlers/appHandlers');
const {
  registerLogHandlers,
} = require('./handlers/logHandlers');
const {
  registerWindowHandlers,
} = require('./handlers/windowHandlers');

function registerIpcHandlers(dependencies) {
  registerAppHandlers(dependencies);
  registerLogHandlers(dependencies);
  registerWindowHandlers(dependencies);
}

module.exports = {
  registerIpcHandlers,
};
