import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Fork: "Save to Instapaper", through Instapaper's Simple API
 * (https://www.instapaper.com/api/simple): one authenticated POST, no OAuth
 * application keys. The account is the instance's, set by the operator:
 *
 *   INSTAPAPER_USERNAME=me@example.com
 *   INSTAPAPER_PASSWORD=…          (may be empty for an account without one)
 *
 * The credentials never leave the server. Without INSTAPAPER_USERNAME the
 * feature is off and the app hides its button.
 */

const ADD_URL = 'https://www.instapaper.com/api/add';
const TIMEOUT_MS = 10_000;

function credentials(): { username: string; password: string } | null {
  const username = process.env.INSTAPAPER_USERNAME?.trim();
  if (!username) return null;
  return { username, password: process.env.INSTAPAPER_PASSWORD ?? '' };
}

/** Only web pages: Instapaper would refuse anything else, and nothing else is ours to send. */
function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const router = Router();

router.get('/status', requireAuth, (_req, res) => {
  res.json({ enabled: credentials() !== null });
});

router.post('/add', requireAuth, async (req, res) => {
  const creds = credentials();
  if (!creds) return res.status(404).json({ error: 'not_configured' });
  const url = httpUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: 'invalid_url' });
  const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 500) : '';

  const form = new URLSearchParams({ url });
  if (title) form.set('title', title);
  try {
    const upstream = await fetch(ADD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 201 created; 400 bad request; 403 invalid username or password; 500 Instapaper error.
    if (upstream.status === 201 || upstream.status === 200) return res.json({ ok: true });
    if (upstream.status === 403) return res.status(502).json({ error: 'bad_credentials' });
    return res.status(502).json({ error: 'upstream', status: upstream.status });
  } catch {
    return res.status(504).json({ error: 'unreachable' });
  }
});

export default router;
