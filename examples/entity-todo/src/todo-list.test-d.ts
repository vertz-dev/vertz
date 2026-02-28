/**
 * Type test: isOk should be exported from @vertz/fetch
 *
 * This test verifies that todo-list.tsx can import isOk
 * from @vertz/fetch without type errors.
 */
import { isOk } from '@vertz/fetch';

// Verify isOk is a callable function
const _result: boolean = isOk({ ok: true, data: {} });
