import crypto from 'crypto';

/**
 * Fork: Instapaper's Full API (https://www.instapaper.com/api), OAuth 1.0a
 * with HMAC-SHA1. The password is used once, by `scripts/instapaper-token.js`
 * (xAuth), to obtain an access token; the server then keeps only the token.
 */

export const API_BASE = 'https://www.instapaper.com/api/1';

export interface OAuthKeys {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
}

/** RFC 3986 percent-encoding, as OAuth 1.0a requires (`encodeURIComponent` leaves !'()* alone). */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `Authorization` header for a form-encoded POST of `params` to `url`. */
export function authorizationHeader(
  url: string,
  params: Record<string, string>,
  keys: OAuthKeys,
  nonce = crypto.randomBytes(16).toString('hex'),
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  };
  if (keys.token) oauth.oauth_token = keys.token;
  const all = { ...params, ...oauth };
  const normalized = Object.keys(all)
    .map((k) => [percentEncode(k), percentEncode(all[k])] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = ['POST', percentEncode(url), percentEncode(normalized)].join('&');
  const signingKey = `${percentEncode(keys.consumerSecret)}&${percentEncode(keys.tokenSecret ?? '')}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`).join(', ');
}

export function formBody(params: Record<string, string>): string {
  return Object.keys(params).map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
}

export async function signedPost(path: string, params: Record<string, string>, keys: OAuthKeys, timeoutMs = 10_000): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(url, params, keys),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody(params),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** xAuth: trade the account's login for an access token, once. */
export async function fetchAccessToken(
  keys: Pick<OAuthKeys, 'consumerKey' | 'consumerSecret'>,
  username: string,
  password: string,
): Promise<{ token: string; tokenSecret: string }> {
  const res = await signedPost('/oauth/access_token', {
    x_auth_mode: 'client_auth', x_auth_username: username, x_auth_password: password,
  }, keys);
  const text = await res.text();
  if (!res.ok) throw new Error(`Instapaper refused the login (HTTP ${res.status})`);
  const qs = new URLSearchParams(text);
  const token = qs.get('oauth_token');
  const tokenSecret = qs.get('oauth_token_secret');
  if (!token || !tokenSecret) throw new Error('Instapaper returned no token');
  return { token, tokenSecret };
}
