import { describe, expect, it } from '@vertz/test';
import type { CodegenResolvedField, CodegenServiceAction } from './types';

describe('Feature: CodegenServiceAction type extension', () => {
  describe('Given a CodegenServiceAction literal', () => {
    it('Then accepts optional inputSchema/outputSchema strings', () => {
      const a: CodegenServiceAction = {
        name: 'send',
        method: 'POST',
        path: '/notifications/send',
        operationId: 'sendNotifications',
        inputSchema: 'SendNotificationsInput',
        outputSchema: 'SendNotificationsOutput',
      };
      expect(a.inputSchema).toBe('SendNotificationsInput');
      expect(a.outputSchema).toBe('SendNotificationsOutput');
    });

    it('Then accepts optional resolvedInputFields/resolvedOutputFields arrays', () => {
      const fields: CodegenResolvedField[] = [{ name: 'to', tsType: 'string', optional: false }];
      const a: CodegenServiceAction = {
        name: 'send',
        method: 'POST',
        path: '/notifications/send',
        operationId: 'sendNotifications',
        resolvedInputFields: fields,
        resolvedOutputFields: [{ name: 'ok', tsType: 'boolean', optional: false }],
      };
      expect(a.resolvedInputFields).toHaveLength(1);
      expect(a.resolvedOutputFields).toHaveLength(1);
    });

    it('Then accepts optional pathParams string[]', () => {
      const a: CodegenServiceAction = {
        name: 'status',
        method: 'GET',
        path: '/notifications/status/:messageId',
        operationId: 'statusNotifications',
        pathParams: ['messageId'],
      };
      expect(a.pathParams).toEqual(['messageId']);
    });

    it('Then continues to accept the minimal { name, method, path, operationId }', () => {
      const a: CodegenServiceAction = {
        name: 'send',
        method: 'POST',
        path: '/notifications/send',
        operationId: 'sendNotifications',
      };
      expect(a.name).toBe('send');
    });
  });
});
