/**
 * L2 Daemon - Circuit Breaker
 *
 * Protects against cascade failures by tracking API endpoint health
 * and temporarily blocking requests to failing endpoints.
 */

import { EventEmitter } from 'events';
import { CircuitBreakerConfig } from '../l0-utilities/AppConfig';
import { ComponentLogger, Logger } from '../l0-utilities/Logger';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitStatus {
  endpoint: string;
  state: CircuitState;
  failureCount: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  resetTimeout: number;
  nextRetryAt: Date | null;
}

export interface CircuitBreakerOptions {
  enabled?: boolean;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  maxResetTimeoutMs?: number;
  useExponentialBackoff?: boolean;
  perEndpoint?: boolean;
  endpoints?: string[];
  logger?: Logger;
}

interface EndpointCircuit {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  currentResetTimeout: number;
  resetTimer: NodeJS.Timeout | null;
}

/**
 * Circuit Breaker for API resilience
 *
 * States:
 * - Closed: Normal operation, requests flow through
 * - Open: Blocking requests, waiting for reset timeout
 * - Half-Open: Testing with one request to see if service recovered
 *
 * Features:
 * - Per-endpoint circuit tracking
 * - Exponential backoff for reset timeout
 * - Configurable failure threshold
 */
export class CircuitBreaker extends EventEmitter {
  private readonly enabled: boolean;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly maxResetTimeoutMs: number;
  private readonly useExponentialBackoff: boolean;
  private readonly perEndpoint: boolean;
  private readonly log: ComponentLogger;

  private circuits: Map<string, EndpointCircuit> = new Map();
  private globalCircuit: EndpointCircuit;

  constructor(config?: CircuitBreakerConfig | CircuitBreakerOptions, logger?: Logger) {
    super();

    // Apply defaults
    this.enabled = config?.enabled ?? true;
    this.failureThreshold = config?.failureThreshold ?? 3;
    this.resetTimeoutMs = config?.resetTimeoutMs ?? 30000;
    this.maxResetTimeoutMs = config?.maxResetTimeoutMs ?? 300000;
    this.useExponentialBackoff = config?.useExponentialBackoff ?? true;
    this.perEndpoint = config?.perEndpoint ?? true;

    // Setup logger
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('circuitBreaker');
    } else if (logger) {
      this.log = logger.child('circuitBreaker');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('circuitBreaker');
    }

    // Initialize global circuit
    this.globalCircuit = this.createCircuit();

    // Initialize per-endpoint circuits if configured
    if (this.perEndpoint && config?.endpoints) {
      for (const endpoint of config.endpoints) {
        this.circuits.set(endpoint, this.createCircuit());
      }
    }
  }

  /**
   * Create a new circuit with default values
   */
  private createCircuit(): EndpointCircuit {
    return {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailure: null,
      lastSuccess: null,
      currentResetTimeout: this.resetTimeoutMs,
      resetTimer: null,
    };
  }

  /**
   * Get or create circuit for an endpoint
   */
  private getCircuit(endpoint?: string): EndpointCircuit {
    if (!this.perEndpoint || !endpoint) {
      return this.globalCircuit;
    }

    if (!this.circuits.has(endpoint)) {
      this.circuits.set(endpoint, this.createCircuit());
    }
    return this.circuits.get(endpoint)!;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    endpoint?: string
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const circuit = this.getCircuit(endpoint);
    const circuitName = endpoint || 'global';

    // Check circuit state
    if (circuit.state === 'open') {
      this.log.debug(`Circuit '${circuitName}' is open, rejecting request`);
      throw new CircuitOpenError(`Circuit breaker is open for ${circuitName}`);
    }

    // Allow one request through in half-open state
    if (circuit.state === 'half-open') {
      this.log.debug(`Circuit '${circuitName}' is half-open, testing with request`);
    }

    try {
      const result = await fn();
      this.recordSuccess(endpoint);
      return result;
    } catch (error) {
      this.recordFailure(endpoint);
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(endpoint?: string): void {
    if (!this.enabled) return;

    const circuit = this.getCircuit(endpoint);
    const circuitName = endpoint || 'global';

    circuit.successCount++;
    circuit.lastSuccess = new Date();

    if (circuit.state === 'half-open') {
      // Success in half-open state: close the circuit
      this.closeCircuit(circuit, circuitName);
    } else if (circuit.state === 'closed') {
      // Reset failure count on success
      circuit.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(endpoint?: string): void {
    if (!this.enabled) return;

    const circuit = this.getCircuit(endpoint);
    const circuitName = endpoint || 'global';

    circuit.failureCount++;
    circuit.lastFailure = new Date();

    this.log.debug(`Failure recorded for '${circuitName}', count: ${circuit.failureCount}`);

    if (circuit.state === 'half-open') {
      // Failure in half-open state: back to open with longer timeout
      this.openCircuit(circuit, circuitName, true);
    } else if (circuit.state === 'closed' && circuit.failureCount >= this.failureThreshold) {
      // Threshold exceeded: open the circuit
      this.openCircuit(circuit, circuitName, false);
    }
  }

  /**
   * Open a circuit
   */
  private openCircuit(
    circuit: EndpointCircuit,
    name: string,
    fromHalfOpen: boolean
  ): void {
    const previousState = circuit.state;
    circuit.state = 'open';

    // Calculate reset timeout with optional exponential backoff
    if (fromHalfOpen && this.useExponentialBackoff) {
      circuit.currentResetTimeout = Math.min(
        circuit.currentResetTimeout * 2,
        this.maxResetTimeoutMs
      );
    } else if (!fromHalfOpen) {
      circuit.currentResetTimeout = this.resetTimeoutMs;
    }

    this.log.info(
      `Circuit '${name}' opened (failures: ${circuit.failureCount}, ` +
      `reset in ${circuit.currentResetTimeout}ms)`
    );

    this.emit('circuit-opened', {
      endpoint: name,
      failureCount: circuit.failureCount,
      resetTimeoutMs: circuit.currentResetTimeout,
    });

    // Schedule transition to half-open
    if (circuit.resetTimer) {
      clearTimeout(circuit.resetTimer);
    }

    circuit.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen(circuit, name);
    }, circuit.currentResetTimeout);
  }

  /**
   * Transition circuit to half-open state
   */
  private transitionToHalfOpen(circuit: EndpointCircuit, name: string): void {
    circuit.state = 'half-open';
    circuit.resetTimer = null;

    this.log.info(`Circuit '${name}' transitioned to half-open`);

    this.emit('circuit-half-open', {
      endpoint: name,
      failureCount: circuit.failureCount,
    });
  }

  /**
   * Close a circuit (reset to normal)
   */
  private closeCircuit(circuit: EndpointCircuit, name: string): void {
    const previousState = circuit.state;

    circuit.state = 'closed';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.currentResetTimeout = this.resetTimeoutMs;

    if (circuit.resetTimer) {
      clearTimeout(circuit.resetTimer);
      circuit.resetTimer = null;
    }

    this.log.info(`Circuit '${name}' closed (recovered)`);

    this.emit('circuit-closed', {
      endpoint: name,
      previousState,
    });
  }

  /**
   * Force a circuit open (for manual intervention)
   */
  forceOpen(endpoint?: string): void {
    const circuit = this.getCircuit(endpoint);
    const name = endpoint || 'global';

    if (circuit.state !== 'open') {
      circuit.state = 'open';
      circuit.currentResetTimeout = this.maxResetTimeoutMs; // Max timeout for forced open

      this.log.warn(`Circuit '${name}' force opened`);

      this.emit('circuit-opened', {
        endpoint: name,
        failureCount: circuit.failureCount,
        resetTimeoutMs: circuit.currentResetTimeout,
        forced: true,
      });
    }
  }

  /**
   * Force a circuit closed (for manual recovery)
   */
  forceClose(endpoint?: string): void {
    const circuit = this.getCircuit(endpoint);
    const name = endpoint || 'global';

    this.closeCircuit(circuit, name);
    this.log.warn(`Circuit '${name}' force closed`);
  }

  /**
   * Get circuit state
   */
  getState(endpoint?: string): CircuitState {
    return this.getCircuit(endpoint).state;
  }

  /**
   * Get circuit status
   */
  getStatus(endpoint?: string): CircuitStatus {
    const circuit = this.getCircuit(endpoint);
    const name = endpoint || 'global';

    return {
      endpoint: name,
      state: circuit.state,
      failureCount: circuit.failureCount,
      lastFailure: circuit.lastFailure,
      lastSuccess: circuit.lastSuccess,
      resetTimeout: circuit.currentResetTimeout,
      nextRetryAt: circuit.state === 'open' && circuit.lastFailure
        ? new Date(circuit.lastFailure.getTime() + circuit.currentResetTimeout)
        : null,
    };
  }

  /**
   * Get all circuit statuses
   */
  getAllStatuses(): CircuitStatus[] {
    const statuses: CircuitStatus[] = [];

    // Global circuit
    statuses.push(this.getStatus());

    // Per-endpoint circuits
    for (const endpoint of this.circuits.keys()) {
      statuses.push(this.getStatus(endpoint));
    }

    return statuses;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowing(endpoint?: string): boolean {
    if (!this.enabled) return true;
    const circuit = this.getCircuit(endpoint);
    return circuit.state !== 'open';
  }

  /**
   * Get failure count for circuit
   */
  getFailureCount(endpoint?: string): number {
    return this.getCircuit(endpoint).failureCount;
  }

  /**
   * Reset all circuits
   */
  reset(): void {
    // Reset global circuit
    this.closeCircuit(this.globalCircuit, 'global');

    // Reset per-endpoint circuits
    for (const [name, circuit] of this.circuits) {
      this.closeCircuit(circuit, name);
    }

    this.log.info('All circuits reset');
    this.emit('reset');
  }

  /**
   * Stop all timers (cleanup)
   */
  stop(): void {
    if (this.globalCircuit.resetTimer) {
      clearTimeout(this.globalCircuit.resetTimer);
      this.globalCircuit.resetTimer = null;
    }

    for (const circuit of this.circuits.values()) {
      if (circuit.resetTimer) {
        clearTimeout(circuit.resetTimer);
        circuit.resetTimer = null;
      }
    }

    this.log.debug('Circuit breaker stopped');
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
