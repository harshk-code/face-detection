export function logInfo(context: string, payload: unknown) {
  console.info(formatLog(context, payload));
}

export function logWarning(context: string, payload: unknown) {
  console.warn(formatLog(context, payload));
}

export function logError(context: string, error: unknown) {
  if (error instanceof Error) {
    console.error(formatLog(context, {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }));
    return;
  }

  console.error(formatLog(context, {
    error,
    message: 'Non-error thrown',
  }));
}

function formatLog(context: string, payload: unknown) {
  return `[${context}] ${safeStringify(payload)}`;
}

function safeStringify(payload: unknown) {
  try {
    return JSON.stringify(payload, createCircularReplacer());
  } catch (error) {
    return JSON.stringify({
      message: 'Unable to stringify log payload',
      stringifiedError: String(error),
    });
  }
}

function createCircularReplacer() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    return value;
  };
}
