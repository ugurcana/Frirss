import type { Subscription } from '../types';

/**
 * Sidebar order of categories and feeds, and the FreshRSS-style moves over it
 * (next/previous feed or category, first/last, "jump to the next unread feed
 * after mark all as read"). Pure: callers pass the store state in.
 */

export interface SidebarCategory {
  id: string;
  label: string;
  feeds: Subscription[];
}

/** Bucket for feeds without a category. Not a real stream: never opened as a category. */
export const UNCATEGORIZED_ID = 'uncategorized';

/** Items listed in `order` first, in that order; the rest after, by label. */
function sortByOrder<T>(items: T[], order: string[] | undefined, id: (t: T) => string, label: (t: T) => string): void {
  if (!order || order.length === 0) return;
  items.sort((a, b) => {
    const ai = order.indexOf(id(a));
    const bi = order.indexOf(id(b));
    if (ai === -1 && bi === -1) return label(a).localeCompare(label(b));
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/** Categories and their feeds, exactly as the sidebar lists them. */
export function sidebarCategories(
  subscriptions: Subscription[],
  categoryOrder: string[],
  feedOrder: Record<string, string[]>,
  uncategorizedLabel: string,
): SidebarCategory[] {
  const map: Record<string, SidebarCategory> = {};
  for (const sub of subscriptions) {
    const catId = sub.categories?.[0]?.id || UNCATEGORIZED_ID;
    const catLabel = sub.categories?.[0]?.label || uncategorizedLabel;
    if (!map[catId]) map[catId] = { id: catId, label: catLabel, feeds: [] };
    map[catId].feeds.push(sub);
  }
  const cats = Object.values(map);
  if (categoryOrder.length > 0) sortByOrder(cats, categoryOrder, (c) => c.id, (c) => c.label);
  else cats.sort((a, b) => a.label.localeCompare(b.label));
  for (const cat of cats) sortByOrder(cat.feeds, feedOrder[cat.id], (f) => f.id, (f) => f.title);
  return cats;
}

/**
 * "Hide read feeds": drop feeds with no unread, and categories left empty, but
 * always keep the feed being viewed.
 */
export function visibleCategories(
  cats: SidebarCategory[],
  hideReadFeeds: boolean,
  unreadCounts: Record<string, number>,
  keepId: string | undefined,
): SidebarCategory[] {
  if (!hideReadFeeds) return cats;
  return cats
    .map((cat) => ({ ...cat, feeds: cat.feeds.filter((f) => (unreadCounts[f.id] || 0) > 0 || f.id === keepId) }))
    .filter((cat) => cat.feeds.length > 0);
}

const feedUnread = (counts: Record<string, number>, id: string) => counts[id] || 0;
const categoryUnread = (counts: Record<string, number>, cat: SidebarCategory) =>
  cat.feeds.reduce((n, f) => n + feedUnread(counts, f.id), 0);

/**
 * Everything except `items[index]`, walked from `index` in `dir` and wrapping
 * around, as FreshRSS does at the end of its feed list. With `index === -1`,
 * the whole list from its start (or its end, backwards).
 */
function rotation<T>(items: T[], index: number, dir: 1 | -1): T[] {
  if (index === -1) return dir === 1 ? items : [...items].reverse();
  if (dir === 1) return [...items.slice(index + 1), ...items.slice(0, index)];
  return [...items.slice(0, index).reverse(), ...items.slice(index + 1).reverse()];
}

export type NavTarget =
  | { kind: 'feed'; feed: Subscription }
  | { kind: 'category'; category: SidebarCategory };

/** Is `id` a feed or a category of the sidebar (and not a label, a special view, "All")? */
export function viewKind(cats: SidebarCategory[], id: string | undefined): 'feed' | 'category' | null {
  if (!id) return null;
  if (cats.some((c) => c.id === id && c.id !== UNCATEGORIZED_ID)) return 'category';
  if (cats.some((c) => c.feeds.some((f) => f.id === id))) return 'feed';
  return null;
}

/** Category the view belongs to: the category itself, or the feed's category. */
function currentCategoryId(cats: SidebarCategory[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return cats.find((c) => c.id === id || c.feeds.some((f) => f.id === id))?.id;
}

/** FreshRSS `next_feed` / `prev_feed`: the adjacent feed in sidebar order. */
export function adjacentFeed(
  cats: SidebarCategory[],
  currentId: string | undefined,
  dir: 1 | -1,
  unreadOnly = false,
  counts: Record<string, number> = {},
): Subscription | null {
  const feeds = cats.flatMap((c) => c.feeds);
  const candidates = rotation(feeds, feeds.findIndex((f) => f.id === currentId), dir);
  return (unreadOnly ? candidates.find((f) => feedUnread(counts, f.id) > 0) : candidates[0]) ?? null;
}

/** FreshRSS `next_category` / `prev_category`, from a category or one of its feeds. */
export function adjacentCategory(
  cats: SidebarCategory[],
  currentId: string | undefined,
  dir: 1 | -1,
  unreadOnly = false,
  counts: Record<string, number> = {},
): SidebarCategory | null {
  const real = cats.filter((c) => c.id !== UNCATEGORIZED_ID);
  const catId = currentCategoryId(cats, currentId);
  const candidates = rotation(real, real.findIndex((c) => c.id === catId), dir);
  return (unreadOnly ? candidates.find((c) => categoryUnread(counts, c) > 0) : candidates[0]) ?? null;
}

export function edgeFeed(cats: SidebarCategory[], edge: 'first' | 'last'): Subscription | null {
  const feeds = cats.flatMap((c) => c.feeds);
  return (edge === 'first' ? feeds[0] : feeds[feeds.length - 1]) ?? null;
}

export function edgeCategory(cats: SidebarCategory[], edge: 'first' | 'last'): SidebarCategory | null {
  const real = cats.filter((c) => c.id !== UNCATEGORIZED_ID);
  return (edge === 'first' ? real[0] : real[real.length - 1]) ?? null;
}

/**
 * Where FreshRSS goes after "mark all as read" (`onread_jump_next`,
 * `FreshRSS_Context::_nextGet`). From a feed: the next unread feed in the same
 * category, else the previous one in the same category, else the next unread
 * feed anywhere, else the previous one. From a category: the next unread
 * category, else the previous one. `null` when nothing is left unread (FreshRSS
 * then shows the main stream) or the view is neither a feed nor a category.
 * `counts` must already reflect the marking.
 */
export function nextAfterMarkAll(
  cats: SidebarCategory[],
  currentId: string | undefined,
  counts: Record<string, number>,
): NavTarget | null {
  const kind = viewKind(cats, currentId);
  if (kind === 'feed') {
    let candidate: Subscription | null = null;
    let found = false;
    for (const cat of cats) {
      let sameCat = false;
      for (const feed of cat.feeds) {
        if (found) {
          if (feedUnread(counts, feed.id) > 0) return { kind: 'feed', feed };
        } else if (feed.id === currentId) {
          found = true;
        } else if (feedUnread(counts, feed.id) > 0) {
          candidate = feed;
          sameCat = true;
        }
      }
      if (found && sameCat) break;
    }
    return candidate ? { kind: 'feed', feed: candidate } : null;
  }
  if (kind === 'category') {
    let candidate: SidebarCategory | null = null;
    let found = false;
    for (const cat of cats) {
      if (cat.id === UNCATEGORIZED_ID) continue;
      if (cat.id === currentId) { found = true; continue; }
      if (categoryUnread(counts, cat) > 0) {
        candidate = cat;
        if (found) break;
      }
    }
    return candidate ? { kind: 'category', category: candidate } : null;
  }
  return null;
}
