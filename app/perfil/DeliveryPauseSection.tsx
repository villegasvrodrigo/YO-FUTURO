'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { PAUSE_FAILED, PAUSE_SAVED, RESUME_SAVED, setDeliveryPaused } from '@/lib/perfil/deliveryPause';

/**
 * "Correos diarios" in Perfil: shows whether the daily emails are active or paused, with a
 * button that pauses or resumes them right away (it does not go through "Guardar cambios").
 * The result shows right next to the button, like the profile save.
 */
export function DeliveryPauseSection({ profileId, initialPaused }: { profileId: string; initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    if (saving) return;
    const next = !paused;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const saved = await setDeliveryPaused(createClient(), profileId, next);
      if (saved) {
        setPaused(next);
        setNotice(next ? PAUSE_SAVED : RESUME_SAVED);
      } else {
        setError(PAUSE_FAILED);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 flex flex-col gap-4 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-7">
      <h2 className="font-serif text-xl text-parchment">Correos diarios</h2>
      <p className="text-sm text-parchment">
        Tus correos diarios están <span className="font-semibold text-brass">{paused ? 'en pausa' : 'activos'}</span>.
      </p>
      <p className="font-mono text-xs text-mist">
        Mientras estén en pausa no recibirás mensaje, tareas ni insight. Tu cuenta y tu historial se quedan igual.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-sage/30 bg-sage/10 px-3.5 py-2.5 text-sm text-sage">
          {notice}
        </p>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={
          paused
            ? 'self-start rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50'
            : 'self-start rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60 disabled:opacity-50'
        }
      >
        {saving ? 'Guardando…' : paused ? 'Reanudar mis correos' : 'Pausar mis correos'}
      </button>
    </section>
  );
}
