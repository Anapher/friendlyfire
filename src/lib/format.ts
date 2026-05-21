export function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined) {
    return "-";
  }
  return `€${(cents / 100).toFixed(2)}`;
}

export function userLabel(user?: { name: string } | null) {
  return user?.name ?? "-";
}

export function dateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function formatRelativeTime(date: Date, now: Date = new Date()) {
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / 60_000);
  if (minutes < 60) {
    return diffMs >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}
