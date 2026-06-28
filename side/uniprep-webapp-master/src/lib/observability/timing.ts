export async function withTiming<T>(
  operation: string,
  task: () => PromiseLike<T> | T
): Promise<T> {
  const start = performance.now()

  try {
    const result = await task()
    logTiming(operation, start, 'ok')
    return result
  } catch (error) {
    logTiming(operation, start, 'error')
    throw error
  }
}

function logTiming(operation: string, start: number, status: 'ok' | 'error') {
  if (process.env.NODE_ENV === 'production') return

  const elapsedMs = Math.round(performance.now() - start)
  console.debug(`[timing] ${operation}`, { elapsedMs, status })
}
