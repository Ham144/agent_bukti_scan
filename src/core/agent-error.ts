/** Pesan error dari IPC Electron (unwrap nested Error / Axios). */
export function agentErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.trim();
  const ipcNested = m.match(/:\s*Error:\s*(.+)$/);
  if (ipcNested?.[1]) return ipcNested[1].trim();
  if (/^AxiosError:/i.test(m) || /^Request failed with status code \d+$/i.test(m)) {
    return fallback;
  }
  return m || fallback;
}
