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

const fetchMock = vi.fn();

describe('/api/instapaper', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.INSTAPAPER_USERNAME = 'me@example.com';
    process.env.INSTAPAPER_PASSWORD = 'secret';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.INSTAPAPER_USERNAME;
    delete process.env.INSTAPAPER_PASSWORD;
  });

  it('says whether it is configured', async () => {
    expect((await request(app()).get('/api/instapaper/status')).body).toEqual({ enabled: true });
    delete process.env.INSTAPAPER_USERNAME;
    expect((await request(app()).get('/api/instapaper/status')).body).toEqual({ enabled: false });
  });

  it('saves the URL and title with basic auth', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 201 }));
    const res = await request(app()).post('/api/instapaper/add').send({ url: 'https://example.com/a', title: 'A' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe('https://www.instapaper.com/api/add');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('me@example.com:secret').toString('base64')}`);
    expect(new URLSearchParams(init.body).get('url')).toBe('https://example.com/a');
    expect(new URLSearchParams(init.body).get('title')).toBe('A');
  });

  it('refuses a non-web URL without calling Instapaper', async () => {
    for (const url of ['javascript:alert(1)', 'not a url', 42, undefined]) {
      const res = await request(app()).post('/api/instapaper/add').send({ url });
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is off without credentials', async () => {
    delete process.env.INSTAPAPER_USERNAME;
    const res = await request(app()).post('/api/instapaper/add').send({ url: 'https://example.com/a' });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells bad credentials, upstream errors and timeouts apart', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    expect((await request(app()).post('/api/instapaper/add').send({ url: 'https://e.com' })).body.error).toBe('bad_credentials');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect((await request(app()).post('/api/instapaper/add').send({ url: 'https://e.com' })).body.error).toBe('upstream');
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const res = await request(app()).post('/api/instapaper/add').send({ url: 'https://e.com' });
    expect(res.status).toBe(504);
    expect(res.body.error).toBe('unreachable');
  });

  it('never sends the credentials back', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    const res = await request(app()).post('/api/instapaper/add').send({ url: 'https://e.com' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
