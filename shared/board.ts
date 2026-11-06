// The task board: a to-do list the person and their bots share, and what bots are running for the person right now.

export const BOARD_STATUSES = ["todo", "doing", "done"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_LIMITS = { title: 200, note: 4000, progressNote: 300, tasks: 500 } as const;

export type BoardActor = { kind: "person" } | { kind: "bot"; botId: string; name: string; threadId?: string };

export interface BoardTask {
  id: string;
  title: string;
  note?: string;
  status: BoardStatus;
  /** Bumped on every change; a write naming an older revision is refused, so two writers never overwrite each other. */
  revision: number;
  createdBy: BoardActor;
  /** Who claimed it. A bot owner reports progress; a person's task has none. */
  owner?: BoardActor;
  /** 0-100, only while a bot owns the task. */
  progress?: number;
  progressNote?: string;
  createdAt: number;
  updatedAt: number;
  doneAt?: number;
}

/** Work a bot is doing right now: a job handed to it, or one of its conversations mid-turn. */
export interface BoardRunning {
  id: string;
  kind: "handoff" | "thread";
  botId: string;
  botName: string;
  threadId: string;
  title: string;
  state: "queued" | "running" | "waiting";
  /** The bot that handed this work on, when another bot did. */
  fromBotName?: string;
  startedAt?: number;
  lastProgressAt?: number;
}

export interface BoardSnapshot {
  tasks: BoardTask[];
  running: BoardRunning[];
}
