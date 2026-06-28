export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 * 
 * @example
 * const data = await retryWithBackoff(
 *   async () => await fetchData(),
 *   { maxAttempts: 3, onRetry: (attempt) => console.log(`Retry ${attempt}`) }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Call retry callback
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Check if error is retryable (network errors, timeouts, 5xx)
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.message?.includes('Network request failed')) return true;
  if (error.message?.includes('timeout')) return true;
  if (error.message?.includes('Failed to fetch')) return true;

  // HTTP 5xx errors (server errors)
  if (error.status >= 500 && error.status < 600) return true;

  // Rate limiting (429)
  if (error.status === 429) return true;

  // Supabase specific errors
  if (error.code === 'PGRST301') return true; // Connection error

  return false;
}

/**
 * Retry only if error is retryable
 * 
 * @example
 * const data = await retryIfRetryable(
 *   async () => await supabase.from('table').select(),
 *   { maxAttempts: 3 }
 * );
 */
export async function retryIfRetryable<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(fn, {
    ...options,
    onRetry: (attempt, error) => {
      if (!isRetryableError(error)) {
        throw error; // Don't retry non-retryable errors
      }
      console.log(`Retry attempt ${attempt} for retryable error:`, error.message);
      options.onRetry?.(attempt, error);
    },
  });
}
