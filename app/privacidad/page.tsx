import type { Metadata } from 'next';
import Link from 'next/link';
import { PRIVACY_TEXT, PRIVACY_TITLE } from './content';
import { parsePrivacyText, splitEmails } from './blocks';

export const metadata: Metadata = {
  title: `${PRIVACY_TITLE} · YO FUTURO`,
};

// Plain text with any email address turned into a mailto link.
function WithEmailLinks({ text }: { text: string }) {
  return (
    <>
      {splitEmails(text).map((piece, i) =>
        piece.email ? (
          <a
            key={i}
            href={`mailto:${piece.text}`}
            className="break-all text-brass underline underline-offset-4 hover:text-brass/80"
          >
            {piece.text}
          </a>
        ) : (
          <span key={i}>{piece.text}</span>
        )
      )}
    </>
  );
}

/** The privacy notice. Public: readable with or without an account. */
export default function PrivacidadPage() {
  const blocks = parsePrivacyText(PRIVACY_TEXT);

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <article className="w-full max-w-xl">
        <p className="mb-4 font-mono text-xs tracking-[0.16em] text-brass">YO FUTURO</p>
        <h1 className="mb-10 text-balance font-serif text-3xl leading-tight text-parchment sm:text-4xl">
          {PRIVACY_TITLE}
        </h1>

        <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-parchment/85">
          {blocks.map((block, i) => {
            if (block.kind === 'heading') {
              return (
                <h2 key={i} className="mt-6 font-serif text-2xl text-parchment first:mt-0">
                  {block.text}
                </h2>
              );
            }
            if (block.kind === 'list') {
              return (
                <ul key={i} className="flex list-disc flex-col gap-2 pl-5 marker:text-brass">
                  {block.items.map((item, j) => (
                    <li key={j}>
                      <WithEmailLinks text={item} />
                    </li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i}>
                <WithEmailLinks text={block.text} />
              </p>
            );
          })}
        </div>

        <Link
          href="/"
          className="mt-12 inline-block font-mono text-xs text-mist transition-colors hover:text-brass"
        >
          ← Volver al inicio
        </Link>
      </article>
    </main>
  );
}
