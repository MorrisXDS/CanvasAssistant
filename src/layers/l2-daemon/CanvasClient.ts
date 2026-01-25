import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { EventEmitter } from 'events';
import type { ComponentLogger } from '../l0-utilities/Logger';
import { InputValidator } from './InputValidator';

export interface CanvasClientConfig {
  baseUrl: string; // e.g., 'https://utoronto.instructure.com'
  accessToken: string;
  timeout?: number;
  /** Optional logger for debugging API calls */
  logger?: ComponentLogger;
}

export interface CanvasUser {
  id: number;
  name: string;
  sortable_name: string;
  short_name: string;
  login_id: string;
  avatar_url: string;
  email?: string;
}

export interface CanvasApiError {
  status: number;
  message: string;
  errors?: Array<{ message: string }>;
}

export interface PaginationLinks {
  current?: string;
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

export interface CanvasEnrollmentTerm {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  workflow_state: string;
  grading_period_group_id: number | null;
}

/**
 * Canvas LMS API Client
 *
 * Handles authentication and basic API communication with Canvas.
 * Does NOT handle rate limiting (see RateLimiter.ts for that).
 */
export class CanvasClient extends EventEmitter {
  private client: AxiosInstance;
  private baseUrl: string;
  private accessToken: string;
  private log: ComponentLogger | null;
  private validator: InputValidator;

  constructor(config: CanvasClientConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.accessToken = config.accessToken;
    this.log = config.logger ?? null;
    this.validator = new InputValidator({ strictness: 'lenient', logWarnings: true });

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      timeout: config.timeout || 30000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // Canvas API expects array params as include[]=val1&include[]=val2
      paramsSerializer: (params) => {
        const parts: string[] = [];
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null) continue;
          if (Array.isArray(value)) {
            for (const v of value) {
              parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(v))}`);
            }
          } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
          }
        }
        return parts.join('&');
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (cfg) => {
        const url = cfg.url || '';
        const params = cfg.params ? JSON.stringify(cfg.params) : '';
        this.log?.debug(`REQUEST: ${cfg.method?.toUpperCase()} ${url}${params ? ` params=${params}` : ''}`);
        return cfg;
      },
      (error) => {
        this.log?.debug(`REQUEST ERROR: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        const url = response.config.url || '';
        const status = response.status;
        const isArray = Array.isArray(response.data);
        const dataLength = isArray ? response.data.length : (response.data ? 1 : 0);
        const rateLimitRemaining = response.headers['x-rate-limit-remaining'];
        const linkHeader = response.headers['link'];
        const hasNextPage = linkHeader?.includes('rel="next"');

        this.log?.debug(`RESPONSE: ${status} ${url} - ${dataLength} items, rate_limit_remaining=${rateLimitRemaining || 'N/A'}${hasNextPage ? ', has_next_page=true' : ''}`);

        // Log first few items for debugging (truncated) - only for arrays
        if (this.log && isArray && response.data.length > 0) {
          const sample = response.data.slice(0, 2).map((item: Record<string, unknown>) => {
            if (!item || typeof item !== 'object') return '{invalid}';
            const id = item.id || item.url || 'unknown';
            const name = item.name || item.display_name || item.title || '';
            return `{id:${id}, name:"${String(name).slice(0, 30)}"}`;
          });
          this.log.debug(`SAMPLE: [${sample.join(', ')}${response.data.length > 2 ? ', ...' : ''}]`);
        }

        return response;
      },
      (error: AxiosError) => this.handleError(error)
    );
  }

  /**
   * Validate the access token by fetching current user
   */
  async validateToken(): Promise<{ valid: boolean; user?: CanvasUser; error?: string }> {
    try {
      const user = await this.getCurrentUser();
      return { valid: true, user };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  /**
   * Get the currently authenticated user
   */
  async getCurrentUser(): Promise<CanvasUser> {
    const response = await this.get<CanvasUser>('/users/self');
    return response.data;
  }

  /**
   * Get the user's profile (alias for getCurrentUser with profile data)
   */
  async getUserProfile(): Promise<CanvasUser> {
    const response = await this.get<CanvasUser>('/users/self/profile');
    return response.data;
  }

  /**
   * Generic GET request
   */
  async get<T>(
    endpoint: string,
    params?: Record<string, unknown>,
    etag?: string
  ): Promise<AxiosResponse<T> & { etag?: string; notModified?: boolean }> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const response = await this.client.get<T>(endpoint, {
        params,
        headers,
      });

      return {
        ...response,
        etag: response.headers['etag'] as string | undefined,
        notModified: false,
      };
    } catch (error) {
      // Handle 304 Not Modified
      if (axios.isAxiosError(error) && error.response?.status === 304) {
        return {
          data: {} as T,
          status: 304,
          statusText: 'Not Modified',
          headers: error.response.headers,
          config: error.config!,
          notModified: true,
        };
      }
      throw error;
    }
  }

  /**
   * GET request with automatic pagination
   * Fetches all pages and returns combined results
   */
  async getAll<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = endpoint;
    const queryParams = { ...params, per_page: 100 };
    let pageNum = 1;

    this.log?.debug(`getAll START: ${endpoint}`);

    while (url) {
      const response = await this.client.get<T[]>(url, {
        params: url === endpoint ? queryParams : undefined,
      });

      // Validate response is an array before spreading
      if (!Array.isArray(response.data)) {
        this.log?.warn(`getAll: expected array but got ${typeof response.data} for ${endpoint}`);
        break; // Stop pagination if response format is unexpected
      }

      results.push(...response.data);
      this.log?.debug(`getAll page ${pageNum}: got ${response.data.length} items, total=${results.length}`);

      // Parse Link header for next page (handle string or string[] header)
      const linkHeader = response.headers['link'];
      const links = this.parseLinkHeader(
        typeof linkHeader === 'string' ? linkHeader : Array.isArray(linkHeader) ? linkHeader[0] : undefined
      );
      url = links.next || null;

      if (url) {
        pageNum++;
        this.log?.debug(`getAll: fetching next page ${pageNum}...`);
      }
    }

    this.log?.debug(`getAll COMPLETE: ${endpoint} - ${results.length} total items in ${pageNum} pages`);
    return results;
  }

  /**
   * Generic POST request
   */
  async post<T>(endpoint: string, data?: unknown): Promise<AxiosResponse<T>> {
    return this.client.post<T>(endpoint, data);
  }

  /**
   * Generic PUT request
   */
  async put<T>(endpoint: string, data?: unknown): Promise<AxiosResponse<T>> {
    return this.client.put<T>(endpoint, data);
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(endpoint: string): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(endpoint);
  }

  /**
   * Get rate limit info from last response headers
   */
  getRateLimitInfo(
    headers: Record<string, unknown>
  ): { remaining: number; limit: number } | null {
    const remaining = headers['x-rate-limit-remaining'];
    const limit = headers['x-request-cost'];

    if (remaining !== undefined) {
      return {
        remaining: Number(remaining),
        limit: Number(limit) || 700, // Canvas default
      };
    }
    return null;
  }

  /**
   * Parse Link header for pagination
   */
  private parseLinkHeader(header: string | undefined): PaginationLinks {
    const links: PaginationLinks = {};
    if (!header) return links;

    const parts = header.split(',');
    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match) {
        const [, url, rel] = match;
        links[rel as keyof PaginationLinks] = url;
      }
    }

    return links;
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): Promise<never> {
    const url = error.config?.url || 'unknown';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { errors?: Array<{ message: string }>; message?: string };

      this.log?.debug(`ERROR: ${status} ${url} - ${JSON.stringify(data)}`);

      // Emit rate limit event
      if (status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        this.log?.debug(`RATE LIMITED: retry-after=${retryAfter}`);
        this.emit('rate-limited', {
          retryAfter,
        });
      }

      // Emit auth error event
      if (status === 401) {
        this.log?.debug('AUTH ERROR: 401 Unauthorized');
        this.emit('auth-error', { message: 'Invalid or expired access token' });
      }

      if (status === 403) {
        this.log?.debug(`FORBIDDEN: 403 - access denied to ${url}`);
      }

      if (status === 404) {
        this.log?.debug(`NOT FOUND: 404 - resource not found at ${url}`);
      }

      const errorMessage =
        data?.errors?.[0]?.message ||
        data?.message ||
        error.message ||
        'Unknown Canvas API error';

      const apiError: CanvasApiError = {
        status,
        message: errorMessage,
        errors: data?.errors,
      };

      return Promise.reject(apiError);
    }

    // Network error
    if (error.request) {
      this.log?.debug(`NETWORK ERROR: Could not reach server for ${url}`);
      return Promise.reject({
        status: 0,
        message: 'Network error - could not reach Canvas server',
      });
    }

    this.log?.debug(`UNKNOWN ERROR: ${error.message}`);
    return Promise.reject({
      status: 0,
      message: error.message || 'Unknown error',
    });
  }

  /**
   * Get enrollment terms for the account
   * Note: This requires the user to have account-level access
   * Falls back to extracting terms from courses if account access is denied
   */
  async getEnrollmentTerms(): Promise<CanvasEnrollmentTerm[]> {
    try {
      // Try to get terms from account (requires admin access usually)
      // Canvas uses 'self' as account ID for the user's primary account
      const response = await this.get<{ enrollment_terms: CanvasEnrollmentTerm[] }>(
        '/accounts/self/terms',
        { per_page: 100 }
      );
      return response.data.enrollment_terms || [];
    } catch {
      // Account-level access is typically denied for students (403)
      // Return empty and let caller handle extracting from courses
      return [];
    }
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the access token (for authenticated downloads)
   */
  getAuthToken(): string {
    return this.accessToken;
  }

  /**
   * Update access token (e.g., after refresh)
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${newToken}`;
  }
}
