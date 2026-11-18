import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api.ts';
import { apiErrorText } from './format.ts';

const t = ((key: string) => key) as unknown as TFunction;

describe('API errors', () => {
  it('treats a bare 429 from the hosting as temporary, with its own text', () => {
    const error = new ApiRequestError(429);
    expect(error.isTemporary).toBe(true);
    expect(apiErrorText(error, t)).toBe('api.hostingBusy');
  });

  it('keeps our own 429s final and explained', () => {
    const error = new ApiRequestError(429, { code: 'tooManyScans', message: 'Too many scans at once' });
    expect(error.isTemporary).toBe(false);
    expect(apiErrorText(error, t)).toBe('api.tooManyScans');
  });

  it('shows a translated text, not "HTTP 500", for a bare server error', () => {
    expect(apiErrorText(new ApiRequestError(500), t)).toBe('api.httpError');
  });
});
