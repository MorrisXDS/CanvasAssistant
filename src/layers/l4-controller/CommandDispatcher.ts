/**
 * CommandDispatcher - Routes and executes commands
 *
 * Central dispatcher that:
 * - Registers available commands
 * - Routes command requests to appropriate handlers
 * - Manages the shared command context (db, simulation state)
 * - Emits events for command lifecycle
 */

import { EventEmitter } from 'events';
import {
  Command,
  CommandContext,
  CommandResult,
  SimulationContext,
  createSimulationContext,
} from './types';
import { Database, VisibleDataProvider } from '../l1-persistence';
import { SimulationManager } from './SimulationManager';
import { ILogger, createTimer, createNoopLogger } from '../l0-utilities/Logger';

// Import all commands
import { UpdateTargetGradeCommand } from './commands/UpdateTargetGradeCommand';
import { UpdateCoursePreferencesCommand } from './commands/UpdateCoursePreferencesCommand';
import { DismissNotificationCommand } from './commands/DismissNotificationCommand';
import { MarkTaskCompleteCommand } from './commands/MarkTaskCompleteCommand';
import { TriggerSyncCommand } from './commands/TriggerSyncCommand';
import { SimulateGradeCommand } from './commands/SimulateGradeCommand';
import { ClearSimulationCommand } from './commands/ClearSimulationCommand';
import { CreateTaskCommand } from './commands/CreateTaskCommand';
import { DuplicateTaskCommand } from './commands/DuplicateTaskCommand';
import { UpdateTaskCommand } from './commands/UpdateTaskCommand';
import { DeleteTaskCommand } from './commands/DeleteTaskCommand';
import { SetCourseSyllabusCommand } from './commands/SetCourseSyllabusCommand';
import { MarkSyllabusReviewedCommand } from './commands/MarkSyllabusReviewedCommand';
import { RemoveCourseSyllabusCommand } from './commands/RemoveCourseSyllabusCommand';
import { ArchiveCourseCommand } from './commands/ArchiveCourseCommand';
import { UnarchiveCourseCommand } from './commands/UnarchiveCourseCommand';

export interface CommandDispatcherOptions {
  db: Database;
  visibleDataProvider?: VisibleDataProvider;
  logger?: ILogger;
}

/**
 * Command names for type-safe dispatch
 */
export type CommandName =
  | 'UpdateTargetGrade'
  | 'UpdateCoursePreferences'
  | 'DismissNotification'
  | 'MarkTaskComplete'
  | 'TriggerSync'
  | 'SimulateGrade'
  | 'ClearSimulation'
  | 'CreateTask'
  | 'DuplicateTask'
  | 'UpdateTask'
  | 'DeleteTask'
  | 'SetCourseSyllabus'
  | 'MarkSyllabusReviewed'
  | 'RemoveCourseSyllabus'
  | 'ArchiveCourse'
  | 'UnarchiveCourse';

/**
 * CommandDispatcher manages command execution
 *
 * Events:
 * - 'command-started': Command execution beginning
 * - 'command-completed': Command executed successfully
 * - 'command-failed': Command execution failed
 * - 'simulation-changed': Simulation state changed
 */
export class CommandDispatcher extends EventEmitter {
  private commands: Map<string, Command<unknown, unknown>> = new Map();
  private context: CommandContext;
  private simulationManager: SimulationManager;
  private log: ILogger;
  // Store event handler references for cleanup
  private simulationStartedHandler: ((data: unknown) => void) | null = null;
  private simulationUpdatedHandler: ((data: unknown) => void) | null = null;
  private simulationClearedHandler: ((data: unknown) => void) | null = null;

  constructor(options: CommandDispatcherOptions) {
    super();
    this.log = options.logger || createNoopLogger('commandDispatcher');

    // Initialize simulation context
    const simulationContext = createSimulationContext();

    // Create command context
    this.context = {
      db: options.db,
      visibleDataProvider: options.visibleDataProvider,
      simulationContext,
    };

    // Initialize simulation manager
    this.simulationManager = new SimulationManager({
      db: options.db,
    });

    // Forward simulation events (store handlers for cleanup)
    this.simulationStartedHandler = (data) => {
      this.emit('simulation-changed', { type: 'started', ...(data as object) });
    };
    this.simulationUpdatedHandler = (data) => {
      this.emit('simulation-changed', { type: 'updated', ...(data as object) });
    };
    this.simulationClearedHandler = (data) => {
      this.emit('simulation-changed', { type: 'cleared', ...(data as object) });
    };
    this.simulationManager.on('simulation-started', this.simulationStartedHandler);
    this.simulationManager.on('simulation-updated', this.simulationUpdatedHandler);
    this.simulationManager.on('simulation-cleared', this.simulationClearedHandler);

    // Register all commands
    this.registerDefaultCommands();
  }

  /**
   * Register the default set of commands
   */
  private registerDefaultCommands(): void {
    this.register(new UpdateTargetGradeCommand());
    this.register(new UpdateCoursePreferencesCommand());
    this.register(new DismissNotificationCommand());
    this.register(new MarkTaskCompleteCommand());

    const triggerSyncCommand = new TriggerSyncCommand();
    triggerSyncCommand.on('sync-requested', (event) => {
      this.emit('sync-requested', event);
    });
    this.register(triggerSyncCommand);

    this.register(new SimulateGradeCommand());
    this.register(new ClearSimulationCommand());
    this.register(new CreateTaskCommand());
    this.register(new DuplicateTaskCommand());
    this.register(new UpdateTaskCommand());
    this.register(new DeleteTaskCommand());
    this.register(new SetCourseSyllabusCommand());
    this.register(new MarkSyllabusReviewedCommand());
    this.register(new RemoveCourseSyllabusCommand());
    this.register(new ArchiveCourseCommand());
    this.register(new UnarchiveCourseCommand());
  }

  /**
   * Register a command handler
   */
  register<TParams, TResult>(command: Command<TParams, TResult>): void {
    this.commands.set(command.name, command as Command<unknown, unknown>);
  }

  /**
   * Execute a command by name
   */
  async dispatch<TParams, TResult>(
    commandName: CommandName,
    params: TParams
  ): Promise<CommandResult<TResult>> {
    const command = this.commands.get(commandName);

    if (!command) {
      this.log.warn(`Unknown command: ${commandName}`);
      return {
        success: false,
        error: `Unknown command: ${commandName}`,
      };
    }

    const timer = createTimer();
    this.log.debug(`Executing command: ${commandName}`, { params });

    // Emit start event
    this.emit('command-started', { command: commandName, params });

    try {
      // Validate if validator exists
      if (command.validate) {
        const validation = command.validate(params);
        if (!validation.valid) {
          const result: CommandResult<TResult> = {
            success: false,
            error: validation.error,
          };
          this.log.warn(`Command validation failed: ${commandName}`, {
            error: validation.error,
          });
          this.emit('command-failed', {
            command: commandName,
            params,
            error: validation.error,
          });
          return result;
        }
      }

      // Execute command
      const result = (await command.execute(
        this.context,
        params
      )) as CommandResult<TResult>;

      const timing = timer.end();

      if (result.success) {
        this.log.info(`Command completed: ${commandName} - ${timing.durationFormatted}`, {
          durationMs: timing.durationMs,
        });
        this.emit('command-completed', { command: commandName, params, result });
      } else {
        this.log.warn(`Command failed: ${commandName}`, {
          error: result.error,
          durationMs: timing.durationMs,
        });
        this.emit('command-failed', {
          command: commandName,
          params,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const timing = timer.end();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log.error(
        `Command execution error: ${commandName}`,
        error instanceof Error ? error : undefined,
        {
          durationMs: timing.durationMs,
        }
      );

      this.emit('command-failed', { command: commandName, params, error: errorMessage });

      return {
        success: false,
        error: `Command execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Get the simulation manager for direct simulation operations
   */
  getSimulationManager(): SimulationManager {
    return this.simulationManager;
  }

  /**
   * Get current simulation context (read-only)
   */
  getSimulationContext(): Readonly<SimulationContext> {
    return this.context.simulationContext;
  }

  /**
   * Check if simulation is active
   */
  isSimulationActive(): boolean {
    return this.context.simulationContext.isActive;
  }

  /**
   * Get list of registered command names
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Clear simulation state (called on app close)
   */
  clearSimulation(): void {
    this.context.simulationContext = createSimulationContext();
    this.simulationManager.clearAll();
  }

  /**
   * Dispose of resources and remove event listeners
   * Call this when the dispatcher is no longer needed to prevent memory leaks
   */
  dispose(): void {
    // Remove simulation manager event listeners
    if (this.simulationStartedHandler) {
      this.simulationManager.off('simulation-started', this.simulationStartedHandler);
      this.simulationStartedHandler = null;
    }
    if (this.simulationUpdatedHandler) {
      this.simulationManager.off('simulation-updated', this.simulationUpdatedHandler);
      this.simulationUpdatedHandler = null;
    }
    if (this.simulationClearedHandler) {
      this.simulationManager.off('simulation-cleared', this.simulationClearedHandler);
      this.simulationClearedHandler = null;
    }

    // Clear registered commands
    this.commands.clear();

    // Clear simulation state
    this.clearSimulation();
  }
}
