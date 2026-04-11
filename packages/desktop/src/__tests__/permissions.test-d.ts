import { describe, expectTypeOf, it } from 'bun:test';
import type {
  DesktopPermissionConfig,
  IpcCapabilityGroup,
  IpcMethodString,
  IpcPermission,
} from '../permissions.js';

// ── IpcCapabilityGroup ──

describe('Feature: IpcCapabilityGroup type safety', () => {
  describe('Given a valid capability group string', () => {
    it('Then is assignable to IpcCapabilityGroup', () => {
      expectTypeOf<'fs:read'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'fs:write'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'fs:all'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'shell:execute'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'shell:all'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'clipboard:read'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'clipboard:write'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'clipboard:all'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'dialog:all'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'appWindow:all'>().toMatchTypeOf<IpcCapabilityGroup>();
      expectTypeOf<'app:all'>().toMatchTypeOf<IpcCapabilityGroup>();
    });
  });

  describe('Given an invalid string', () => {
    it('Then is not assignable to IpcCapabilityGroup', () => {
      // @ts-expect-error arbitrary string is not a valid capability group
      const _bad: IpcCapabilityGroup = 'bogus:thing';
    });
  });
});

// ── IpcMethodString ──

describe('Feature: IpcMethodString type safety', () => {
  describe('Given valid IPC method strings', () => {
    it('Then fs methods are assignable', () => {
      expectTypeOf<'fs.readTextFile'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.writeTextFile'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.readBinaryFile'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.writeBinaryFile'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.readDir'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.exists'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.stat'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.remove'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.rename'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'fs.createDir'>().toMatchTypeOf<IpcMethodString>();
    });

    it('Then shell methods are assignable', () => {
      expectTypeOf<'shell.execute'>().toMatchTypeOf<IpcMethodString>();
    });

    it('Then clipboard methods are assignable', () => {
      expectTypeOf<'clipboard.readText'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'clipboard.writeText'>().toMatchTypeOf<IpcMethodString>();
    });

    it('Then dialog methods are assignable', () => {
      expectTypeOf<'dialog.open'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'dialog.save'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'dialog.confirm'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'dialog.message'>().toMatchTypeOf<IpcMethodString>();
    });

    it('Then appWindow methods are assignable', () => {
      expectTypeOf<'appWindow.setTitle'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'appWindow.setSize'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'appWindow.setFullscreen'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'appWindow.innerSize'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'appWindow.minimize'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'appWindow.close'>().toMatchTypeOf<IpcMethodString>();
    });

    it('Then app methods are assignable', () => {
      expectTypeOf<'app.dataDir'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'app.cacheDir'>().toMatchTypeOf<IpcMethodString>();
      expectTypeOf<'app.version'>().toMatchTypeOf<IpcMethodString>();
    });
  });

  describe('Given an invalid method string', () => {
    it('Then is not assignable to IpcMethodString', () => {
      // @ts-expect-error arbitrary string is not a valid method
      const _bad: IpcMethodString = 'not.a.method';
    });
  });
});

// ── IpcPermission (union of groups and methods) ──

describe('Feature: IpcPermission type safety', () => {
  describe('Given a capability group', () => {
    it('Then is assignable to IpcPermission', () => {
      expectTypeOf<'fs:read'>().toMatchTypeOf<IpcPermission>();
      expectTypeOf<'clipboard:all'>().toMatchTypeOf<IpcPermission>();
    });
  });

  describe('Given an individual method string', () => {
    it('Then is assignable to IpcPermission', () => {
      expectTypeOf<'fs.readTextFile'>().toMatchTypeOf<IpcPermission>();
      expectTypeOf<'shell.execute'>().toMatchTypeOf<IpcPermission>();
    });
  });

  describe('Given an invalid string', () => {
    it('Then is not assignable to IpcPermission', () => {
      // @ts-expect-error arbitrary string is not a valid permission
      const _bad: IpcPermission = 'invalid.permission';
    });
  });
});

// ── DesktopPermissionConfig ──

describe('Feature: DesktopPermissionConfig type safety', () => {
  describe('Given a valid config with mixed permissions', () => {
    it('Then accepts an array of IpcPermission values', () => {
      const config: DesktopPermissionConfig = {
        permissions: ['fs:read', 'clipboard:write', 'shell.execute'],
      };
      expectTypeOf(config.permissions).toEqualTypeOf<IpcPermission[]>();
    });
  });

  describe('Given a config with an invalid permission string', () => {
    it('Then produces a type error', () => {
      const _bad: DesktopPermissionConfig = {
        // @ts-expect-error 'bogus' is not a valid IpcPermission
        permissions: ['fs:read', 'bogus'],
      };
    });
  });

  describe('Given a config missing permissions field', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error permissions is required
      const _bad: DesktopPermissionConfig = {};
    });
  });
});
