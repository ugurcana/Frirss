// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { canTakeReaderFocus } from './readerFocus';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>('[data-target]')!;
}

describe('canTakeReaderFocus', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('takes the focus from nowhere, a list row or a toolbar button', () => {
    expect(canTakeReaderFocus(null)).toBe(true);
    expect(canTakeReaderFocus(document.body)).toBe(true);
    expect(canTakeReaderFocus(mount('<div data-article-id="a" tabindex="0" data-target></div>'))).toBe(true);
    expect(canTakeReaderFocus(mount('<button data-target>Star</button>'))).toBe(true);
  });

  it('leaves it in a field', () => {
    expect(canTakeReaderFocus(mount('<input data-target>'))).toBe(false);
    expect(canTakeReaderFocus(mount('<textarea data-target></textarea>'))).toBe(false);
    expect(canTakeReaderFocus(mount('<select data-target></select>'))).toBe(false);
    const editable = mount('<div contenteditable="true" data-target></div>');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(canTakeReaderFocus(editable)).toBe(false);
  });

  it('leaves it in a dialog, a menu or a floating surface', () => {
    expect(canTakeReaderFocus(mount('<div role="dialog"><button data-target></button></div>'))).toBe(false);
    expect(canTakeReaderFocus(mount('<div role="menu"><button data-target></button></div>'))).toBe(false);
    expect(canTakeReaderFocus(mount('<div data-floating-surface><button data-target></button></div>'))).toBe(false);
  });
});
