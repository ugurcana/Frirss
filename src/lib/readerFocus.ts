/**
 * Fork: may the reading pane take the keyboard focus when an article opens?
 * It should (Space, Page Down… then scroll the article right away, without a
 * click in its body), unless the focus is somewhere the user is working: a
 * field, a dialog, a menu, a floating surface. Those keep it.
 */
export function canTakeReaderFocus(active: Element | null): boolean {
  if (!active || active === document.body) return true;
  const el = active as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return false;
  if (el.closest('[role="dialog"], [role="menu"], [data-floating-surface]')) return false;
  return true;
}
