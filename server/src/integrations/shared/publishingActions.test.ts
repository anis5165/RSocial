import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleInput } from './publishingActions';
import { hashRequestPayload } from '../../services/idempotency/idempotencyService';
import { AppError } from '../../utils/errors';

describe('parseScheduleInput', () => {
  it('parses ISO local datetime in Asia/Kolkata', () => {
    const parsed = parseScheduleInput('2026-10-20T19:00:00', 'Asia/Kolkata');
    assert.equal(parsed.date, '2026-10-20');
    assert.equal(parsed.time, '19:00:00');
    assert.equal(parsed.timezone, 'Asia/Kolkata');
  });

  it('rejects invalid datetime', () => {
    assert.throws(
      () => parseScheduleInput('not-a-date', 'Asia/Kolkata'),
      (err: unknown) => err instanceof AppError && err.code === 'INVALID_SCHEDULE_TIME'
    );
  });

  it('rejects invalid timezone', () => {
    assert.throws(
      () => parseScheduleInput('2026-10-20T19:00:00', 'Not/AZone'),
      (err: unknown) => err instanceof AppError
    );
  });
});

describe('idempotency hash', () => {
  it('is stable for the same payload', () => {
    const a = hashRequestPayload({ postId: '1', caption: 'hi' });
    const b = hashRequestPayload({ postId: '1', caption: 'hi' });
    assert.equal(a, b);
  });

  it('changes when payload changes', () => {
    const a = hashRequestPayload({ postId: '1' });
    const b = hashRequestPayload({ postId: '2' });
    assert.notEqual(a, b);
  });
});
