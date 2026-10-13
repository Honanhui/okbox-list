export function retryDelay(failures) {
  return Math.min(300000, 30000 * 2 ** Math.min(4, Math.max(0, failures - 1)));
}
export function refreshDue(status, now, minutes) {
  if (status?.state === 'refreshing') return false;
  if (['error', 'stale'].includes(status?.state))
    return now >= (status.nextRetryAt || (Date.parse(status.fetchedAt) || 0) + retryDelay(status.failureCount || 1));
  return now - (Date.parse(status?.fetchedAt) || 0) >= Math.min(minutes, 5) * 60000;
}
