// Who can use the chat: every signed-in account. The screens that show it (Inicio, Chat,
// Progreso, Perfil) already require a finished onboarding (the middleware sends anyone else
// to /onboarding), and the route that answers messages checks it again before doing anything.
//
// Switch: the CHAT_ENABLED environment variable. "false" turns the chat off for everyone
// (the bar shows "Chat — Próximamente" and the API answers that it isn't available, without
// calling the AI or saving anything). Missing or any other value: the chat is on. It is read on
// the server only, so changing it in Vercel takes effect with the next deployment.

/** Whether the chat is switched on (CHAT_ENABLED is not "false"). */
export function isChatSwitchedOn(): boolean {
  return process.env.CHAT_ENABLED?.trim().toLowerCase() !== 'false';
}

/** Whether this account can use the chat now. */
export function isChatEnabledFor(userId: string | null | undefined): boolean {
  return !!userId && isChatSwitchedOn();
}
