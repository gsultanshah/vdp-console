export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    if (response.status === 504 || response.status === 502 || response.status === 408) {
      throw new Error(
        'Server timed out. OCR can take several minutes per page — try again or process fewer pages.'
      );
    }
    throw new Error(`Empty response from server (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `Invalid server response (HTTP ${response.status})${preview ? `: ${preview}` : ''}`
    );
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ response: Response; data: T }> {
  const response = await fetch(input, init);
  const data = await parseJsonResponse<T>(response);
  return { response, data };
}
