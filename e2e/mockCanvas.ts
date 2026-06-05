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

export interface MockCanvasOptions {
  /** Test-only mode: serve enough Canvas endpoints for a manual sync pull. */
  serveCurrentTermSync?: boolean;
}

const CURRENT_TERM_ID = 990001;

function isoOffsetDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function startMockCanvas(
  options: MockCanvasOptions = {}
): Promise<MockCanvas> {
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

    if (options.serveCurrentTermSync && req.method === 'GET') {
      const now = new Date();
      const currentTerm = {
        id: CURRENT_TERM_ID,
        name: 'E2E Extended Current Term',
        start_at: isoOffsetDays(now, -90),
        end_at: isoOffsetDays(now, 180),
      };

      if (url.startsWith('/api/v1/courses?') || url === '/api/v1/courses') {
        res.statusCode = 200;
        res.end(
          JSON.stringify([
            {
              id: 91001,
              name: 'E2E Sync Pull Course',
              course_code: 'E2ESYNC',
              enrollment_term_id: CURRENT_TERM_ID,
              default_view: 'modules',
              syllabus_body: '<p>E2E sync pull syllabus.</p>',
              term: currentTerm,
              enrollments: [{ type: 'student', computed_current_score: null }],
            },
          ])
        );
        return;
      }

      if (
        url.includes('/assignments') ||
        url.includes('/discussion_topics') ||
        url.includes('/modules') ||
        url.includes('/pages') ||
        url.includes('/folders') ||
        url.includes('/files') ||
        url.includes('/assignment_groups')
      ) {
        res.statusCode = 200;
        res.end(JSON.stringify([]));
        return;
      }
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
