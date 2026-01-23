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
import { Database } from '../l1-persistence/Database';
import { PriorityEngine } from '../l3-intelligence/PriorityEngine';
import { SimulationManager } from './SimulationManager';

// Import all commands
import { UpdateTargetGradeCommand } from './commands/UpdateTargetGradeCommand';
import { UpdateCoursePreferencesCommand } from './commands/UpdateCoursePreferencesCommand';
import { DismissNotificationCommand } from './commands/DismissNotificationCommand';
import { MarkTaskCompleteCommand } from './commands/MarkTaskCompleteCommand';
import { TriggerSyncCommand } from './commands/TriggerSyncCommand';
import { SimulateGradeCommand } from './commands/SimulateGradeCommand';
import { ClearSimulationCommand } from './commands/ClearSimulationCommand';
import { UseGraceTokenCommand } from './commands/UseGraceTokenCommand';
import { UpdatePolicyCommand } from './commands/UpdatePolicyCommand';
import { AddPolicyCommand } from './commands/AddPolicyCommand';
import { CreateTaskCommand } from './commands/CreateTaskCommand';
import { DuplicateTaskCommand } from './commands/DuplicateTaskCommand';
import { UpdateTaskCommand } from './commands/UpdateTaskCommand';
import { DeleteTaskCommand } from './commands/DeleteTaskCommand';
import { DeletePolicyCommand } from './commands/DeletePolicyCommand';

export interface CommandDispatcherOptions {
  db: Database;
  priorityEngine?: PriorityEngine;
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
  | 'UseGraceToken'
  | 'UpdatePolicy'
  | 'AddPolicy'
  | 'CreateTask'
  | 'DuplicateTask'
  | 'UpdateTask'
  | 'DeleteTask'
  | 'DeletePolicy';

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
  // Store event handler references for cleanup
  private simulationStartedHandler: ((data: unknown) => void) | null = null;
  private simulationUpdatedHandler: ((data: unknown) => void) | null = null;
  private simulationClearedHandler: ((data: unknown) => void) | null = null;

  constructor(options: CommandDispatcherOptions) {
    super();

    // Initialize simulation context
    const simulationContext = createSimulationContext();

    // Create command context
    this.context = {
      db: options.db,
      priorityEngine: options.priorityEngine,
      simulationContext,
    };

    // Initialize simulation manager
    this.simulationManager = new SimulationManager({
      db: options.db,
      priorityEngine: options.priorityEngine,
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
    this.register(new UseGraceTokenCommand());
    this.register(new UpdatePolicyCommand());
    this.register(new AddPolicyCommand());
    this.register(new CreateTaskCommand());
    this.register(new DuplicateTaskCommand());
    this.register(new UpdateTaskCommand());
    this.register(new DeleteTaskCommand());
    this.register(new DeletePolicyCommand());
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
      return {
        success: false,
        error: `Unknown command: ${commandName}`,
      };
    }

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
          this.emit('command-failed', { command: commandName, params, error: validation.error });
          return result;
        }
      }

      // Execute command
      const result = await command.execute(this.context, params) as CommandResult<TResult>;

      if (result.success) {
        this.emit('command-completed', { command: commandName, params, result });
      } else {
        this.emit('command-failed', { command: commandName, params, error: result.error });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
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
   * Set the priority engine (for late initialization)
   */
  setPriorityEngine(engine: PriorityEngine): void {
    this.context.priorityEngine = engine;
    this.simulationManager.setPriorityEngine(engine);
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
