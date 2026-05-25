/**
 * Minimal mock of the Canvas LMS API for offline e2e runs.
 *
 * The app's main process validates its token against `${baseUrl}/api/v1/users/self`
 * on startup (CanvasClient.validateToken). That's the only call we must satisfy to
 * reach a "connected" main UI. Every other Canvas endpoint returns 503 on purpose:
 * if a stray auto-sync ever fires, the sync aborts on the error instead of treating
 * an empty 200 as "Canvas has no courses" and pruning the seeded local data.
 */
import http from 'http';
import type { AddressInfo } from 'net';

export interface MockCanvas {
  url: string;
  close: () => Promise<void>;
}

export async function startMockCanvas(): Promise<MockCanvas> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && url.startsWith('/api/v1/users/self')) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          id: 1,
          name: 'E2E Test User',
          login_id: 'e2e@test.local',
          email: 'e2e@test.local',
        })
      );
      return;
    }

    res.statusCode = 503;
    res.end(JSON.stringify({ errors: [{ message: 'e2e mock: endpoint not served' }] }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
