# CLAUDE.md - Project Guidelines

> Canvas Integration Dashboard (CID) - Offline-first academic command center for Canvas LMS

## 1. Stack Boundaries (Negative Constraints)

### Runtime
- **Node.js:** 20.x required. NO Node 18 or earlier.
- **TypeScript:** 5.7+ with `strict: true`. NO `any` without explicit comment.
- **Electron:** 34.x. Main process is CommonJS, renderer is ESM via Vite.

### Forbidden Libraries
- NO `fetch` - use `axios` (already configured with rate limiting)
- NO `sqlite3` - use `better-sqlite3` (synchronous API, WAL mode)
- NO Redux/MobX - use `zustand` for state management
- NO Express/Fastify - this is Electron, not a web server
- NO `console.log` in production code - use `Logger` class with PII redaction
- NO `fs.promises` in main process hot paths - use sync APIs for <1ms latency

### Version Locks (from package.json)
| Package | Version | Constraint |
|---------|---------|------------|
| react | ^18.3.1 | No React 19 |
| zustand | ^5.0.2 | v5 API only |
| better-sqlite3 | ^11.7.0 | Native bindings |
| zod | ^4.3.5 | v4 schema syntax |
| electron | ^34.0.0 | contextIsolation required |

## 2. Architectural Invariants

### 7-Layer Structure
```
src/layers/
  l0-utilities/   # Logger, SystemMonitor, AppConfig, CredentialManager, HealthCheck
  l1-persistence/ # Database, MigrationRunner (SQLite WAL)
  l2-daemon/      # CanvasClient, SyncEngine, RateLimiter, CircuitBreaker
  l3-intelligence/# PriorityEngine, PolicyEvaluator, RefreshScheduler
  l4-controller/  # CommandDispatcher, commands/*
  l5-presentation/# Zustand store, viewModels/*
  l6-ui/          # React components (App.tsx, components/*)
```

### Layer Communication Rules
1. **Unidirectional flow:** L6 -> L5 -> L4 -> L3/L2/L1 -> L0
2. **No upward imports:** L1 cannot import from L2+
3. **Events for cross-layer:** Use `EventEmitter` for L1 commit notifications
4. **IPC boundary:** L5/L6 (renderer) communicates with L0-L4 (main) via `preload.ts`

### File Placement Rules
- All SQL migrations: `src/layers/l1-persistence/migrations/*.sql`
- All command classes: `src/layers/l4-controller/commands/*Command.ts`
- All view models: `src/layers/l5-presentation/viewModels/*ViewModel.ts`
- All React components: `src/layers/l6-ui/components/{Section}/*.tsx`
- Tests mirror src: `tests/l{N}-{layer}/*.test.ts`

### Index Export Convention
Each layer has `index.ts` that re-exports public API:
```typescript
// src/layers/l0-utilities/index.ts
export { Logger, ComponentLogger } from './Logger';
export { SystemMonitor } from './SystemMonitor';
export type { LoggerOptions, LogLevel } from './Logger';
```

## 3. Operational Command Map

| Action | Command | Notes |
|--------|---------|-------|
| Dev (full) | `npm run dev` | Runs main + renderer concurrently |
| Dev (main only) | `npm run dev:main` | TypeScript watch mode |
| Dev (renderer only) | `npm run dev:renderer` | Vite dev server :5173 |
| Build | `npm run build` | tsc + vite build |
| Test | `npm test` | Jest, all tests |
| Test (watch) | `npm run test:watch` | Jest watch mode |
| Lint | `npm run lint` | ESLint on src/**/*.{ts,tsx} |
| Format | `npm run format` | Prettier write |
| Package (all) | `npm run package` | electron-builder |
| Package (mac) | `npm run package:mac` | macOS only |

### Test File Naming
- Unit tests: `tests/l{N}-{layer}/{ClassName}.test.ts`
- Integration tests: `tests/integration/*.test.ts` (if created)

## 4. Code Style & Patterns

### Class-Based Services
All L0-L4 services use ES6 classes with:
- Constructor accepting config object with defaults
- EventEmitter inheritance for observable state
- Explicit `close()`/`stop()` methods for cleanup

```typescript
export class RateLimiter extends EventEmitter {
  private readonly maxConcurrent: number;

  constructor(config: RateLimiterConfig = {}) {
    super();
    this.maxConcurrent = config.maxConcurrent ?? 3;
  }

  stop(): void { /* cleanup */ }
}
```

### Configuration Pattern
- Define interface with optional properties
- Provide `DEFAULT_*` constants
- Merge in constructor: `{ ...DEFAULTS, ...config }`

### Database Operations
- Use `Database.upsert()` for idempotent writes
- Always specify `tableName` in `executeWrite()` to emit commit events
- Wrap multi-step operations in `transaction()`

### State Management (L5)
- Zustand with `devtools` + `subscribeWithSelector` middleware
- Optimistic updates after successful IPC calls
- Selectors exported separately from store

### React Components (L6)
- Functional components only (no class components)
- Use `react-window` for lists >50 items
- Use `react-hotkeys-hook` for keyboard shortcuts

### Error Handling
- Wrap async operations in try/catch
- Log errors via `Logger.error(message, error)`
- Emit error events for parent components to handle

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `RateLimiter` |
| Interfaces | PascalCase | `RateLimiterConfig` |
| Functions | camelCase | `calculateBackoff` |
| Constants | UPPER_SNAKE | `DEFAULT_CACHE_SIZE_KB` |
| Files | PascalCase.ts | `RateLimiter.ts` |
| Test files | PascalCase.test.ts | `RateLimiter.test.ts` |

## 5. Performance Constraints

| Metric | Target | Enforcement |
|--------|--------|-------------|
| Memory (RSS) | <300MB peak | V8 heap limit |
| Write latency | <1ms | WAL mode + NORMAL sync |
| UI frame rate | 60fps | react-window virtualization |
| API rate limit | 3 concurrent | RateLimiter queue |

### SQLite Pragmas (auto-configured)
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;  -- 64MB
PRAGMA mmap_size = 268435456; -- 256MB
```

## 6. Security Rules

- **Never log:** API tokens, Bearer headers, email addresses (auto-redacted by Logger)
- **Credential storage:** Use `keytar` via `CredentialManager` (OS keychain)
- **Context isolation:** Electron `contextIsolation: true` enforced
- **No `nodeIntegration`:** All IPC through `preload.ts` context bridge
