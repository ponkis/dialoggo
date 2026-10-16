const {
  APP_PROTOCOL,
} = require('../../shared/appMetadata');

/**
 * IPC is only accepted from frames served by the app's own protocol, so a
 * navigated or injected frame cannot reach privileged handlers.
 */
function isTrustedSender(event) {
  const frameUrl = event?.senderFrame?.url;
  if (typeof frameUrl !== 'string') return false;

  try {
    const url = new URL(frameUrl);
    return url.protocol === `${APP_PROTOCOL.scheme}:` && url.host === APP_PROTOCOL.host;
  } catch {
    return false;
  }
}

function createUntrustedSenderError(channel) {
  return new Error(`Rejected IPC call on ${channel} from an untrusted sender.`);
}

module.exports = {
  createUntrustedSenderError,
  isTrustedSender,
};
