import { describe, expect, it } from '@vertz/test';
import { ToolDurabilityError, serializeToolDurabilityError } from './errors';

describe('ToolDurabilityError', () => {
  describe('Given a toolCallId + toolName', () => {
    describe('When instantiated', () => {
      it('Then carries the identifiers + canonical code/kind fields', () => {
        const err = new ToolDurabilityError('call_42', 'postSlack');
        expect(err.code).toBe('TOOL_DURABILITY_ERROR');
        expect(err.kind).toBe('tool-durability-error');
        expect(err.toolCallId).toBe('call_42');
        expect(err.toolName).toBe('postSlack');
        expect(err.name).toBe('ToolDurabilityError');
        expect(err).toBeInstanceOf(Error);
      });

      it('Then the message names the tool and offers remediation', () => {
        const err = new ToolDurabilityError('call_42', 'postSlack');
        expect(err.message).toContain("Tool 'postSlack'");
        expect(err.message).toContain('call_42');
        expect(err.message).toContain('safeToRetry');
      });
    });
  });
});

describe('serializeToolDurabilityError()', () => {
  it('Then produces a JSON string with error / kind / toolName / toolCallId', () => {
    const err = new ToolDurabilityError('call_1', 'postSlack');
    const serialized = serializeToolDurabilityError(err);
    const parsed = JSON.parse(serialized) as {
      error: string;
      kind: string;
      toolName: string;
      toolCallId: string;
    };
    expect(parsed.kind).toBe('tool-durability-error');
    expect(parsed.toolName).toBe('postSlack');
    expect(parsed.toolCallId).toBe('call_1');
    expect(parsed.error).toContain("Tool 'postSlack'");
  });
});
