import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ getInstapaperStatus: vi.fn(), saveToInstapaper: vi.fn() }));
vi.mock('../api/backend', () => api);

import { instapaperEnabled, saveArticleToInstapaper } from './instapaper';

describe('instapaper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the server once, and again after a failure', async () => {
    api.getInstapaperStatus.mockRejectedValueOnce(new Error('offline'));
    expect(await instapaperEnabled()).toBe(false);
    api.getInstapaperStatus.mockResolvedValue(true);
    expect(await instapaperEnabled()).toBe(true);
    expect(await instapaperEnabled()).toBe(true);
    expect(api.getInstapaperStatus).toHaveBeenCalledTimes(2);
  });

  it('reports the outcome of a save', async () => {
    api.saveToInstapaper.mockResolvedValueOnce(undefined);
    expect(await saveArticleToInstapaper('https://e.com/a', 'A')).toBe('saved');
    expect(api.saveToInstapaper).toHaveBeenCalledWith('https://e.com/a', 'A');
    api.saveToInstapaper.mockRejectedValueOnce({ response: { data: { error: 'bad_credentials' } } });
    expect(await saveArticleToInstapaper('https://e.com/a')).toBe('badCredentials');
    api.saveToInstapaper.mockRejectedValueOnce(new Error('504'));
    expect(await saveArticleToInstapaper('https://e.com/a')).toBe('failed');
  });

  it('ignores a second press while the first save runs', async () => {
    let done!: () => void;
    api.saveToInstapaper.mockReturnValueOnce(new Promise<void>((r) => { done = r; }));
    const first = saveArticleToInstapaper('https://e.com/b');
    expect(await saveArticleToInstapaper('https://e.com/b')).toBeNull();
    done();
    expect(await first).toBe('saved');
  });
});
