/** Helpers for CLI scripts calling Next.js API routes (trailingSlash: true). */

export function apiUrl(baseUrl, path, params) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const query = params.toString();
  return query
    ? `${normalizedBase}${normalizedPath}/?${query}`
    : `${normalizedBase}${normalizedPath}/`;
}

export async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return {
      data: null,
      parseError: `Empty response (HTTP ${response.status}). Use trailing-slash API URLs.`,
    };
  }

  try {
    return { data: JSON.parse(text), parseError: null };
  } catch {
    return {
      data: null,
      parseError: `Non-JSON response (HTTP ${response.status}): ${text.slice(0, 300)}`,
    };
  }
}
