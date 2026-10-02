import { describe, expect, it } from 'vitest';
import { errorDetails } from '../../../../src/modules/affiliate-research/application/errors/error-details.js';

describe('errorDetails', () => {
  it('includes useful diagnostic metadata while redacting URLs and configured secrets', () => {
    const error = Object.assign(
      new Error(
        'Request failed for https://api.example.test/path?access_token=abc123 using abc123',
      ),
      { code: 'ECONNREFUSED' },
    );

    expect(errorDetails(error, { MELI_REFRESH_TOKEN: 'abc123' })).toEqual({
      errorName: 'Error',
      errorMessage: 'Request failed for [REDACTED_URL] using [REDACTED]',
      errorCode: 'ECONNREFUSED',
    });
  });

  it('handles non-Error rejection values', () => {
    expect(errorDetails('Bearer very-secret', {})).toEqual({
      errorName: 'UnknownError',
      errorMessage: 'Bearer [REDACTED]',
    });
  });
});
