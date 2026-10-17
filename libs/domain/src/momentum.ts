import type { WorkspaceData } from './backup';

// A stable calendar across devices, guest/account switches, and travel.
export const MOMENTUM_TIME_ZONE = 'Asia/Manila';
export interface WorkspaceSnapshot extends WorkspaceData {
  activityDays?: string[];
}

const calendar = new Intl.DateTimeFormat('en-US', {
  timeZone: MOMENTUM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function activityDate(instant: string): string {
  const parts = calendar.formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validateActivityDays(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (day) =>
        typeof day !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ||
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day,
    )
  )
    throw new Error('Saved activity dates could not be read.');
  return [...new Set(value as string[])].sort();
}

// Mutable updatedAt values cannot establish a history of meaningful actions.
export function workspaceActivityDays(data: WorkspaceSnapshot): string[] {
  return [
    ...new Set([
      ...validateActivityDays(data.activityDays),
      ...[...data.applications, ...data.interviews].map((row) =>
        activityDate(row.createdAt),
      ),
    ]),
  ].sort();
}

export function hasMeaningfulChange<
  T extends { createdAt: string; updatedAt: string },
>(previous: T, next: T): boolean {
  return (Object.keys(next) as (keyof T)[]).some(
    (key) =>
      key !== 'createdAt' && key !== 'updatedAt' && previous[key] !== next[key],
  );
}

function offsetDate(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function getMomentum(activityDays: readonly string[], now: string) {
  const today = activityDate(now);
  const active = new Set(activityDays.filter((day) => day <= today));
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = offsetDate(today, -((weekday + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = offsetDate(monday, index);
    return {
      date,
      active: active.has(date),
      today: date === today,
      future: date > today,
    };
  });
  let streak = 0;
  // Today stays open: yesterday's streak is current until this day ends.
  let cursor = active.has(today) ? today : offsetDate(today, -1);
  while (active.has(cursor)) {
    streak++;
    cursor = offsetDate(cursor, -1);
  }
  return {
    streak,
    days,
    activeThisWeek: days.filter((day) => day.active).length,
    hasActivity: active.size > 0,
  };
}
