import { describe, it, expect } from 'vitest';
import {
  sidebarCategories, visibleCategories, adjacentFeed, adjacentCategory, edgeFeed, edgeCategory,
  nextAfterMarkAll, viewKind,
} from './feedNavigation';
import type { Subscription } from '../types';

const sub = (id: string, cat?: string): Subscription => ({
  id, title: id, categories: cat ? [{ id: `user/-/label/${cat}`, label: cat }] : undefined,
});
const C = (name: string) => `user/-/label/${name}`;

// Sidebar: News [n1 n2 n3], Tech [t1 t2], Uncategorized [u1]
const subs = [sub('n1', 'News'), sub('t1', 'Tech'), sub('n2', 'News'), sub('t2', 'Tech'), sub('n3', 'News'), sub('u1')];
const cats = sidebarCategories(subs, [C('News'), C('Tech')], {}, 'Uncategorized');
const ids = (xs: Array<{ id: string } | null>) => xs.map((x) => x?.id ?? null);

describe('sidebarCategories', () => {
  it('follows the custom category and feed order, the rest by label', () => {
    const c = sidebarCategories(subs, [C('Tech')], { [C('News')]: ['n3', 'n1'] }, 'Uncategorized');
    expect(c.map((x) => x.id)).toEqual([C('Tech'), C('News'), 'uncategorized']);
    expect(c[1].feeds.map((f) => f.id)).toEqual(['n3', 'n1', 'n2']);
  });

  it('sorts categories by label without a custom order', () => {
    const c = sidebarCategories(subs, [], {}, 'Aaa');
    expect(c.map((x) => x.label)).toEqual(['Aaa', 'News', 'Tech']);
  });
});

describe('visibleCategories', () => {
  it('hides read feeds and empty categories, keeping the current feed', () => {
    const v = visibleCategories(cats, true, { n2: 3 }, 't1');
    expect(v.map((c) => c.feeds.map((f) => f.id))).toEqual([['n2'], ['t1']]);
  });
  it('keeps everything when the option is off', () => {
    expect(visibleCategories(cats, false, {}, undefined)).toBe(cats);
  });
});

describe('adjacentFeed / adjacentCategory', () => {
  it('walks feeds in sidebar order, across categories, wrapping', () => {
    expect(adjacentFeed(cats, 'n3', 1)?.id).toBe('t1');
    expect(adjacentFeed(cats, 'u1', 1)?.id).toBe('n1');
    expect(adjacentFeed(cats, 'n1', -1)?.id).toBe('u1');
    expect(adjacentFeed(cats, 't1', -1)?.id).toBe('n3');
  });
  it('starts at the first (or last) feed from a non-feed view', () => {
    expect(adjacentFeed(cats, undefined, 1)?.id).toBe('n1');
    expect(adjacentFeed(cats, C('Tech'), -1)?.id).toBe('u1');
  });
  it('skips feeds without unread when asked', () => {
    expect(adjacentFeed(cats, 'n1', 1, true, { t2: 1 })?.id).toBe('t2');
    expect(adjacentFeed(cats, 'n1', 1, true, {})).toBeNull();
  });
  it('moves between categories from a category or from one of its feeds, never into Uncategorized', () => {
    expect(adjacentCategory(cats, C('News'), 1)?.id).toBe(C('Tech'));
    expect(adjacentCategory(cats, 'n2', 1)?.id).toBe(C('Tech'));
    expect(adjacentCategory(cats, C('Tech'), 1)?.id).toBe(C('News'));
    expect(adjacentCategory(cats, 'u1', 1)?.id).toBe(C('News'));
    expect(adjacentCategory(cats, 't1', 1, true, { n1: 2 })?.id).toBe(C('News'));
    expect(adjacentCategory(cats, 't1', 1, true, { t2: 2 })).toBeNull();
  });
  it('finds the edges', () => {
    expect(ids([edgeFeed(cats, 'first'), edgeFeed(cats, 'last')])).toEqual(['n1', 'u1']);
    expect(ids([edgeCategory(cats, 'first'), edgeCategory(cats, 'last')])).toEqual([C('News'), C('Tech')]);
  });
});

describe('nextAfterMarkAll (FreshRSS onread_jump_next)', () => {
  const next = (id: string, counts: Record<string, number>) => {
    const t = nextAfterMarkAll(cats, id, counts);
    return t ? (t.kind === 'feed' ? t.feed.id : t.category.id) : null;
  };
  it('prefers the next unread feed of the same category', () => {
    expect(next('n1', { n3: 1, t1: 1 })).toBe('n3');
  });
  it('then the previous unread feed of the same category', () => {
    expect(next('n3', { n1: 1, n2: 1, t1: 1 })).toBe('n2');
  });
  it('then the next unread feed anywhere', () => {
    expect(next('n3', { t2: 1, u1: 1 })).toBe('t2');
  });
  it('then the previous unread feed anywhere', () => {
    expect(next('t2', { n2: 1 })).toBe('n2');
  });
  it('gives null when nothing is left', () => {
    expect(next('t2', {})).toBeNull();
  });
  it('from a category: the next unread category, else the previous one', () => {
    expect(next(C('News'), { t1: 1 })).toBe(C('Tech'));
    expect(next(C('Tech'), { n1: 1 })).toBe(C('News'));
    expect(next(C('Tech'), {})).toBeNull();
  });
  it('does nothing from a label, a special view or All', () => {
    expect(viewKind(cats, 'user/-/label/Someday')).toBeNull();
    expect(nextAfterMarkAll(cats, 'user/-/label/Someday', { n1: 1 })).toBeNull();
    expect(nextAfterMarkAll(cats, undefined, { n1: 1 })).toBeNull();
    expect(nextAfterMarkAll(cats, 'uncategorized', { n1: 1 })).toBeNull();
  });
});
