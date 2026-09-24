/**
 * Goes to `path` with a full page load, instead of the app router's push + refresh pair:
 * right after a session or profile change (sign in, sign up, sign out, onboarding done,
 * account deleted) the next page must be built from scratch on the server. Calling
 * router.refresh() right after router.push() could refresh the current page instead and
 * leave the user where they were, as if nothing had happened.
 * Callers keep their button in its busy state: the page is about to be replaced.
 */
export function navigateTo(path: string, location: Pick<Location, 'assign'> = window.location): void {
  location.assign(path);
}
