import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user: { id: number } }).user = { id: 1 };
    next();
  },
}));

import instapaperRoutes from '../routes/instapaper.js';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/instapaper', instapaperRoutes);
  return a;
}

const ENV = {
  INSTAPAPER_CONSUMER_KEY: 'ck', INSTAPAPER_CONSUMER_SECRET: 'cs-secret',
  INSTAPAPER_TOKEN: 'tk', INSTAPAPER_TOKEN_SECRET: 'ts-secret',
};
const fetchMock = vi.fn();
const add = (body: unknown) => request(app()).post('/api/instapaper/add').send(body as object);

describe('/api/instapaper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    Object.assign(process.env, ENV);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(ENV)) delete process.env[k];
  });

  it('is enabled only with the four keys', async () => {
    expect((await request(app()).get('/api/instapaper/status')).body).toEqual({ enabled: true });
    delete process.env.INSTAPAPER_TOKEN_SECRET;
    expect((await request(app()).get('/api/instapaper/status')).body).toEqual({ enabled: false });
    expect((await add({ url: 'https://e.com' })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the bookmark with an OAuth-signed request', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }));
    const res = await add({ url: 'https://example.com/a', title: 'A b' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe('https://www.instapaper.com/api/1/bookmarks/add');
    expect(init.headers.Authorization).toMatch(/^OAuth .*oauth_consumer_key="ck".*oauth_signature="[^"]+".*oauth_token="tk"/);
    const body = new URLSearchParams(init.body);
    expect(body.get('url')).toBe('https://example.com/a');
    expect(body.get('title')).toBe('A b');
  });

  it('refuses a non-web URL without calling Instapaper', async () => {
    for (const url of ['javascript:alert(1)', 'not a url', 42, undefined]) {
      expect((await add({ url })).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells a revoked token, upstream errors and timeouts apart', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    expect((await add({ url: 'https://e.com' })).body.error).toBe('bad_credentials');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect((await add({ url: 'https://e.com' })).body.error).toBe('upstream');
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const res = await add({ url: 'https://e.com' });
    expect(res.status).toBe(504);
    expect(res.body.error).toBe('unreachable');
  });

  it('never sends the secrets back', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    const res = await add({ url: 'https://e.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});
