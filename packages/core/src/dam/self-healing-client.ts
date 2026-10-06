// A client that replaces itself after a connection timeout. The asset proxy's S3 client sometimes ends up in a state where
// every new connection times out after connectionTimeout (5 s), while a fresh process reaches the same store in a few ms
// (seen on the WSL2 development setup on 2026-09-21, twice on 2026-10-06; keepAlive: false did not prevent it). Restarting
// the process cured it only because that throws the client away. Doing it on the first timeout makes the proxy repair
// itself: the failed call is repeated once on a new client, and a second failure is reported as it is.
export interface SendClient {
  send: (...args: any[]) => Promise<any>;
  destroy?: () => void;
}

/** A timeout while connecting or waiting for the store (AWS SDK `TimeoutError`, or the socket's ETIMEDOUT). */
export function isConnectTimeout(err: unknown): boolean {
  const e = err as { name?: string; code?: string; message?: string } | null;
  return e?.name === 'TimeoutError' || e?.code === 'ETIMEDOUT' || /did not establish a connection|connect ETIMEDOUT/i.test(e?.message ?? '');
}

/**
 * `send` of the returned object behaves like the client's own; after a connection timeout the client is rebuilt with
 * `factory` (the old one is destroyed) and the call is repeated once. Calls that fail at the same moment rebuild it once.
 * `onHeal` is told about each rebuild (log it).
 */
export function createSelfHealingClient<C extends SendClient>(factory: () => C, onHeal?: (err: unknown) => void): { send: C['send'] } {
  let client = factory();
  const send = async (...args: any[]): Promise<any> => {
    const used = client;
    try {
      return await used.send(...args);
    } catch (err) {
      if (!isConnectTimeout(err)) throw err;
      if (client === used) {
        client = factory();
        try { used.destroy?.(); } catch { /* the old client is being thrown away anyway */ }
        onHeal?.(err);
      }
      return client.send(...args);
    }
  };
  return { send: send as C['send'] };
}
