import { describe, expect, it } from 'bun:test';
import { AppError } from '../app-error';

describe('AppError', () => {
  describe('constructor', () => {
    it('creates an error with code and message', () => {
      const error = new AppError('NOT_FOUND', 'User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('AppError');
    });

    it('captures stack trace', () => {
      const error = new AppError('TEST', 'Test error');
      expect(error.stack).toBeDefined();
    });
  });

  describe('toJSON()', () => {
    it('serializes to object with code and message', () => {
      const error = new AppError('NOT_FOUND', 'User not found');
      const json = error.toJSON();
      expect(json).toEqual({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  describe('subclass', () => {
    it('can be extended with custom fields', () => {
      class InsufficientBalanceError extends AppError<'INSUFFICIENT_BALANCE'> {
        constructor(
          public readonly required: number,
          public readonly available: number,
        ) {
          super('INSUFFICIENT_BALANCE', `Need ${required}, have ${available}`);
        }

        toJSON() {
          return {
            ...super.toJSON(),
            required: this.required,
            available: this.available,
          };
        }
      }

      const error = new InsufficientBalanceError(500, 50);
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
      expect(error.required).toBe(500);
      expect(error.available).toBe(50);
      expect(error.toJSON()).toEqual({
        code: 'INSUFFICIENT_BALANCE',
        message: 'Need 500, have 50',
        required: 500,
        available: 50,
      });
    });

    it('supports instanceof checks', () => {
      class CustomError extends AppError<'CUSTOM'> {
        constructor() {
          super('CUSTOM', 'Custom error');
        }
      }

      const error = new CustomError();
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof CustomError).toBe(true);
    });
  });
});
