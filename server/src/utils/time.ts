import { DateTime } from 'luxon';
import { AppError } from './errors';

export function nowUtc(): Date {
  return DateTime.utc().toJSDate();
}

export function toMysqlUtc(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyy-MM-dd HH:mm:ss.SSS');
}

export function localToUtc(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!dt.isValid) {
    throw new AppError('INVALID_DATETIME', 'Invalid date, time, or timezone.');
  }
  return dt.toUTC().toJSDate();
}

export function utcToIso(date: Date | string | null): string | null {
  if (!date) return null;
  const dt =
    typeof date === 'string'
      ? DateTime.fromSQL(date, { zone: 'utc' })
      : DateTime.fromJSDate(date, { zone: 'utc' });
  return dt.toUTC().toISO();
}

export function assertTimezone(tz: string): string {
  if (!DateTime.now().setZone(tz).isValid) {
    throw new AppError('INVALID_TIMEZONE', 'Invalid timezone.');
  }
  return tz;
}
