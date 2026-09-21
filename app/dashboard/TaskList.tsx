'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { completionPercent, saveTaskCompletion, taskCompletionUpdate } from '@/lib/tasks/completion';
import type { DailyTask } from '@/lib/types';

const NOTICE_MS = 4000;
const SAVE_FAILED_NOTICE = 'No se pudo guardar el cambio. Inténtalo de nuevo.';

interface DailyTasksContextValue {
  tasks: DailyTask[];
  percent: number;
  pendingIds: ReadonlySet<string>;
  notice: string | null;
  toggle: (taskId: string) => Promise<void>;
}

const DailyTasksContext = createContext<DailyTasksContextValue | null>(null);

export function useDailyTasks(): DailyTasksContextValue {
  const value = useContext(DailyTasksContext);
  if (!value) throw new Error('useDailyTasks debe usarse dentro de <TasksProvider>');
  return value;
}

/**
 * Holds today's tasks in client state so the checklist and the progress ring (which sit in
 * different parts of the dashboard) always agree, and both update the moment a box is
 * checked, without reloading the page.
 */
export function TasksProvider({
  initialTasks,
  children,
}: {
  initialTasks: DailyTask[];
  children: React.ReactNode;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function toggle(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    // One save at a time per task, so rapid clicks can't race each other.
    if (!task || pendingIds.has(taskId)) return;

    const update = taskCompletionUpdate(!task.completed);
    setNotice(null);
    setPendingIds((ids) => new Set(ids).add(taskId));
    // Optimistic: the box and the ring change immediately.
    setTasks((all) => all.map((t) => (t.id === taskId ? { ...t, ...update } : t)));

    let saved = false;
    try {
      saved = await saveTaskCompletion(createClient(), taskId, update);
    } catch {
      saved = false;
    }

    if (!saved) {
      // Put the box (and so the ring) back exactly as it was.
      setTasks((all) =>
        all.map((t) =>
          t.id === taskId ? { ...t, completed: task.completed, completed_at: task.completed_at } : t
        )
      );
      setNotice(SAVE_FAILED_NOTICE);
    }
    setPendingIds((ids) => {
      const next = new Set(ids);
      next.delete(taskId);
      return next;
    });
  }

  return (
    <DailyTasksContext.Provider
      value={{ tasks, percent: completionPercent(tasks), pendingIds, notice, toggle }}
    >
      {children}
    </DailyTasksContext.Provider>
  );
}

/** The short instruction under the "Tus tareas de hoy" title. Only when there are tasks. */
export function TaskListHint() {
  const { tasks } = useDailyTasks();
  if (tasks.length === 0) return null;
  return (
    <p className="mt-1 text-sm text-parchment/70">
      <span aria-hidden="true" className="mr-1.5 text-brass">
        →
      </span>
      Toca una tarea cuando la completes.
    </p>
  );
}

export function TaskList() {
  const { tasks, pendingIds, notice, toggle } = useDailyTasks();

  if (tasks.length === 0) {
    return <p className="text-sm text-mist">Tus tareas llegan con tu mensaje de hoy.</p>;
  }

  return (
    <>
      <ul className="-my-3 flex flex-col gap-1">
        {tasks.map((task) => {
          const pending = pendingIds.has(task.id);
          return (
            <li key={task.id}>
              <label
                className={`-mx-3 flex min-h-11 select-none items-start gap-3.5 rounded-lg px-3 py-3 transition-colors ${
                  pending ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-rule/40 active:bg-rule/70'
                }`}
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  disabled={pending}
                  onChange={() => toggle(task.id)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brass peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-dusk-2 ${
                    task.completed ? 'border-brass bg-brass' : 'border-brass/60 bg-transparent'
                  }`}
                >
                  {task.completed && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[15px] leading-relaxed transition-colors ${
                    task.completed ? 'text-mist line-through' : 'text-parchment'
                  }`}
                >
                  {task.description}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {notice && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {notice}
        </p>
      )}
    </>
  );
}
