# 0004 — HashRouter for the Electron `file://` renderer

Status: Accepted

## Context

In production the renderer is loaded from a bundled file (`dist/renderer/index.html`) via
the `file://` protocol, not from an HTTP server. React Router's `BrowserRouter` relies on
the HTML5 history API and real URL paths, which don't work under `file://` (path-based
routes 404 / can't resolve).

## Decision

Use **`HashRouter`** in `src/layers/l6-ui/App.tsx`. Routes are hash-based, e.g.
`#/course/:id`, `#/announcement/:id`. In dev the renderer is served by Vite on
`http://localhost:5173`, but HashRouter is used in both modes for consistency.

## Consequences

- Routes are addressable as `…/index.html#/course/123`. Deep-linking and programmatic
  navigation use the hash (e.g. tests set `location.hash = '#/course/123'`).
- URL-param passing across navigations is less ergonomic than with BrowserRouter; some
  flows pass state via router state instead of query params (see notes in `CourseDetail`).
- If the renderer ever moves to an HTTP(S) origin in production, revisit this decision.
