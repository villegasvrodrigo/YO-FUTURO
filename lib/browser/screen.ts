/**
 * Closes the phone keyboard by taking the focus away from whatever field has it. Used when
 * the onboarding conversation ends: the answer box keeps its focus between messages (so
 * the keyboard stays open), and without this the keyboard was still open on the results
 * screen, where the first tap only closed it and "Continuar" needed a second tap.
 */
export function dismissKeyboard(doc: Pick<Document, 'activeElement' | 'body'> = document): void {
  const focused = doc.activeElement as (Element & { blur?: () => void }) | null;
  if (focused && focused !== doc.body && typeof focused.blur === 'function') {
    focused.blur();
  }
}

/** Jumps to the top of the page, at once, so a new screen starts at its beginning. */
export function scrollToTop(win: Pick<Window, 'scrollTo'> = window): void {
  win.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
