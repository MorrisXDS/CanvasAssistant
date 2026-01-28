import axios from 'axios';
import { CanvasClient, CanvasUser } from '../../src/layers/l2-daemon/CanvasClient';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CanvasClient', () => {
  let client: CanvasClient;
  const mockConfig = {
    baseUrl: 'https://canvas.example.edu',
    accessToken: 'test_token_12345',
  };

  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: { headers: {} as Record<string, string> },
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as ReturnType<typeof axios.create>);
    mockedAxios.isAxiosError.mockReturnValue(false);
    client = new CanvasClient(mockConfig);
  });

  describe('Initialization', () => {
    it('should create axios instance with correct base URL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://canvas.example.edu/api/v1',
        })
      );
    });

    it('should include authorization header', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_token_12345',
          }),
        })
      );
    });

    it('should remove trailing slashes from base URL', () => {
      const clientWithSlash = new CanvasClient({
        baseUrl: 'https://canvas.example.edu///',
        accessToken: 'token',
      });
      expect(clientWithSlash.getBaseUrl()).toBe('https://canvas.example.edu');
    });

    it('should set default timeout', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should use custom timeout when provided', () => {
      new CanvasClient({ ...mockConfig, timeout: 60000 });
      expect(mockedAxios.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });
  });

  describe('getCurrentUser', () => {
    it('should fetch current user from /users/self', async () => {
      const mockUser: CanvasUser = {
        id: 123,
        name: 'Test User',
        sortable_name: 'User, Test',
        short_name: 'Test',
        login_id: 'testuser',
        avatar_url: 'https://example.com/avatar.png',
        email: 'test@example.com',
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockUser,
        headers: {},
      });

      const user = await client.getCurrentUser();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/users/self', {
        params: undefined,
        headers: {},
      });
      expect(user).toEqual(mockUser);
    });
  });

  describe('validateToken', () => {
    it('should return valid=true with user on success', async () => {
      const mockUser: CanvasUser = {
        id: 123,
        name: 'Test User',
        sortable_name: 'User, Test',
        short_name: 'Test',
        login_id: 'testuser',
        avatar_url: 'https://example.com/avatar.png',
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockUser,
        headers: {},
      });

      const result = await client.validateToken();

      expect(result.valid).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(result.error).toBeUndefined();
    });

    it('should return valid=false with error message on failure', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await client.validateToken();

      expect(result.valid).toBe(false);
      expect(result.user).toBeUndefined();
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('GET requests', () => {
    it('should make GET request with params', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: 1 }],
        headers: { etag: '"abc123"' },
      });

      const response = await client.get('/courses', { per_page: 10 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/courses', {
        params: { per_page: 10 },
        headers: {},
      });
      expect(response.data).toEqual([{ id: 1 }]);
      expect(response.etag).toBe('"abc123"');
    });

    it('should include If-None-Match header when etag provided', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: 1 }],
        headers: {},
      });

      await client.get('/courses', {}, '"old_etag"');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/courses', {
        params: {},
        headers: { 'If-None-Match': '"old_etag"' },
      });
    });

    it('should handle 304 Not Modified response', async () => {
      const error = {
        response: {
          status: 304,
          headers: {},
        },
        config: {},
      };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValueOnce(error);

      const response = await client.get('/courses', {}, '"etag"');

      expect(response.notModified).toBe(true);
      expect(response.status).toBe(304);
    });
  });

  describe('getAll (pagination)', () => {
    it('should fetch all pages when Link header present', async () => {
      // First page
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        headers: {
          link: '<https://canvas.example.edu/api/v1/courses?page=2>; rel="next"',
        },
      });

      // Second page (last)
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [{ id: 3 }],
        headers: {},
      });

      const results = await client.getAll('/courses');

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('should request 100 items per page', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [],
        headers: {},
      });

      await client.getAll('/courses');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/courses', {
        params: { per_page: 100 },
      });
    });
  });

  describe('updateAccessToken', () => {
    it('should update the authorization header', () => {
      client.updateAccessToken('new_token_xyz');

      expect(mockAxiosInstance.defaults.headers['Authorization']).toBe(
        'Bearer new_token_xyz'
      );
    });
  });

  describe('getRateLimitInfo', () => {
    it('should extract rate limit from headers', () => {
      const headers = {
        'x-rate-limit-remaining': '650',
        'x-request-cost': '1',
      };

      const info = client.getRateLimitInfo(headers);

      expect(info).toEqual({
        remaining: 650,
        limit: 1,
      });
    });

    it('should return null if headers missing', () => {
      const info = client.getRateLimitInfo({});
      expect(info).toBeNull();
    });
  });

  describe('Event emissions', () => {
    it('should emit rate-limited event on 429', async () => {
      const rateLimitedHandler = jest.fn();
      client.on('rate-limited', rateLimitedHandler);

      // Trigger error handler directly since we're mocking
      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        response: {
          status: 429,
          data: { message: 'Rate limited' },
          headers: { 'retry-after': '5' },
        },
      };

      try {
        await errorHandler(error);
      } catch {
        // Expected to reject
      }

      expect(rateLimitedHandler).toHaveBeenCalledWith({
        retryAfter: '5',
        endpoint: 'unknown',
      });
    });

    it('should emit auth-error event on 401', async () => {
      const authErrorHandler = jest.fn();
      client.on('auth-error', authErrorHandler);

      const errorHandler = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

      const error = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
          headers: {},
        },
      };

      try {
        await errorHandler(error);
      } catch {
        // Expected to reject
      }

      expect(authErrorHandler).toHaveBeenCalledWith({
        message: 'Invalid or expired access token',
        endpoint: 'unknown',
      });
    });
  });
});
