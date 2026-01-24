/**
 * ESLint Plugin: cross-platform
 *
 * Custom rules to enforce cross-platform compatibility for Electron apps.
 * Detects platform-specific patterns that may break on Windows, macOS, or Linux.
 */

'use strict';

// Rule: no-hardcoded-path-separator
// Flags hardcoded forward or backslash path separators
const noHardcodedPathSeparator = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded path separators',
      category: 'Cross-Platform Compatibility',
      recommended: true,
    },
    messages: {
      hardcodedSeparator: 'Avoid hardcoded path separator "{{separator}}". Use path.sep or path.join() instead.',
      regexSeparator: 'Avoid regex with hardcoded path separator. Use path.sep for cross-platform compatibility.',
    },
    schema: [],
  },
  create(context) {
    return {
      // Detect .split('/') or .split('\\') or .split("\\\\")
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.name === 'split' &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            if (arg.value === '/' || arg.value === '\\' || arg.value === '\\\\') {
              context.report({
                node: arg,
                messageId: 'hardcodedSeparator',
                data: { separator: arg.value },
              });
            }
          }
        }

        // Detect .replace(/\//g, ...) or .replace(/\\/g, ...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.name === 'replace' &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === 'Literal' && arg.regex) {
            const pattern = arg.regex.pattern;
            // Check for patterns that are just path separators
            if (pattern === '/' || pattern === '\\/' || pattern === '\\\\' || pattern === '\\/') {
              context.report({
                node: arg,
                messageId: 'regexSeparator',
              });
            }
          }
        }
      },
    };
  },
};

// Rule: no-platform-specific-shell
// Flags platform-specific shell commands
const noPlatformSpecificShell = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow platform-specific shell commands',
      category: 'Cross-Platform Compatibility',
      recommended: true,
    },
    messages: {
      windowsOnly: '"{{command}}" is Windows-only. Use Electron shell API (shell.openPath, shell.openExternal) for cross-platform compatibility.',
      macosOnly: '"{{command}}" is macOS-only. Use Electron shell API (shell.openPath, shell.openExternal) for cross-platform compatibility.',
      linuxOnly: '"{{command}}" is Linux-only. Use Electron shell API (shell.openPath, shell.openExternal) for cross-platform compatibility.',
    },
    schema: [],
  },
  create(context) {
    const platformCommands = {
      // Windows-only
      'start': 'windowsOnly',
      'cmd': 'windowsOnly',
      'cmd.exe': 'windowsOnly',
      'powershell': 'windowsOnly',
      'powershell.exe': 'windowsOnly',
      'explorer': 'windowsOnly',
      'explorer.exe': 'windowsOnly',
      // macOS-only
      'open': 'macosOnly',
      'osascript': 'macosOnly',
      'pbcopy': 'macosOnly',
      'pbpaste': 'macosOnly',
      // Linux-only
      'xdg-open': 'linuxOnly',
      'xclip': 'linuxOnly',
      'xsel': 'linuxOnly',
      'gnome-open': 'linuxOnly',
      'kde-open': 'linuxOnly',
    };

    return {
      CallExpression(node) {
        // Check for spawn(), exec(), execSync(), spawnSync()
        const spawnFunctions = ['spawn', 'exec', 'execSync', 'spawnSync', 'execFile', 'execFileSync'];

        if (
          node.callee.type === 'Identifier' &&
          spawnFunctions.includes(node.callee.name) &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            const command = arg.value.toLowerCase();
            for (const [cmd, platform] of Object.entries(platformCommands)) {
              if (command === cmd || command.startsWith(cmd + ' ')) {
                context.report({
                  node: arg,
                  messageId: platform,
                  data: { command: cmd },
                });
                break;
              }
            }
            // Check for 'cmd /c' pattern
            if (command.startsWith('cmd /c') || command.startsWith('cmd.exe /c')) {
              context.report({
                node: arg,
                messageId: 'windowsOnly',
                data: { command: 'cmd /c' },
              });
            }
          }
        }

        // Check for child_process.spawn(), etc.
        if (
          node.callee.type === 'MemberExpression' &&
          spawnFunctions.includes(node.callee.property.name) &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            const command = arg.value.toLowerCase();
            for (const [cmd, platform] of Object.entries(platformCommands)) {
              if (command === cmd || command.startsWith(cmd + ' ')) {
                context.report({
                  node: arg,
                  messageId: platform,
                  data: { command: cmd },
                });
                break;
              }
            }
          }
        }
      },
    };
  },
};

// Rule: no-console-in-main
// Flags console.log/warn/error in main process and layer files
const noConsoleInMain = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow console.log in main process code',
      category: 'Code Quality',
      recommended: true,
    },
    messages: {
      noConsole: 'Avoid console.{{method}}() in production code. Use the Logger class instead.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();

    // Only apply to main process code (main.ts, preload.ts, layers l0-l4)
    // Renderer layers (l5-presentation, l6-ui) use browser console for DevTools
    const isMainProcess = filename.includes('main.ts') ||
                          filename.includes('preload.ts') ||
                          filename.includes('l0-utilities') ||
                          filename.includes('l1-persistence') ||
                          filename.includes('l2-daemon') ||
                          filename.includes('l3-intelligence') ||
                          filename.includes('l4-controller');

    // Exclude test files
    const isTestFile = filename.includes('.test.') ||
                       filename.includes('.spec.') ||
                       filename.includes('/tests/') ||
                       filename.includes('\\tests\\');

    if (!isMainProcess || isTestFile) {
      return {};
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'console' &&
          node.callee.property.type === 'Identifier'
        ) {
          const method = node.callee.property.name;
          if (['log', 'info', 'warn', 'error', 'debug', 'trace'].includes(method)) {
            context.report({
              node,
              messageId: 'noConsole',
              data: { method },
            });
          }
        }
      },
    };
  },
};

// Rule: no-hardcoded-app-paths
// Flags hardcoded platform-specific paths
const noHardcodedAppPaths = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded platform-specific paths',
      category: 'Cross-Platform Compatibility',
      recommended: true,
    },
    messages: {
      macosPath: 'Avoid hardcoded macOS path. Use app.getPath() or path.join(os.homedir(), ...) instead.',
      windowsPath: 'Avoid hardcoded Windows path. Use app.getPath() or path.join(os.homedir(), ...) instead.',
      linuxPath: 'Avoid hardcoded Linux path. Use app.getPath() or path.join(os.homedir(), ...) instead.',
      windowsEnv: 'Avoid Windows-only environment variable "{{var}}". Use app.getPath() for cross-platform compatibility.',
    },
    schema: [],
  },
  create(context) {
    const macosPatterns = [
      /^\/Users\//,
      /^\/Applications\//,
      /^\/Library\//,
      /^~\/Library\//,
    ];

    const windowsPatterns = [
      /^[A-Z]:\\Users\\/i,
      /^[A-Z]:\\Program Files/i,
      /^[A-Z]:\\ProgramData/i,
      /^%APPDATA%/i,
      /^%LOCALAPPDATA%/i,
    ];

    const linuxPatterns = [
      /^~\/\.config\//,
      /^~\/\.local\//,
      /^\/home\//,
      /^\/opt\//,
    ];

    const windowsOnlyEnvVars = ['APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMDATA', 'USERPROFILE'];

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        const value = node.value;

        for (const pattern of macosPatterns) {
          if (pattern.test(value)) {
            context.report({
              node,
              messageId: 'macosPath',
            });
            return;
          }
        }

        for (const pattern of windowsPatterns) {
          if (pattern.test(value)) {
            context.report({
              node,
              messageId: 'windowsPath',
            });
            return;
          }
        }

        for (const pattern of linuxPatterns) {
          if (pattern.test(value)) {
            context.report({
              node,
              messageId: 'linuxPath',
            });
            return;
          }
        }
      },

      MemberExpression(node) {
        // Check for process.env.APPDATA, etc. (without fallback)
        if (
          node.object.type === 'MemberExpression' &&
          node.object.object.type === 'Identifier' &&
          node.object.object.name === 'process' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'env' &&
          node.property.type === 'Identifier' &&
          windowsOnlyEnvVars.includes(node.property.name)
        ) {
          // Check if it's part of a fallback (|| or ??)
          const parent = node.parent;
          const hasFallback =
            parent &&
            (parent.type === 'LogicalExpression' &&
             (parent.operator === '||' || parent.operator === '??'));

          if (!hasFallback) {
            context.report({
              node,
              messageId: 'windowsEnv',
              data: { var: node.property.name },
            });
          }
        }
      },
    };
  },
};

// Rule: require-platform-check
// Warns about platform-specific code that should be documented
const requirePlatformCheck = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require documentation for platform-specific code blocks',
      category: 'Cross-Platform Compatibility',
      recommended: false,
    },
    messages: {
      missingComment: 'Platform-specific code ({{platform}}) should have a comment explaining why it is needed.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      IfStatement(node) {
        // Check for process.platform === 'darwin' | 'win32' | 'linux'
        if (
          node.test.type === 'BinaryExpression' &&
          (node.test.operator === '===' || node.test.operator === '==')
        ) {
          let platformCheck = null;

          // process.platform === 'darwin'
          if (
            node.test.left.type === 'MemberExpression' &&
            node.test.left.object.type === 'Identifier' &&
            node.test.left.object.name === 'process' &&
            node.test.left.property.type === 'Identifier' &&
            node.test.left.property.name === 'platform' &&
            node.test.right.type === 'Literal'
          ) {
            platformCheck = node.test.right.value;
          }

          // 'darwin' === process.platform
          if (
            node.test.right.type === 'MemberExpression' &&
            node.test.right.object.type === 'Identifier' &&
            node.test.right.object.name === 'process' &&
            node.test.right.property.type === 'Identifier' &&
            node.test.right.property.name === 'platform' &&
            node.test.left.type === 'Literal'
          ) {
            platformCheck = node.test.left.value;
          }

          if (platformCheck && ['darwin', 'win32', 'linux', 'freebsd', 'sunos'].includes(platformCheck)) {
            // Check for leading comment
            const comments = sourceCode.getCommentsBefore(node);
            const hasExplanation = comments.some(comment =>
              comment.value.toLowerCase().includes('platform') ||
              comment.value.toLowerCase().includes('macos') ||
              comment.value.toLowerCase().includes('windows') ||
              comment.value.toLowerCase().includes('linux') ||
              comment.value.toLowerCase().includes('darwin') ||
              comment.value.toLowerCase().includes('win32') ||
              comment.value.length > 20 // Assume longer comments explain the why
            );

            if (!hasExplanation) {
              const platformName = {
                darwin: 'macOS',
                win32: 'Windows',
                linux: 'Linux',
                freebsd: 'FreeBSD',
                sunos: 'SunOS',
              }[platformCheck] || platformCheck;

              context.report({
                node: node.test,
                messageId: 'missingComment',
                data: { platform: platformName },
              });
            }
          }
        }
      },
    };
  },
};

// Export the plugin
module.exports = {
  meta: {
    name: 'eslint-plugin-cross-platform',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-path-separator': noHardcodedPathSeparator,
    'no-platform-specific-shell': noPlatformSpecificShell,
    'no-console-in-main': noConsoleInMain,
    'no-hardcoded-app-paths': noHardcodedAppPaths,
    'require-platform-check': requirePlatformCheck,
  },
  configs: {
    recommended: {
      plugins: ['cross-platform'],
      rules: {
        'cross-platform/no-hardcoded-path-separator': 'error',
        'cross-platform/no-platform-specific-shell': 'error',
        'cross-platform/no-console-in-main': 'error',
        'cross-platform/no-hardcoded-app-paths': 'error',
        'cross-platform/require-platform-check': 'warn',
      },
    },
  },
};
