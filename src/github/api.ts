/**
 * The GitHub client, which is `fetch` plus the four things every call needs:
 * auth, the API version header, an error that says which call failed, and a
 * retry for the transient statuses a busy runner meets.
 *
 * No SDK. The Action touches six endpoints, and Node 24 ships `fetch` — pulling
 * in a client library would add more code to the bundle than it removes, and
 * every byte in `dist/` is code a consumer runs on their runner with a token.
 */
export class GitHubError extends Error {
  constructor(response, body, method, url) {
    const message = body?.message ?? response.statusText;
    super(`${method} ${url} failed with ${response.status}: ${message}`);
    this.name = 'GitHubError';
    this.status = response.status;
    this.body = body;
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function createClient({
  token,
  baseUrl = process.env.GITHUB_API_URL || 'https://api.github.com',
  fetchImpl = undefined,
  retries = 2,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  if (!token) throw new Error('A GitHub token is required.');

  async function request(method, path, { body, allow404 = false } = {}) {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    for (let attempt = 0; ; attempt += 1) {
      const response = await (fetchImpl ?? globalThis.fetch)(url, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'kirchDev/coverage-report'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      if (response.status === 404 && allow404) return null;

      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < retries) {
          await wait(2 ** attempt * 1000);
          continue;
        }
        throw new GitHubError(response, await readBody(response), method, url);
      }

      if (response.status === 204) return null;
      return readBody(response);
    }
  }

  return {
    get: (path, options) => request('GET', path, options),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    put: (path, body) => request('PUT', path, { body })
  };
}

async function readBody(response) {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
