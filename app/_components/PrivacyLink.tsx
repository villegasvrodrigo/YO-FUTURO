import Link from 'next/link';

/** The discreet text link to the privacy notice, for the footer of the public pages. */
export function PrivacyLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/privacidad"
      className={`text-xs text-mist underline underline-offset-4 transition-colors hover:text-brass ${className}`}
    >
      Aviso de privacidad
    </Link>
  );
}
