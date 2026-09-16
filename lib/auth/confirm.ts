import type { EmailOtpType } from '@supabase/supabase-js';

const KNOWN_EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

export interface ConfirmParams {
  tokenHash: string;
  type: EmailOtpType;
}

/**
 * Reads the `token_hash`/`type` query params Supabase's confirmation email link
 * carries. Returns null when either is missing or `type` isn't one of the values
 * Supabase actually issues — the caller treats that the same as a failed
 * verification (bounce to /login with an error) rather than trying to guess.
 */
export function parseConfirmParams(searchParams: URLSearchParams): ConfirmParams | null {
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (!tokenHash || !type) return null;
  if (!KNOWN_EMAIL_OTP_TYPES.includes(type as EmailOtpType)) return null;

  return { tokenHash, type: type as EmailOtpType };
}
