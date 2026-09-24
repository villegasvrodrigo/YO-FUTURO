import { describe, it, expect, vi } from 'vitest';
import { dismissKeyboard, scrollToTop } from './screen';

describe('dismissKeyboard', () => {
  it('takes the focus away from the field that has it (closing the phone keyboard)', () => {
    const answerBox = { blur: vi.fn() };
    const doc = { activeElement: answerBox, body: {} } as unknown as Document;

    dismissKeyboard(doc);

    expect(answerBox.blur).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nothing has the focus', () => {
    const body = { blur: vi.fn() };
    expect(() => dismissKeyboard({ activeElement: null, body } as unknown as Document)).not.toThrow();
    dismissKeyboard({ activeElement: body, body } as unknown as Document);

    expect(body.blur).not.toHaveBeenCalled();
  });

  it('does not crash on an element that cannot lose focus', () => {
    const doc = { activeElement: {}, body: {} } as unknown as Document;

    expect(() => dismissKeyboard(doc)).not.toThrow();
  });
});

describe('scrollToTop', () => {
  it('jumps to the very top of the page at once', () => {
    const win = { scrollTo: vi.fn() };

    scrollToTop(win);

    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
