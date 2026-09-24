export const DELETE_FAILED = 'No se pudo eliminar tu cuenta. Revisa tu conexión e intenta de nuevo. Tu cuenta sigue igual.';

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

/**
 * Asks the server to delete the signed-in user's account (/api/account/delete). Never
 * throws: a network failure, a server error or an unreadable answer all come back as
 * { ok: false } with a message to show next to the button. Only a successful answer
 * means the account is gone.
 */
export async function deleteMyAccount(fetchFn: typeof fetch = fetch): Promise<DeleteAccountResult> {
  try {
    const res = await fetchFn('/api/account/delete', { method: 'POST' });
    if (res.ok) return { ok: true };
    console.error(`[perfil] no se pudo eliminar la cuenta: HTTP ${res.status}`);
    return { ok: false, error: DELETE_FAILED };
  } catch (err) {
    console.error('[perfil] no se pudo eliminar la cuenta:', err);
    return { ok: false, error: DELETE_FAILED };
  }
}
