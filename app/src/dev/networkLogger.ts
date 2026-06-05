import {logError, logInfo} from '../utils/logError';

declare global {
  // eslint-disable-next-line no-var
  var __FACE_AUTH_NETWORK_LOGGER_STARTED__: boolean | undefined;
}

export function startDevNetworkLogger() {
  if (!__DEV__ || global.__FACE_AUTH_NETWORK_LOGGER_STARTED__) {
    return;
  }

  try {
    const {startNetworkLogging} = require('react-native-network-logger') as {
      startNetworkLogging: (options?: {
        ignoredHosts?: string[];
        ignoredPatterns?: RegExp[];
        maxRequests?: number;
      }) => void;
    };

    const ignoredHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '10.0.2.2',
    ];

    startNetworkLogging({
      ignoredHosts,
      ignoredPatterns: [
        /\shttps?:\/\/localhost(?::\d+)?(?:\/|$)/i,
        /\shttps?:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/i,
        /\shttps?:\/\/0\.0\.0\.0(?::\d+)?(?:\/|$)/i,
        /\shttps?:\/\/10\.0\.2\.2(?::\d+)?(?:\/|$)/i,
        /\shttps?:\/\/192\.168\.\d+\.\d+(?::8081)(?:\/|$)/i,
      ],
      maxRequests: 500,
    });
    global.__FACE_AUTH_NETWORK_LOGGER_STARTED__ = true;
    logInfo('network-logger:start', {
      ignoredHosts,
      maxRequests: 500,
    });
  } catch (error) {
    logError('network-logger:start-error', error);
  }
}
