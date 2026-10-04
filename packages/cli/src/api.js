const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) =>
  typeof value === 'string' && UUID.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
export function safeUrl(value) {
  const url = new URL(value);
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('Use HTTPS (or loopback HTTP for local tests) without URL credentials');
  return url;
}
export function releaseName(version) {
  if (
    typeof version !== 'string' ||
    !version.trim() ||
    [...version].length > 255 ||
    ['.', '..'].includes(version) ||
    /[\x00-\x1f\x7f]/.test(version)
  )
    throw new Error('Invalid release version');
  return encodeURIComponent(version);
}
export class HttpError extends Error {
  constructor(status, retryAfter) {
    super(`Request failed with HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
export class ApiClient {
  constructor(options = {}) {
    const base = safeUrl(options.apiBase || 'https://api.siteqwality.com');
    if (base.search) throw new Error('API base must not contain query parameters');
    if (!isUuid(options.app)) throw new Error('A valid application UUID is required');
    if (
      typeof options.apiKey !== 'string' ||
      !options.apiKey.trim() ||
      /[\r\n]/.test(options.apiKey)
    )
      throw new Error('An API key is required');
    this.base = base.href.replace(/\/+$/, '');
    this.app = options.app;
    this.key = options.apiKey;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isInteger(this.retries) || this.retries < 0 || this.retries > 5)
      throw new Error('retries must be 0 to 5');
    if (!Number.isFinite(this.retryDelayMs) || this.retryDelayMs < 0 || this.retryDelayMs > 30_000)
      throw new Error('Invalid retry delay');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000)
      throw new Error('Invalid request timeout');
  }
  async request(url, init, json = false) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          redirect: 'manual',
          credentials: 'omit',
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
          const after = response.headers.get('retry-after');
          await response.body?.cancel();
          throw new HttpError(response.status, after);
        }
        if (!json) {
          await response.body?.cancel();
          return;
        }
        const body = await response.json();
        if (!body || !Object.hasOwn(body, 'data')) throw new Error('Invalid API response envelope');
        return body.data;
      } catch (err) {
        const transient =
          err instanceof HttpError
            ? [408, 429].includes(err.status) || err.status >= 500
            : err instanceof TypeError || err.name === 'TimeoutError';
        if (!transient || attempt >= this.retries) {
          if (err instanceof HttpError) throw err;
          throw new Error('Request failed or returned an invalid response');
        }
        let wait = this.retryDelayMs * 2 ** attempt;
        if (err.retryAfter) {
          const parsed = /^\d+$/.test(err.retryAfter)
            ? Number(err.retryAfter) * 1000
            : Date.parse(err.retryAfter) - Date.now();
          if (Number.isFinite(parsed)) wait = Math.max(wait, parsed);
        }
        if (wait > 30_000)
          throw new Error('Server requested a long retry delay; retry this command later');
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }
  api(suffix, method = 'GET', body) {
    return this.request(
      `${this.base}/rum/${this.app}${suffix}`,
      {
        method,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      true,
    );
  }
  async createRelease(version, { commit, env } = {}) {
    releaseName(version);
    for (const value of [commit, env])
      if (value !== undefined && (typeof value !== 'string' || [...value].length > 64))
        throw new Error('Release metadata is limited to 64 characters');
    return this.api('/releases', 'POST', {
      version,
      ...(commit === undefined ? {} : { commit_sha: commit }),
      ...(env === undefined ? {} : { env }),
    });
  }
  async deployRelease(version, env) {
    const name = releaseName(version);
    if (env !== undefined && (typeof env !== 'string' || [...env].length > 64))
      throw new Error('Release environment is limited to 64 characters');
    return this.api(`/releases/${name}/deploy`, 'POST', env === undefined ? {} : { env });
  }
  listReleases() {
    return this.api('/releases');
  }
  presign(version, files) {
    return this.api(`/releases/${releaseName(version)}/sourcemaps`, 'POST', { files });
  }
  confirm(ids) {
    return this.api('/sourcemaps/confirm', 'POST', { ids });
  }
  put(url, headers, body) {
    return this.request(safeUrl(url).href, { method: 'PUT', headers, body });
  }
}
