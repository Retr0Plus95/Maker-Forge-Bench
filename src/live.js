// Auto-refresh (design §7.9): listens to dev.py's change events. EventSource reconnects by itself.

/**
 * @param {{ onChange(path: string, mtime: number): void, onRemove(path: string): void,
 *           onStatus(state: 'live' | 'paused'): void }} handlers
 */
export function connectLive({ onChange, onRemove, onStatus }) {
  const source = new EventSource('/api/events');
  source.addEventListener('open', () => onStatus('live'));
  source.addEventListener('error', () => onStatus('paused'));
  source.addEventListener('change', (e) => {
    const data = JSON.parse(e.data);
    onChange(data.path, data.mtime);
  });
  source.addEventListener('remove', (e) => onRemove(JSON.parse(e.data).path));
  return { close: () => source.close() };
}
