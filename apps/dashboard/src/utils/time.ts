export function formatInTimezone(
  iso: string | null | undefined,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
      ...opts,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function nowLabel(timezone: string): string {
  return formatInTimezone(new Date().toISOString(), timezone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
