export const MISSING_SECTION_COPY =
  'Esta parte no quedó lista esta vez. Puedes continuar sin ella: tu yo futuro te irá conociendo con cada mensaje.';

/**
 * One section of the onboarding results ("Tu energía actual", "El patrón que te detiene",
 * "Quién quieres ser"). When the AI couldn't write that section, the card keeps its title
 * but looks like a quiet notice, not like a result: gray top line instead of gold, and a
 * small, plain gray text instead of the large serif italic.
 */
export function ResultCard({ title, content }: { title: string; content: string | null }) {
  const text = content?.trim() ? content : null;

  return (
    <div className={`rounded border-t-2 bg-dusk-2 px-7 py-8 ${text ? 'border-brass-dim' : 'border-rule'}`}>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-mist">{title}</p>
      {text ? (
        <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">{text}</p>
      ) : (
        <p className="text-sm leading-relaxed text-mist">{MISSING_SECTION_COPY}</p>
      )}
    </div>
  );
}
