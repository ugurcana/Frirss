import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Subscription } from '../types';

const sub = (id: string, cat: string): Subscription => ({ id, title: id, categories: [{ id: `user/-/label/${cat}`, label: cat }] });

type Row = { id: string; read: boolean };
const feed = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
  unreadCounts: {} as Record<string, number>,
  selectedFeed: null as Subscription | null,
  selectedArticle: null as Row | null,
  articles: [] as Row[],
  continuation: null as string | null,
  loading: false,
  loadingMore: false,
  selectView: vi.fn(),
  selectCategory: vi.fn(),
  selectArticle: vi.fn(),
  loadMore: vi.fn(async () => {}),
}));
const ui = vi.hoisted(() => ({ categoryOrder: [] as string[], feedOrder: {}, hideReadFeeds: false }));
vi.mock('../stores/feedStore', () => ({ useFeedStore: { getState: () => feed } }));
vi.mock('../stores/uiStore', () => ({ useUiStore: { getState: () => ui } }));

import { nextArticleOrFeed, prevArticleOrFeed, goToAdjacentFeed, goToAdjacentCategory } from './feedJumps';

const a = (id: string, read = false): Row => ({ id, read });

describe('feedJumps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feed.subscriptions = [sub('n1', 'News'), sub('n2', 'News'), sub('t1', 'Tech')];
    feed.unreadCounts = { n1: 2, n2: 0, t1: 1 };
    feed.selectedFeed = feed.subscriptions[0];
    feed.articles = [a('x'), a('y')];
    feed.selectedArticle = null;
    feed.continuation = null;
    feed.loading = false;
    feed.loadingMore = false;
    ui.hideReadFeeds = false;
  });

  it('j selects the next article while there is one', async () => {
    feed.selectedArticle = feed.articles[0];
    await nextArticleOrFeed();
    expect(feed.selectArticle).toHaveBeenCalledWith(feed.articles[1]);
    expect(feed.selectView).not.toHaveBeenCalled();
  });

  it('j past the last article opens the next feed', async () => {
    feed.selectedArticle = feed.articles[1];
    await nextArticleOrFeed();
    expect(feed.selectView).toHaveBeenCalledWith(feed.subscriptions[1]);
  });

  it('j skips feeds the sidebar hides (hide read feeds)', async () => {
    ui.hideReadFeeds = true;
    feed.selectedArticle = feed.articles[1];
    await nextArticleOrFeed();
    expect(feed.selectView).toHaveBeenCalledWith(feed.subscriptions[2]);
  });

  it('j past the end of a category opens the next category', async () => {
    feed.selectedFeed = { id: 'user/-/label/News', title: 'News' };
    feed.selectedArticle = feed.articles[1];
    await nextArticleOrFeed();
    expect(feed.selectCategory).toHaveBeenCalledWith({ id: 'user/-/label/Tech', label: 'Tech' });
  });

  it('j from All or a label stays put at the end', async () => {
    feed.selectedFeed = null;
    feed.selectedArticle = feed.articles[1];
    await nextArticleOrFeed();
    expect(feed.selectView).not.toHaveBeenCalled();
    expect(feed.selectCategory).not.toHaveBeenCalled();
  });

  it('j loads the next page before moving on', async () => {
    feed.selectedArticle = feed.articles[1];
    feed.continuation = 'c1';
    feed.loadMore.mockImplementationOnce(async () => { feed.articles = [...feed.articles, a('z')]; feed.continuation = null; });
    await nextArticleOrFeed();
    expect(feed.selectArticle).toHaveBeenCalledWith(a('z'));
    expect(feed.selectView).not.toHaveBeenCalled();
  });

  it('j does not skip a feed while more pages remain or the list is loading', async () => {
    feed.selectedArticle = feed.articles[1];
    feed.continuation = 'c1';
    await nextArticleOrFeed();
    feed.continuation = null;
    feed.articles = [];
    feed.loading = true;
    await nextArticleOrFeed();
    expect(feed.selectView).not.toHaveBeenCalled();
  });

  it('next unread skips read articles, then moves to the next unread feed', async () => {
    feed.articles = [a('x'), a('y', true), a('z')];
    feed.selectedArticle = feed.articles[0];
    await nextArticleOrFeed(true);
    expect(feed.selectArticle).toHaveBeenCalledWith(feed.articles[2]);
    feed.selectedArticle = feed.articles[2];
    await nextArticleOrFeed(true);
    expect(feed.selectView).toHaveBeenCalledWith(feed.subscriptions[2]);
  });

  it('k at the top of the list opens the previous feed', () => {
    feed.selectedFeed = feed.subscriptions[1];
    feed.selectedArticle = feed.articles[0];
    prevArticleOrFeed();
    expect(feed.selectView).toHaveBeenCalledWith(feed.subscriptions[0]);
  });

  it('Shift and Alt targets', () => {
    goToAdjacentFeed(1);
    expect(feed.selectView).toHaveBeenLastCalledWith(feed.subscriptions[1]);
    goToAdjacentCategory(1);
    expect(feed.selectCategory).toHaveBeenLastCalledWith({ id: 'user/-/label/Tech', label: 'Tech' });
  });
});
