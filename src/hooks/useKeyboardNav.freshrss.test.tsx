// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const store = vi.hoisted(() => ({
  selectedArticle: { id: 'a1', read: false, url: 'https://example.com/a' } as { id: string; read: boolean; url: string } | null,
  selectedFeed: null,
  articles: [{ id: 'a0', read: false }, { id: 'a1', read: false }, { id: 'a2', read: false }],
  selectArticle: vi.fn(),
  toggleRead: vi.fn(),
  toggleStar: vi.fn(),
  markReadRelative: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
}));
vi.mock('../stores/feedStore', () => ({
  useFeedStore: Object.assign((sel: (s: unknown) => unknown) => sel(store), { getState: () => store }),
  READ_LATER_LABEL: 'user/-/label/Read later',
  getSampleArticleUrl: () => undefined,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('../lib/openExternal', () => ({ openExternal: vi.fn() }));
vi.mock('../lib/toolbarCommands', () => ({ runToolbarCommand: vi.fn() }));
vi.mock('../lib/feedJumps', () => ({
  goToAdjacentFeed: vi.fn(), goToAdjacentCategory: vi.fn(), goToEdgeFeed: vi.fn(), goToEdgeCategory: vi.fn(),
  nextArticleOrFeed: vi.fn(async () => {}), prevArticleOrFeed: vi.fn(),
}));

import { useKeyboardNav } from './useKeyboardNav';
import { useUiStore } from '../stores/uiStore';
import { openExternal } from '../lib/openExternal';
import { runToolbarCommand } from '../lib/toolbarCommands';
import * as jumps from '../lib/feedJumps';

function Harness() {
  useKeyboardNav();
  return null;
}

function press(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(e);
  return e;
}

// The owner's FreshRSS layout.
const FRESHRSS = {
  nextArticle: 'j', prevArticle: 'k', nextUnread: 'h', toggleRead: 'r', markRead: '', markUnread: '',
  toggleStar: 'f', openOriginal: ' ', firstArticle: 'Home', lastArticle: 'End', refresh: 'q',
  search: 'a', toggleSidebar: 't', summarize: '', translate: '',
};

describe('useKeyboardNav — FreshRSS layout and modifiers', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.getState().resetShortcuts();
    for (const [action, key] of Object.entries(FRESHRSS)) useUiStore.getState().setShortcut(action, key);
    useUiStore.setState({ shortcutHelpOpen: false, commandPaletteOpen: false });
    store.selectedArticle = { id: 'a1', read: false, url: 'https://example.com/a' };
    vi.clearAllMocks();
    render(<Harness />);
  });
  afterEach(cleanup);

  it('j / k / h go through the feed-continuing moves', () => {
    press({ key: 'j' });
    press({ key: 'k' });
    press({ key: 'h' });
    expect(jumps.nextArticleOrFeed).toHaveBeenNthCalledWith(1);
    expect(jumps.prevArticleOrFeed).toHaveBeenCalledTimes(1);
    expect(jumps.nextArticleOrFeed).toHaveBeenNthCalledWith(2, true);
  });

  it('Shift moves between feeds, Alt between categories', () => {
    expect(press({ key: 'J', shiftKey: true }).defaultPrevented).toBe(true);
    press({ key: 'K', shiftKey: true });
    press({ key: 'H', shiftKey: true });
    expect(jumps.goToAdjacentFeed).toHaveBeenNthCalledWith(1, 1);
    expect(jumps.goToAdjacentFeed).toHaveBeenNthCalledWith(2, -1);
    expect(jumps.goToAdjacentFeed).toHaveBeenNthCalledWith(3, 1, true);
    press({ key: 'j', altKey: true });
    press({ key: 'h', altKey: true });
    expect(jumps.goToAdjacentCategory).toHaveBeenNthCalledWith(1, 1);
    expect(jumps.goToAdjacentCategory).toHaveBeenNthCalledWith(2, 1, true);
    expect(jumps.nextArticleOrFeed).not.toHaveBeenCalled();
  });

  it('Alt reads the physical key where Alt types another character (macOS)', () => {
    press({ key: '∆', code: 'KeyJ', altKey: true });
    expect(jumps.goToAdjacentCategory).toHaveBeenCalledWith(1);
  });

  it('Home / End: first and last article, feed with Shift, category with Alt', () => {
    expect(press({ key: 'Home' }).defaultPrevented).toBe(true);
    expect(store.selectArticle).toHaveBeenLastCalledWith(store.articles[0]);
    press({ key: 'End' });
    expect(store.selectArticle).toHaveBeenLastCalledWith(store.articles[2]);
    press({ key: 'Home', shiftKey: true });
    press({ key: 'End', altKey: true });
    expect(jumps.goToEdgeFeed).toHaveBeenCalledWith('first');
    expect(jumps.goToEdgeCategory).toHaveBeenCalledWith('last');
  });

  it('r toggles read; Shift+r is the toolbar\'s mark all read; Alt+r marks the articles above read', () => {
    press({ key: 'r' });
    expect(store.toggleRead).toHaveBeenCalledWith(store.selectedArticle);
    press({ key: 'R', shiftKey: true });
    expect(runToolbarCommand).toHaveBeenCalledWith('markAllRead');
    press({ key: 'r', altKey: true });
    expect(store.markReadRelative).toHaveBeenCalledWith(store.selectedArticle, 'above');
    press({ key: 'R', shiftKey: true, repeat: true });
    expect(runToolbarCommand).toHaveBeenCalledTimes(1);
  });

  it('Space opens the original when bound; q refreshes', () => {
    expect(press({ key: ' ' }).defaultPrevented).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/a');
    press({ key: 'q' });
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('an unbound Space still scrolls', () => {
    act(() => useUiStore.getState().setShortcut('openOriginal', 'o'));
    expect(press({ key: ' ' }).defaultPrevented).toBe(false);
  });

  it('Alt or Shift on other keys are left alone', () => {
    expect(press({ key: 'f', altKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'j', altKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(store.toggleStar).not.toHaveBeenCalled();
  });

  it('a key bound as typed with Shift keeps its own action', () => {
    act(() => useUiStore.getState().setShortcut('toggleStar', 'J'));
    press({ key: 'J', shiftKey: true });
    expect(store.toggleStar).toHaveBeenCalledTimes(1);
    expect(jumps.goToAdjacentFeed).not.toHaveBeenCalled();
  });
});
