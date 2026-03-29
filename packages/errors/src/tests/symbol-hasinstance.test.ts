import { describe, it, expect } from 'bun:test';
import { AppError } from '../app-error';
import {
  FetchError,
  HttpError,
  FetchBadRequestError,
  FetchNotFoundError,
  FetchNetworkError,
  FetchTimeoutError,
  ParseError,
  FetchValidationError,
  isFetchNetworkError,
  isHttpError,
  isFetchBadRequestError,
  isFetchNotFoundError,
  isFetchTimeoutError,
  isParseError,
  isFetchValidationError,
} from '../fetch';
import {
  EntityError,
  BadRequestError,
  EntityNotFoundError,
  EntityConflictError,
  EntityValidationError,
  InternalError,
  isBadRequestError,
  isEntityNotFoundError,
  isEntityConflictError,
  isEntityValidationError,
  isInternalError,
} from '../entity';

// ============================================================================
// AppError — no Symbol.hasInstance (user subclasses would inherit it)
// ============================================================================

describe('Symbol.hasInstance brand checks', () => {
  describe('Given AppError without Symbol.hasInstance (users subclass it)', () => {
    it('Then real AppError passes instanceof via prototype chain', () => {
      const err = new AppError('TEST', 'test message');
      expect(err instanceof AppError).toBe(true);
    });

    it('Then user subclass instanceof works correctly', () => {
      class PaymentError extends AppError<'PAYMENT'> {
        constructor() {
          super('PAYMENT', 'declined');
        }
      }
      class InventoryError extends AppError<'INVENTORY'> {
        constructor() {
          super('INVENTORY', 'out of stock');
        }
      }
      const payment = new PaymentError();
      const inventory = new InventoryError();

      // Subclass instanceof works correctly via prototype chain
      expect(payment instanceof PaymentError).toBe(true);
      expect(payment instanceof AppError).toBe(true);
      expect(payment instanceof InventoryError).toBe(false); // cross-subclass correctly false
      expect(inventory instanceof InventoryError).toBe(true);
      expect(inventory instanceof PaymentError).toBe(false);
    });
  });

  // ============================================================================
  // Fetch error hierarchy
  // ============================================================================

  describe('Given FetchError hierarchy with __brands', () => {
    it('Then FetchNetworkError instanceof FetchError', () => {
      const err = new FetchNetworkError();
      expect(err instanceof FetchError).toBe(true);
      expect(err instanceof FetchNetworkError).toBe(true);
    });

    it('Then HttpError instanceof FetchError', () => {
      const err = new HttpError(500, 'Server error');
      expect(err instanceof FetchError).toBe(true);
      expect(err instanceof HttpError).toBe(true);
    });

    it('Then FetchBadRequestError instanceof HttpError AND FetchError', () => {
      const err = new FetchBadRequestError('bad');
      expect(err instanceof FetchBadRequestError).toBe(true);
      expect(err instanceof HttpError).toBe(true);
      expect(err instanceof FetchError).toBe(true);
    });

    it('Then FetchNotFoundError instanceof HttpError AND FetchError', () => {
      const err = new FetchNotFoundError('not found');
      expect(err instanceof FetchNotFoundError).toBe(true);
      expect(err instanceof HttpError).toBe(true);
      expect(err instanceof FetchError).toBe(true);
    });

    it('Then FetchTimeoutError instanceof FetchError but NOT HttpError', () => {
      const err = new FetchTimeoutError();
      expect(err instanceof FetchError).toBe(true);
      expect(err instanceof FetchTimeoutError).toBe(true);
      expect(err instanceof HttpError).toBe(false);
    });

    it('Then ParseError instanceof FetchError but NOT HttpError', () => {
      const err = new ParseError('root', 'parse fail');
      expect(err instanceof FetchError).toBe(true);
      expect(err instanceof ParseError).toBe(true);
      expect(err instanceof HttpError).toBe(false);
    });

    it('Then FetchValidationError instanceof FetchError but NOT HttpError', () => {
      const err = new FetchValidationError('fail', []);
      expect(err instanceof FetchError).toBe(true);
      expect(err instanceof FetchValidationError).toBe(true);
      expect(err instanceof HttpError).toBe(false);
    });
  });

  // ============================================================================
  // Cross-module brand checks (plain objects with __brands)
  // ============================================================================

  describe('Given a plain object with matching __brands', () => {
    it('Then it passes instanceof FetchError', () => {
      const fake = { __brands: ['VertzFetchError'] };
      expect(fake instanceof FetchError).toBe(true);
    });

    it('Then it passes instanceof HttpError when brand present', () => {
      const fake = { __brands: ['VertzHttpError', 'VertzFetchError'] };
      expect(fake instanceof HttpError).toBe(true);
      expect(fake instanceof FetchError).toBe(true);
    });

    it('Then HttpError-only brand does NOT pass instanceof FetchBadRequestError', () => {
      const fake = { __brands: ['VertzHttpError', 'VertzFetchError'] };
      expect(fake instanceof FetchBadRequestError).toBe(false);
    });
  });

  // ============================================================================
  // Entity error hierarchy
  // ============================================================================

  describe('Given EntityError hierarchy with __brands', () => {
    it('Then BadRequestError instanceof EntityError', () => {
      const err = new BadRequestError();
      expect(err instanceof EntityError).toBe(true);
      expect(err instanceof BadRequestError).toBe(true);
    });

    it('Then EntityNotFoundError instanceof EntityError', () => {
      const err = new EntityNotFoundError();
      expect(err instanceof EntityError).toBe(true);
      expect(err instanceof EntityNotFoundError).toBe(true);
    });

    it('Then EntityConflictError instanceof EntityError', () => {
      const err = new EntityConflictError();
      expect(err instanceof EntityError).toBe(true);
    });

    it('Then EntityValidationError instanceof EntityError', () => {
      const err = new EntityValidationError([]);
      expect(err instanceof EntityError).toBe(true);
    });

    it('Then InternalError instanceof EntityError', () => {
      const err = new InternalError();
      expect(err instanceof EntityError).toBe(true);
    });
  });

  // ============================================================================
  // Type guards still work with brands
  // ============================================================================

  describe('Given type guards use instanceof (which now uses Symbol.hasInstance)', () => {
    it('Then isFetchNetworkError works', () => {
      expect(isFetchNetworkError(new FetchNetworkError())).toBe(true);
      expect(isFetchNetworkError(new HttpError(500, 'x'))).toBe(false);
    });

    it('Then isHttpError works', () => {
      expect(isHttpError(new HttpError(500, 'x'))).toBe(true);
      expect(isHttpError(new FetchBadRequestError('x'))).toBe(true);
      expect(isHttpError(new FetchNetworkError())).toBe(false);
    });

    it('Then isFetchBadRequestError works', () => {
      expect(isFetchBadRequestError(new FetchBadRequestError('x'))).toBe(true);
      expect(isFetchBadRequestError(new HttpError(400, 'x'))).toBe(false);
    });

    it('Then isFetchNotFoundError works', () => {
      expect(isFetchNotFoundError(new FetchNotFoundError('x'))).toBe(true);
      expect(isFetchNotFoundError(new HttpError(404, 'x'))).toBe(false);
    });

    it('Then isFetchTimeoutError works', () => {
      expect(isFetchTimeoutError(new FetchTimeoutError())).toBe(true);
      expect(isFetchTimeoutError(new FetchNetworkError())).toBe(false);
    });

    it('Then isParseError works', () => {
      expect(isParseError(new ParseError('x', 'msg'))).toBe(true);
      expect(isParseError(new FetchNetworkError())).toBe(false);
    });

    it('Then isFetchValidationError works', () => {
      expect(isFetchValidationError(new FetchValidationError('x', []))).toBe(true);
      expect(isFetchValidationError(new FetchNetworkError())).toBe(false);
    });

    it('Then entity type guards work', () => {
      expect(isBadRequestError(new BadRequestError())).toBe(true);
      expect(isEntityNotFoundError(new EntityNotFoundError())).toBe(true);
      expect(isEntityConflictError(new EntityConflictError())).toBe(true);
      expect(isEntityValidationError(new EntityValidationError([]))).toBe(true);
      expect(isInternalError(new InternalError())).toBe(true);
    });
  });
});
