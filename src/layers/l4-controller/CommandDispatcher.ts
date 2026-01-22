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
  | 'AddPolicy';

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

    // Forward simulation events
    this.simulationManager.on('simulation-started', (data) => {
      this.emit('simulation-changed', { type: 'started', ...data });
    });
    this.simulationManager.on('simulation-updated', (data) => {
      this.emit('simulation-changed', { type: 'updated', ...data });
    });
    this.simulationManager.on('simulation-cleared', (data) => {
      this.emit('simulation-changed', { type: 'cleared', ...data });
    });

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
}
