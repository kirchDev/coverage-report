/**
 * The GitHub client, which is `fetch` plus the four things every call needs:
 * auth, the API version header, an error that says which call failed, and a
 * retry for the transient statuses a busy runner meets.
 *
 * No SDK. The Action touches six endpoints, and Node 24 ships `fetch` — pulling
 * in a client library would add more code to the bundle than it removes, and
 * every byte in `dist/` is code a consumer runs on their runner with a token.
 */
/** Just enough of `fetch` to be stubbed in a test without pulling in a server. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
  }
) => Promise<FetchResponse>;

export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

export interface ClientOptions {
  token: string | undefined;
  baseUrl?: string;
  fetchImpl?: FetchLike | undefined;
  retries?: number;
  wait?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  body?: unknown;
  /** Return null instead of throwing — a missing base state is not an error. */
  allow404?: boolean;
}

export interface GitHubClient {
  get: (path: string, options?: RequestOptions) => Promise<any>;
  post: (path: string, body?: unknown) => Promise<any>;
  patch: (path: string, body?: unknown) => Promise<any>;
  put: (path: string, body?: unknown) => Promise<any>;
}

export class GitHubError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(
    response: FetchResponse,
    body: unknown,
    method: string,
    url: string
  ) {
    const message =
      (body as { message?: string } | null)?.message ?? response.statusText;
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
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
}: ClientOptions): GitHubClient {
  if (!token) throw new Error('A GitHub token is required.');

  async function request(
    method: string,
    path: string,
    { body, allow404 = false }: RequestOptions = {}
  ): Promise<any> {
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

async function readBody(response: FetchResponse): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
