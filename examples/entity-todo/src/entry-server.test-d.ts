/**
 * Type test: globalStyles should be exported from index.ts
 * 
 * This test verifies that entry-server.ts can import globalStyles
 * from ./index without type errors.
 */
import { globalStyles } from './index';

// Verify it's a valid CSS object with .css property
const _styles: string = globalStyles.css;
