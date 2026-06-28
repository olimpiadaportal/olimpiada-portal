export async function withTiming<T>(
  operation: string,
  task: () => PromiseLike<T> | T
): Promise<T> {
  const start = Date.now();

  try {
    const result = await task();
    logTiming(operation, start, 'ok');
    return result;
  } catch (error) {
    logTiming(operation, start, 'error');
    throw error;
  }
}

function logTiming(operation: string, start: number, status: 'ok' | 'error') {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;

  console.debug(`[timing] ${operation}`, {
    elapsedMs: Date.now() - start,
    status,
  });
}
