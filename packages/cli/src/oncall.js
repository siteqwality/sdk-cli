import { AuthenticatedClient, isUuid } from './api.js';

const DAY_MS = 86_400_000;
const uuid = (id, name) => {
  if (!isUuid(id)) throw new Error(`A valid ${name} UUID is required`);
  return id;
};
const instant = (value, name) => {
  if (value === undefined) return undefined;
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(ms))
    throw new Error(`${name} must be an RFC 3339 time, for example 2026-10-21T09:00:00Z`);
  return new Date(ms).toISOString();
};
const query = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export class OnCallClient extends AuthenticatedClient {
  /** Who is on call now (or at `at`): one schedule with its next shift, or every schedule. */
  onCallNow({ scheduleId, at } = {}) {
    const when = instant(at, 'at');
    if (scheduleId === undefined) return this.accountApi(`/on_call${query({ since: when })}`);
    uuid(scheduleId, 'schedule');
    return this.accountApi(`/on_call_schedule/${scheduleId}/on_call${query({ at: when })}`);
  }
  /** A schedule's shifts, gaps included; the API allows at most 90 days. */
  listShifts(scheduleId, { since, until } = {}) {
    uuid(scheduleId, 'schedule');
    const range = { since: instant(since, 'since'), until: instant(until, 'until') };
    return this.accountApi(`/on_call_schedule/${scheduleId}/shifts${query(range)}`);
  }
  /** One member's shifts across every schedule, from now for 14 days unless given. */
  listMemberShifts(userId, { since, until } = {}) {
    uuid(userId, 'member');
    const start = instant(since, 'since') ?? new Date().toISOString();
    const end = instant(until, 'until') ?? new Date(Date.parse(start) + 14 * DAY_MS).toISOString();
    return this.accountApi(`/on_call${query({ user_id: userId, since: start, until: end })}`);
  }
}
