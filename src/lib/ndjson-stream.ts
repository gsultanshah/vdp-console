export function encodeNdjson(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

export function createNdjsonStream(
  run: (
    enqueue: (payload: unknown) => boolean,
    isStopped: () => boolean
  ) => Promise<void>,
  signal?: AbortSignal,
  onClose?: () => Promise<void>
): Response {
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  signal?.addEventListener('abort', stop, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const enqueue = (payload: unknown): boolean => {
        if (stopped || closed) {
          return false;
        }
        try {
          controller.enqueue(encodeNdjson(payload));
          return true;
        } catch {
          closed = true;
          stopped = true;
          return false;
        }
      };

      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // Client cancelled.
        }
      };

      try {
        await run(enqueue, () => stopped || closed);
      } catch (error) {
        console.error('NDJSON stream error:', error);
        enqueue({
          type: 'error',
          error: error instanceof Error ? error.message : 'Stream failed',
        });
      } finally {
        signal?.removeEventListener('abort', stop);
        closeStream();
        await onClose?.();
      }
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function parseNdjsonStream<T extends { type: string }>(
  response: Response,
  onEvent: (event: T) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!response.body) {
    throw new Error('Empty response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        onEvent(JSON.parse(trimmed) as T);
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      onEvent(JSON.parse(trailing) as T);
    }
  } finally {
    reader.releaseLock();
  }
}
