import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bot as BotIcon, Check, ListTodo, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { api, openThread, useStore } from "@/state/store";
import { useShowThreads } from "@/lib/thread-preferences";
import { useCaptionChrome } from "@/components/DesktopCapabilities";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { BOARD_STATUSES, type BoardRunning, type BoardSnapshot, type BoardStatus, type BoardTask } from "../../shared/board";

const COLUMN_TITLE: Record<BoardStatus, LocaleKey> = { todo: "board.column.todo", doing: "board.column.doing", done: "board.column.done" };
const RUNNING_STATE: Record<BoardRunning["state"], LocaleKey> = { queued: "board.running.queued", running: "board.running.running", waiting: "board.running.waiting" };

export function TaskBoardPage() {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const { dragProps } = useCaptionChrome();
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // `background`: the 3-second poll, which never wakes a Cloud home that went to sleep.
  const refresh = useCallback(async (background = false) => {
    try {
      setSnapshot(await api("/api/board", background ? { background } : undefined));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const run = async (request: Promise<unknown>) => {
    try {
      await request;
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await refresh();
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    void run(api("/api/board", { method: "POST", body: JSON.stringify({ title }) }));
  };
  const edit = (task: BoardTask, change: { title?: string; status?: BoardStatus }) =>
    void run(api(`/api/board/${task.id}`, { method: "PATCH", body: JSON.stringify({ ...change, revision: task.revision }) }));
  const remove = (task: BoardTask) => void run(api(`/api/board/${task.id}`, { method: "DELETE" }));
  const open = (botId: string, threadId: string) => openThread(dispatch, { botId, threadId }, state, showThreads);

  const tasks = snapshot?.tasks ?? [];
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app text-ink">
      <header {...dragProps} className="flex shrink-0 items-center gap-2.5 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
        <ListTodo size={18} className="text-ink-secondary" />
        <h1 className="text-[17px] font-semibold">{t("board.title")}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error && <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
        {!snapshot && !error && <Loader2 size={18} className="animate-spin text-ink-tertiary" />}
        {snapshot && <RunningSection running={snapshot.running} onOpen={open} />}
        <form onSubmit={add} className="mb-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            placeholder={t("board.add.placeholder")}
            className="min-w-0 flex-1 rounded-lg border border-hairline/60 bg-card px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={!draft.trim()} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40">
            <Plus size={14} />{t("board.add.button")}
          </button>
        </form>
        <div className="grid gap-4 md:grid-cols-3">
          {BOARD_STATUSES.map((status) => (
            <section key={status} className="min-w-0">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
                {t(COLUMN_TITLE[status])} <span className="text-ink-tertiary">{tasks.filter((task) => task.status === status).length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {tasks.filter((task) => task.status === status).map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={edit} onRemove={remove} onOpen={open} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function RunningSection({ running, onOpen }: { running: BoardRunning[]; onOpen: (botId: string, threadId: string) => void }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">{t("board.running.title")}</h2>
      {running.length === 0 ? (
        <p className="text-[13px] text-ink-tertiary">{t("board.running.empty")}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {running.map((work) => (
            <button
              key={work.id}
              onClick={() => onOpen(work.botId, work.threadId)}
              className="flex items-center gap-3 rounded-xl border border-hairline/40 bg-card px-3 py-2 text-left transition hover:bg-raised/50"
            >
              <Loader2 size={14} className={cn("shrink-0 text-accent", work.state === "running" && "animate-spin")} />
              <span className="min-w-0 flex-1 truncate text-[13px]">{work.title}</span>
              <span className="shrink-0 text-[12px] text-ink-secondary">
                {work.fromBotName ? t("board.running.handedBy", { bot: work.botName, from: work.fromBotName }) : work.botName}
                {" · "}{t(RUNNING_STATE[work.state])}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface TaskCardProps {
  task: BoardTask;
  onEdit: (task: BoardTask, change: { title?: string; status?: BoardStatus }) => void;
  onRemove: (task: BoardTask) => void;
  onOpen: (botId: string, threadId: string) => void;
}

function TaskCard({ task, onEdit, onRemove, onOpen }: TaskCardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const bot = task.owner?.kind === "bot" ? task.owner : undefined;
  const done = task.status === "done";
  const save = () => {
    const title = editing?.trim();
    if (title && title !== task.title) onEdit(task, { title });
    setEditing(null);
  };
  return (
    <article className="group rounded-xl border border-hairline/40 bg-card px-3 py-2.5">
      <div className="flex items-start gap-2">
        <button
          aria-label={done ? t("board.task.reopen") : t("board.task.complete")}
          onClick={() => onEdit(task, { status: done ? "todo" : "done" })}
          className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border", done ? "border-accent bg-accent text-white" : "border-hairline")}
        >
          {done && <Check size={11} />}
        </button>
        {editing !== null ? (
          <input
            autoFocus
            value={editing}
            maxLength={200}
            onChange={(event) => setEditing(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(null);
            }}
            className="min-w-0 flex-1 rounded border border-accent bg-app px-1.5 text-[13px] outline-none"
          />
        ) : (
          <p className={cn("min-w-0 flex-1 break-words text-[13px]", done && "text-ink-tertiary line-through")}>{task.title}</p>
        )}
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {task.status === "todo" && (
            <button aria-label={t("board.task.start")} onClick={() => onEdit(task, { status: "doing" })} className="text-ink-tertiary hover:text-ink"><ListTodo size={13} /></button>
          )}
          {bot && task.status === "doing" && (
            <button aria-label={t("board.task.unclaim")} onClick={() => onEdit(task, { status: "todo" })} className="text-ink-tertiary hover:text-ink"><X size={13} /></button>
          )}
          <button aria-label={t("board.task.edit")} onClick={() => setEditing(task.title)} className="text-ink-tertiary hover:text-ink"><Pencil size={13} /></button>
          <button aria-label={t("board.task.delete")} onClick={() => onRemove(task)} className="text-ink-tertiary hover:text-danger"><Trash2 size={13} /></button>
        </div>
      </div>
      {task.note && <p className="mt-1 whitespace-pre-wrap pl-6 text-[12px] text-ink-secondary">{task.note}</p>}
      {bot && (
        <div className="mt-2 pl-6">
          <button
            onClick={() => bot.threadId && onOpen(bot.botId, bot.threadId)}
            disabled={!bot.threadId}
            className="flex items-center gap-1 text-[12px] text-accent disabled:text-ink-secondary"
          >
            <BotIcon size={12} />{bot.name}
          </button>
          {task.progress !== undefined && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline/40">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${task.progress}%` }} />
              </div>
              <span className="text-[11px] tabular-nums text-ink-secondary">{task.progress}%</span>
            </div>
          )}
          {task.progressNote && <p className="mt-1 text-[12px] text-ink-secondary">{task.progressNote}</p>}
        </div>
      )}
    </article>
  );
}
