# CLAUDE.md - Project Guidelines

> Canvas Integration Dashboard (CID) - Offline-first academic command center for Canvas LMS

## 1. Stack Boundaries (Negative Constraints)

### Runtime
- **Node.js:** 20.x required (see `.nvmrc`). Electron 34 bundles Node 20.18.1 - using a different version causes native module ABI mismatches with `better-sqlite3`.
- **TypeScript:** 5.7+ with `strict: true`. NO `any` without explicit comment.
- **Electron:** 34.x. Main process is CommonJS, renderer is ESM via Vite.

```bash
# Before development, ensure correct Node version:
nvm use        # Reads .nvmrc automatically
npm rebuild    # Rebuild native modules if switching versions
```

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

## 7. Mandatory Testing Protocol (ENFORCED)

> **CRITICAL**: All agents modifying code MUST follow this protocol. Failure to run tests is a blocking error.

### Before ANY Code Change
```bash
# 1. Run baseline tests for affected layer
npm test -- --testPathPattern=l{N}-{layer}

# 2. Record baseline: "X passing, Y failing, Z skipped"
```

### After Code Changes
```bash
# 1. Build must succeed
npm run build

# 2. Run tests - failures MUST NOT increase
npm test -- --testPathPattern=l{N}-{layer}

# 3. Run full test suite before committing
npm test
```

### Test Requirements by Change Type

| Change Type | Test Requirement |
|-------------|------------------|
| New public method | MUST write unit test |
| Bug fix | MUST write regression test |
| Behavior change | MUST update existing tests |
| New file | MUST create corresponding test file |
| Refactor | Tests MUST still pass |

### Test File Locations
```
tests/
  l0-utilities/       # ServiceRegistry.test.ts, Logger.test.ts, etc.
  l1-persistence/     # Database.test.ts, MigrationRunner.test.ts
  l2-daemon/          # SyncEngine.test.ts, RateLimiter.test.ts
  l3-intelligence/    # PriorityEngine.test.ts, PolicyEvaluator.test.ts
    domain/           # PriorityCalculator.test.ts (pure function tests)
  l4-controller/      # CommandDispatcher.test.ts, commands/*.test.ts
  l5-presentation/    # store.test.ts
  integration/        # Cross-layer integration tests
```

### Coverage Targets
| Component Type | Target |
|----------------|--------|
| Domain services (pure functions) | 90% branch coverage |
| Orchestrators / Controllers | 70% branch coverage |
| UI Components | 50% branch coverage |

### L3 Intelligence Layer Specific Rules

Due to critical priority calculation bugs, L3 has additional requirements:

1. **NEVER** modify L3 without reading existing tests first
2. **ALWAYS** run `npm test -- --testPathPattern=l3-intelligence` before AND after changes
3. **VERIFY** ServiceRegistry initializes L3 services correctly
4. **CHECK** IPC contract if adding/removing L3 exports

### Missing Tests (Must Create)
- [ ] `tests/l0-utilities/ServiceRegistry.test.ts`
- [ ] `tests/l3-intelligence/domain/GradeCalculationService.test.ts`
- [ ] `tests/l3-intelligence/domain/GraceTokenService.test.ts`
- [ ] `tests/l3-intelligence/domain/PriorityCalculator.test.ts`
- [ ] `tests/l3-intelligence/orchestration/PriorityOrchestrator.test.ts`

### Agent Workflow Summary

```
1. Read existing tests for affected files
2. Run baseline: npm test -- --testPathPattern={layer}
3. Make code changes
4. Write/update tests for changes
5. Run: npm run build
6. Run: npm test -- --testPathPattern={layer}
7. Verify: failures did not increase
8. Run: npm test (full suite)
9. Only then: commit changes
```

**If tests fail after your changes**: FIX THE CODE OR TESTS. Do not commit failing tests.
