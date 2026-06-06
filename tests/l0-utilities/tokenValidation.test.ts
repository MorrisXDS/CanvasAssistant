/**
 * tokenValidation Tests
 *
 * Pure-function table tests for `classifyValidationResult` — the tri-state
 * Canvas token validity classifier (ADR-0013). No I/O, no mocks needed beyond
 * constructing AxiosError shapes.
 */

import { AxiosError } from 'axios';
import {
  classifyValidationResult,
  type TokenValidity,
} from '../../src/layers/l0-utilities/tokenValidation';

/** Build an AxiosError with an attached HTTP response (server replied). */
function axiosErrorWithStatus(status: number): AxiosError {
  const err = new AxiosError('Request failed');
  // Minimal response shape — only `status` is read by the classifier.
  err.response = {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data: undefined,
  };
  return err;
}

/** Build an AxiosError with NO response (network failure / offline / DNS). */
function axiosErrorNoResponse(code?: string): AxiosError {
  const err = new AxiosError('Network Error');
  if (code) err.code = code;
  // err.response intentionally left undefined.
  return err;
}

describe('classifyValidationResult', () => {
  describe('status path', () => {
    const cases: Array<[number, TokenValidity]> = [
      [200, 'valid'],
      [204, 'valid'],
      [299, 'valid'],
      [401, 'invalid'],
      [403, 'invalid'],
      [500, 'unknown'],
      [503, 'unknown'],
      [429, 'unknown'],
      [404, 'unknown'],
      [302, 'unknown'],
      [400, 'unknown'],
    ];

    it.each(cases)('status %i -> %s', (status, expected) => {
      expect(classifyValidationResult({ kind: 'status', status })).toBe(expected);
    });
  });

  describe('error path', () => {
    it('AxiosError with no response (offline) -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorNoResponse(),
        })
      ).toBe('unknown');
    });

    it('AxiosError ECONNABORTED (timeout) -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorNoResponse('ECONNABORTED'),
        })
      ).toBe('unknown');
    });

    it('AxiosError ENOTFOUND (DNS) -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorNoResponse('ENOTFOUND'),
        })
      ).toBe('unknown');
    });

    it('AxiosError with response 401 -> invalid', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorWithStatus(401),
        })
      ).toBe('invalid');
    });

    it('AxiosError with response 403 -> invalid', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorWithStatus(403),
        })
      ).toBe('invalid');
    });

    it('AxiosError with response 500 -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorWithStatus(500),
        })
      ).toBe('unknown');
    });

    it('AxiosError with response 429 -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorWithStatus(429),
        })
      ).toBe('unknown');
    });

    it('AxiosError with response 200 (improbable) -> valid', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: axiosErrorWithStatus(200),
        })
      ).toBe('valid');
    });

    it('plain Error -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: new Error('boom'),
        })
      ).toBe('unknown');
    });

    it('non-Error thrown value (string) -> unknown', () => {
      expect(
        classifyValidationResult({
          kind: 'error',
          error: 'totally not an error',
        })
      ).toBe('unknown');
    });

    it('null thrown value -> unknown', () => {
      expect(classifyValidationResult({ kind: 'error', error: null })).toBe('unknown');
    });
  });
});
