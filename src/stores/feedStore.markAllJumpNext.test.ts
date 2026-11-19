// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Subscription } from '../types';

vi.mock('../api/feeds', () => ({
  getSubscriptionList: vi.fn(),
  getUnreadCounts: vi.fn(),
  getStreamContents: vi.fn(),
  getStarredItems: vi.fn(),
  getUnreadItemIds: vi.fn(() => Promise.resolve({ ids: [], complete: true })),
  markAsRead: vi.fn(() => Promise.resolve()),
  markAsUnread: vi.fn(() => Promise.resolve()),
  markAsStarred: vi.fn(() => Promise.resolve()),
  removeStarred: vi.fn(() => Promise.resolve()),
  markAllAsRead: vi.fn(() => Promise.resolve()),
  fetchStreamPage: vi.fn(),
  subscribeFeed: vi.fn(),
  editFeed: vi.fn(),
  unsubscribeFeed: vi.fn(),
  getTagList: vi.fn(),
  setArticleLabel: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
  clearWriteToken: vi.fn(),
}));
vi.mock('../lib/offlineStore', () => ({
  listsPatch: vi.fn(async () => {}),
  listGet: vi.fn(() => Promise.resolve(undefined)),
  listPut: vi.fn(() => Promise.resolve()),
  listEvictOlderThan: vi.fn(() => Promise.resolve()),
  subsGet: vi.fn(() => Promise.resolve(undefined)),
  subsPut: vi.fn(() => Promise.resolve()),
  queueGet: vi.fn(() => Promise.resolve([])),
  queuePut: vi.fn(() => Promise.resolve()),
  clearOfflineViews: vi.fn(() => Promise.resolve()),
}));
vi.mock('../api/backend', () => ({ startActualize: vi.fn(), getActualizeStatus: vi.fn() }));
vi.mock('../i18n', () => ({ default: { t: (k: string) => k } }));

import { useFeedStore } from './feedStore';
import { useUiStore } from './uiStore';
import * as api from '../api/feeds';
import type { Article } from '../types';


const cat = (name: string) => ({ id: `user/-/label/${name}`, label: name });
const sub = (id: string, c: string) => ({ id, title: id, categories: [cat(c)] }) as Subscription;
const n1 = sub('feed/1', 'News');
const n2 = sub('feed/2', 'News');
const t1 = sub('feed/3', 'Tech');
const art = (id: string): Article => ({ id, title: id, read: false, starred: false, sourceId: n1.id } as Article);

function setView(view: Subscription, counts: Record<string, number>) {
  useFeedStore.setState({
    selectedFeed: view, filter: 'unread', searchQuery: '', randomView: false, subscriptions: [n1, n2, t1],
    articles: [art('a')], continuation: null, unreadCounts: counts,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useUiStore.setState({ toasts: [], categoryOrder: [], feedOrder: {}, jumpNextAfterMarkAll: true });
  vi.mocked(api.getStreamContents).mockResolvedValue({ items: [], continuation: null });
});

// FreshRSS `onread_jump_next`.
describe('markAllAsRead — jump to the next unread feed', () => {
  it('opens the next unread feed of the same category first', async () => {
    setView(n1, { [n1.id]: 1, [n2.id]: 2, [t1.id]: 3 });
    await useFeedStore.getState().markAllAsRead();
    expect(useFeedStore.getState().selectedFeed?.id).toBe(n2.id);
  });

  it('then the next category', async () => {
    setView(n2, { [n1.id]: 0, [n2.id]: 1, [t1.id]: 3 });
    await useFeedStore.getState().markAllAsRead();
    expect(useFeedStore.getState().selectedFeed?.id).toBe(t1.id);
  });

  it('from a category, opens the next unread category', async () => {
    setView({ id: cat('News').id, title: 'News' } as Subscription, { [n1.id]: 1, [t1.id]: 3 });
    await useFeedStore.getState().markAllAsRead();
    expect(useFeedStore.getState().selectedFeed?.id).toBe(cat('Tech').id);
  });

  it('goes home when nothing is left unread', async () => {
    setView(t1, { [t1.id]: 1 });
    await useFeedStore.getState().markAllAsRead();
    expect(useFeedStore.getState().selectedFeed).toBeNull();
  });

  it('stays on the view when the setting is off', async () => {
    useUiStore.setState({ jumpNextAfterMarkAll: false });
    setView(n1, { [n1.id]: 1, [n2.id]: 2 });
    await useFeedStore.getState().markAllAsRead();
    expect(useFeedStore.getState().selectedFeed?.id).toBe(n1.id);
  });
});
