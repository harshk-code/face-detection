import {NativeModules, Platform} from 'react-native';

type NativeTraceModule = {
  log: (event: string, payload: string) => void;
};

const nativeTrace = NativeModules.NativeTrace as NativeTraceModule | undefined;

export function traceNative(event: string, payload: unknown = {}) {
  if (Platform.OS !== 'ios' || !nativeTrace) {
    return;
  }

  try {
    nativeTrace.log(event, JSON.stringify(payload));
  } catch {
    nativeTrace.log(event, String(payload));
  }
}
