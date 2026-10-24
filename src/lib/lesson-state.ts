import { LessonRow, Stage, STAGES } from "./types";

/** Длительность этапов в секундах. null — без таймера (учитель переключает сам). */
export const STAGE_SECONDS: Record<Stage, number | null> = {
  explain: null,
  test: 5 * 60,
  tasks: 15 * 60,
  retell: 3 * 60,
  board: null,
  review: null,
  done: null,
};

/** Длительность этапа: настройка учителя, иначе значение по умолчанию. */
export function stageBaseSec(l: LessonRow, stage: Stage = l.stage): number | null {
  const d = l.stage_durations?.[stage];
  return d === undefined ? STAGE_SECONDS[stage] : d;
}

export const GRACE_MS = 3000; // допуск на сетевую задержку при отправке

export interface Clock {
  stage: Stage;
  durationSec: number | null;
  remainingSec: number | null;
  remainingMs: number | null;
  running: boolean;
  paused: boolean;
  expired: boolean;
  serverNow: number;
}

/** Единственный источник правды о времени этапа — сервер. */
export function clock(l: LessonRow, now = Date.now()): Clock {
  const base = stageBaseSec(l);
  const paused = !!l.paused_at;
  if (base == null || !l.stage_started_at) {
    return {
      stage: l.stage,
      durationSec: base,
      remainingSec: base,
      remainingMs: base == null ? null : base * 1000,
      running: l.status === "live" && !paused,
      paused,
      expired: false,
      serverNow: now,
    };
  }
  const total = (base + (l.stage_extra_sec || 0)) * 1000;
  const ref = paused ? Date.parse(l.paused_at as string) : now;
  const elapsed = ref - Date.parse(l.stage_started_at) - Number(l.paused_total_ms || 0);
  const remaining = total - elapsed;
  return {
    stage: l.stage,
    durationSec: total / 1000,
    remainingSec: Math.max(0, Math.ceil(remaining / 1000)),
    remainingMs: remaining,
    running: l.status === "live" && !paused,
    paused,
    expired: remaining <= 0,
    serverNow: now,
  };
}

/** Можно ли сейчас принимать работу ученика на этом этапе. */
export function acceptsWork(l: LessonRow, stage: Stage, graceMs = GRACE_MS): boolean {
  if (l.status !== "live" || l.stage !== stage || l.paused_at) return false;
  const c = clock(l);
  if (c.remainingMs == null) return true;
  return c.remainingMs > -graceMs;
}

export const stageIndex = (s: Stage) => STAGES.indexOf(s);
export const nextStage = (s: Stage): Stage | null => STAGES[stageIndex(s) + 1] ?? null;
