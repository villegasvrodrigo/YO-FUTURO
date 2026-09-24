import type { Goal, GoalStatus } from '@/lib/types';

const statusLabel: Record<GoalStatus, string> = {
  active: 'activa',
  achieved: 'lograda',
  paused: 'pausada',
};

/**
 * The user's goals in Perfil, each with its status and one action: an active goal can be
 * marked as achieved, and an achieved (or paused) goal can be brought back to active, so a
 * mistaken tap never loses a goal. While a change is being saved, that goal's action shows
 * "guardando…" and the other actions wait. A failed save shows its message under that goal.
 */
export function GoalList({
  goals,
  pendingId,
  error,
  onSetStatus,
}: {
  goals: Goal[];
  pendingId: string | null;
  error: { goalId: string; message: string } | null;
  onSetStatus: (goalId: string, status: GoalStatus) => void;
}) {
  return (
    <ul className="mb-4 flex flex-col gap-2.5">
      {goals.map((goal) => {
        const active = goal.status === 'active';
        const saving = pendingId === goal.id;
        return (
          <li key={goal.id} className="rounded-lg border border-rule bg-dusk-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`text-[15px] ${active ? 'text-parchment' : 'text-parchment/60'}`}>{goal.description}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                    goal.status === 'achieved' ? 'bg-sage/15 text-sage' : 'bg-rule text-mist'
                  }`}
                >
                  {statusLabel[goal.status]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSetStatus(goal.id, active ? 'achieved' : 'active')}
                disabled={pendingId !== null}
                className="shrink-0 font-mono text-xs text-brass transition-colors hover:text-parchment disabled:opacity-50"
              >
                {saving ? 'guardando…' : active ? 'marcar lograda' : 'reactivar'}
              </button>
            </div>
            {error?.goalId === goal.id && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error.message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
