# Canvas Integration Dashboard - Development Setup

This guide will help you set up the development environment for the Canvas Integration Dashboard.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: 18.x LTS or later ([Download](https://nodejs.org/))
- **npm**: 9.x or later (comes with Node.js)
- **Git**: Latest version
- **VS Code**: Recommended IDE ([Download](https://code.visualstudio.com/))

### Verify Prerequisites

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
git --version   # Should show 2.x.x or higher
```

---

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/MorrisXDS/CanvasAssistant.git
cd CanvasAssistant
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages listed in `package.json`.

**Expected output:**
- ~450 packages installed
- No vulnerabilities (or only low-severity)
- Total time: 1-3 minutes

### 3. Verify Installation

```bash
# Check TypeScript compiler
npx tsc --version

# Check ESLint
npx eslint --version

# Check Prettier
npx prettier --version
```

---

## Project Structure

After setup, your directory should look like this:

```
CanvasAssistant/
├── DevDocs/              # Developer documentation
├── src/
│   ├── layers/
│   │   ├── l0-utilities/
│   │   ├── l1-persistence/
│   │   ├── l2-daemon/
│   │   ├── l3-intelligence/
│   │   ├── l4-controller/
│   │   ├── l5-presentation/
│   │   └── l6-ui/
│   └── types/
├── tests/
├── logs/                 # Winston log output (created on first run)
├── dist/                 # Build output (created by tsc)
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
└── README.md
```

---

## Development Workflow

### Running the App in Development Mode

```bash
npm run dev
```

This will:
1. Start TypeScript compiler in watch mode
2. Start Vite dev server for the renderer process
3. Launch Electron app with hot-reload enabled

**Access:**
- App window opens automatically
- DevTools enabled by default
- React DevTools available

### Building for Production

```bash
npm run build
```

This compiles TypeScript and bundles the renderer process.

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Format all files with Prettier
npm run format
```

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

---

## Next Steps for Developers

### Week 1 Milestone 1.1: Environment Setup (You are here! ✅)

You've completed:
- ✅ Cloned repository
- ✅ Installed dependencies
- ✅ Verified project structure

### Week 1 Milestone 1.2: Layer 0 - Utilities

**What to build:**
1. `src/layers/l0-utilities/Logger.ts` - Winston logger with PII redaction
2. `src/layers/l0-utilities/SystemMonitor.ts` - Battery/focus monitoring

**How to start:**
1. Read `DevDocs/PROJECT_SCAFFOLDING.md` section on L0 Utilities
2. Read `DevDocs/ARCHITECTURE_DIAGRAM.md` Layer 0 responsibilities
3. Create the files listed above using the templates in PROJECT_SCAFFOLDING.md
4. Write unit tests in `tests/l0-utilities/`

**Success criteria:**
- Logger writes to `logs/cid.log`
- SystemMonitor polls max once per 5 seconds
- Tests pass with `npm test`

### Week 1 Milestone 1.3: Layer 1 - Persistence

**What to build:**
1. `src/layers/l1-persistence/Database.ts` - SQLite wrapper
2. `src/layers/l1-persistence/migrations/001_initial.sql` - Schema creation

**Reference docs:**
- `DevDocs/PROJECT_SCAFFOLDING.md` (Database.ts template)
- `DevDocs/CID_Implementation_Plan_v4.0.md` Part II (Schema)
- `DevDocs/MVP_IMPLEMENTATION_ROADMAP.md` Week 1

**Success criteria:**
- SQLite database initializes with WAL mode
- All 7 tables created
- Write latency < 1ms (measure with `PRAGMA`)

---

## VS Code Setup (Recommended)

### Install Extensions

1. **ESLint** (dbaeumer.vscode-eslint)
2. **Prettier** (esbenp.prettier-vscode)
3. **SQLite Viewer** (alexcvzz.vscode-sqlite)
4. **TypeScript + ES6 Snippets** (standard.vscode-ts-js-snippets)

### Workspace Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## Troubleshooting

**📖 For comprehensive build error fixes and dependency issues, see:**
`DevDocs/milestones/week1/MILESTONE_1.1_FIXES.md`

### `npm install` fails with "Permission denied"

**macOS/Linux:**
```bash
sudo chown -R $USER ~/.npm
sudo chown -R $USER ~/CanvasAssistant/node_modules
npm install
```

**Windows:**
Run terminal as Administrator and retry.

### `better-sqlite3` installation fails

This package requires native compilation.

**macOS:**
```bash
xcode-select --install
npm rebuild better-sqlite3
```

**Windows:**
- Install Visual Studio Build Tools
- Retry `npm install`

**Linux:**
```bash
sudo apt-get install build-essential python3
npm rebuild better-sqlite3
```

### TypeScript errors on first build

This is normal if source files don't exist yet. As you create files following the roadmap, errors will resolve.

### Electron app won't launch

Ensure you've built at least once:
```bash
npm run build
npm run dev
```

---

## Getting Help

- **Architecture questions:** See `DevDocs/ARCHITECTURE_DIAGRAM.md`
- **Week-by-week milestones:** See `DevDocs/MVP_IMPLEMENTATION_ROADMAP.md`
- **File templates:** See `DevDocs/PROJECT_SCAFFOLDING.md`
- **Bug reports:** GitHub Issues
- **Team chat:** [Add your Slack/Discord link]

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development mode |
| `npm run build` | Build for production |
| `npm test` | Run all tests |
| `npm run lint` | Check code quality |
| `npm run format` | Format all files |
| `npm run package` | Create distributable app |

---

**Ready to start coding?**

Go to `DevDocs/MVP_IMPLEMENTATION_ROADMAP.md` and begin **Week 1 Milestone 1.2** (Layer 0 - Utilities).

Good luck! 🚀
