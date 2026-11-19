import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { signedPost, type OAuthKeys } from '../instapaperOAuth.js';

/**
 * Fork: "Save to Instapaper", through Instapaper's Full API (OAuth 1.0a).
 * The operator sets the application keys and an access token — no password:
 *
 *   INSTAPAPER_CONSUMER_KEY / INSTAPAPER_CONSUMER_SECRET   (the API application)
 *   INSTAPAPER_TOKEN / INSTAPAPER_TOKEN_SECRET             (scripts/instapaper-token.js)
 *
 * The keys never leave the server. Without all four the feature is off and
 * the app hides its button.
 */

function keys(): Required<OAuthKeys> | null {
  const e = process.env;
  const k = {
    consumerKey: e.INSTAPAPER_CONSUMER_KEY?.trim() ?? '',
    consumerSecret: e.INSTAPAPER_CONSUMER_SECRET?.trim() ?? '',
    token: e.INSTAPAPER_TOKEN?.trim() ?? '',
    tokenSecret: e.INSTAPAPER_TOKEN_SECRET?.trim() ?? '',
  };
  return Object.values(k).every(Boolean) ? k : null;
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
  res.json({ enabled: keys() !== null });
});

router.post('/add', requireAuth, async (req, res) => {
  const k = keys();
  if (!k) return res.status(404).json({ error: 'not_configured' });
  const url = httpUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: 'invalid_url' });
  const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 500) : '';

  const params: Record<string, string> = { url };
  if (title) params.title = title;
  try {
    const upstream = await signedPost('/bookmarks/add', params, k);
    if (upstream.ok) return res.json({ ok: true });
    // 401/403: the token was revoked or the keys are wrong.
    if (upstream.status === 401 || upstream.status === 403) return res.status(502).json({ error: 'bad_credentials' });
    return res.status(502).json({ error: 'upstream', status: upstream.status });
  } catch {
    return res.status(504).json({ error: 'unreachable' });
  }
});

export default router;
