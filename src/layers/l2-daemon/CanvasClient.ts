import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { EventEmitter } from 'events';

export interface CanvasClientConfig {
  baseUrl: string; // e.g., 'https://utoronto.instructure.com'
  accessToken: string;
  timeout?: number;
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

  constructor(config: CanvasClientConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.accessToken = config.accessToken;

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      timeout: config.timeout || 30000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
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

    while (url) {
      const response = await this.client.get<T[]>(url, {
        params: url === endpoint ? queryParams : undefined,
      });

      results.push(...response.data);

      // Parse Link header for next page
      const links = this.parseLinkHeader(response.headers['link'] as string);
      url = links.next || null;
    }

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
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { errors?: Array<{ message: string }>; message?: string };

      // Emit rate limit event
      if (status === 429) {
        this.emit('rate-limited', {
          retryAfter: error.response.headers['retry-after'],
        });
      }

      // Emit auth error event
      if (status === 401) {
        this.emit('auth-error', { message: 'Invalid or expired access token' });
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
      return Promise.reject({
        status: 0,
        message: 'Network error - could not reach Canvas server',
      });
    }

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
    } catch (error) {
      // Account-level access may be denied for students
      // Return empty and let caller handle extracting from courses
      console.debug('[CanvasClient] Could not fetch enrollment terms from account:', error);
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
   * Update access token (e.g., after refresh)
   */
  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${newToken}`;
  }
}
