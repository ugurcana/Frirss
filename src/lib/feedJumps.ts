import { useFeedStore } from '../stores/feedStore';
import { useUiStore } from '../stores/uiStore';
import {
  adjacentCategory, adjacentFeed, edgeCategory, edgeFeed, sidebarCategories, viewKind, visibleCategories,
  type SidebarCategory,
} from './feedNavigation';
import type { Subscription } from '../types';

/**
 * FreshRSS-style keyboard moves between feeds and categories, in sidebar order
 * (the feeds the sidebar shows: "hide read feeds" applies, the current feed
 * stays). Glue between the pure helpers of `feedNavigation.ts` and the stores.
 */

function categories(): SidebarCategory[] {
  const ui = useUiStore.getState();
  const feed = useFeedStore.getState();
  const cats = sidebarCategories(feed.subscriptions, ui.categoryOrder, ui.feedOrder, '');
  return visibleCategories(cats, ui.hideReadFeeds, feed.unreadCounts, feed.selectedFeed?.id);
}

const busy = () => {
  const { loading, loadingMore } = useFeedStore.getState();
  return loading || loadingMore;
};

function openFeed(feed: Subscription | null): boolean {
  if (!feed) return false;
  useFeedStore.getState().selectView(feed);
  return true;
}

function openCategory(cat: SidebarCategory | null): boolean {
  if (!cat) return false;
  useFeedStore.getState().selectCategory({ id: cat.id, label: cat.label });
  return true;
}

/** Shift + next/previous (next unread: `unreadOnly`). */
export function goToAdjacentFeed(dir: 1 | -1, unreadOnly = false): boolean {
  const { selectedFeed, unreadCounts } = useFeedStore.getState();
  return openFeed(adjacentFeed(categories(), selectedFeed?.id, dir, unreadOnly, unreadCounts));
}

/** Alt + next/previous (next unread: `unreadOnly`). */
export function goToAdjacentCategory(dir: 1 | -1, unreadOnly = false): boolean {
  const { selectedFeed, unreadCounts } = useFeedStore.getState();
  return openCategory(adjacentCategory(categories(), selectedFeed?.id, dir, unreadOnly, unreadCounts));
}

export function goToEdgeFeed(edge: 'first' | 'last'): boolean {
  return openFeed(edgeFeed(categories(), edge));
}

export function goToEdgeCategory(edge: 'first' | 'last'): boolean {
  return openCategory(edgeCategory(categories(), edge));
}

/**
 * FreshRSS `next_entry` / `prev_entry` past the end of the list: the next (or
 * previous) feed from a feed, the next (or previous) category from a category.
 * Nothing from "All", a label or a special view.
 */
export function continuePastEnd(dir: 1 | -1, unreadOnly = false): boolean {
  const cats = categories();
  const kind = viewKind(cats, useFeedStore.getState().selectedFeed?.id);
  if (kind === 'feed') return goToAdjacentFeed(dir, unreadOnly);
  if (kind === 'category') return goToAdjacentCategory(dir, unreadOnly);
  return false;
}

/**
 * Next article (`unreadOnly`: next unread), loading the next page when the
 * loaded ones run out, and moving on to the next feed or category past the
 * end, as FreshRSS's `j` does.
 */
export async function nextArticleOrFeed(unreadOnly = false): Promise<void> {
  const pick = () => {
    const { articles, selectedArticle } = useFeedStore.getState();
    const idx = selectedArticle ? articles.findIndex((a) => a.id === selectedArticle.id) : -1;
    return articles.slice(idx + 1).find((a) => !unreadOnly || !a.read) ?? null;
  };
  let next = pick();
  if (!next && useFeedStore.getState().continuation) {
    const view = useFeedStore.getState().selectedFeed?.id;
    await useFeedStore.getState().loadMore({ once: true });
    if (useFeedStore.getState().selectedFeed?.id !== view) return;
    next = pick();
    // More pages remain (the page was refused or brought only read rows):
    // the list has not ended, the next `j` tries again.
    if (!next && useFeedStore.getState().continuation) return;
  }
  if (next) { useFeedStore.getState().selectArticle(next); return; }
  // A list still loading is not a list that ended: moving on would skip it.
  if (busy()) return;
  continuePastEnd(1, unreadOnly);
}

/** Previous article, or the previous feed or category at the top of the list. */
export function prevArticleOrFeed(): void {
  const { articles, selectedArticle } = useFeedStore.getState();
  const idx = selectedArticle ? articles.findIndex((a) => a.id === selectedArticle.id) : articles.length;
  const prev = articles[idx - 1];
  if (prev) useFeedStore.getState().selectArticle(prev);
  else if ((articles.length === 0 || idx === 0) && !busy()) continuePastEnd(-1);
}
