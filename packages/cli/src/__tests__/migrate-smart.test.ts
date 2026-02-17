import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { smartMigrateAction } from '../commands/migrate-smart';

const mockProjectRoot = '/mock/project';

const findProjectRootMock = vi.fn().mockReturnValue(mockProjectRoot);

// Mock the dependencies
vi.mock('../utils/paths', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findProjectRoot: (...args: any[]) => (findProjectRootMock as any)(...args),
}));

const spawnMock = vi.fn(() => ({
  on: vi.fn((event: string, callback: (code: number | null) => void) => {
    if (event === 'close') {
      callback(0);
    }
    if (event === 'error') {
      // no-op
    }
  }),
}));

vi.mock('node:child_process', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawn: (...args: any[]) => (spawnMock as any)(...args),
}));

describe('Feature: Smart Migrate Command', () => {
  beforeEach(() => {
    findProjectRootMock.mockReturnValue(mockProjectRoot);
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Given NODE_ENV=development', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    describe('When `vertz db migrate` runs', () => {
      it('then pending migrations are applied', async () => {
        await smartMigrateAction({});

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'dev'],
          expect.any(Object),
        );
      });

      it('and a new migration file is created if schema changed', async () => {
        // This is inherent to `prisma migrate dev` behavior
        // The test above verifies that `migrate dev` is called, which does this automatically
        await smartMigrateAction({});

        // prisma migrate dev automatically creates migrations if schema changed
        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'dev'],
          expect.any(Object),
        );
      });
    });

    describe('When `vertz db migrate --status` runs', () => {
      it('then it shows migration status', async () => {
        await smartMigrateAction({ status: true });

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'status'],
          expect.any(Object),
        );
      });
    });

    describe('When `vertz db migrate --create-only --name <name>` runs', () => {
      it('then it creates migration file without applying', async () => {
        await smartMigrateAction({ createOnly: true, name: 'add_users_table' });

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'dev', '--name', 'add_users_table', '--create-only'],
          expect.any(Object),
        );
      });
    });

    describe('When `vertz db migrate --reset` runs', () => {
      it('then it resets the database', async () => {
        await smartMigrateAction({ reset: true });

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'reset', '--force'],
          expect.any(Object),
        );
      });
    });
  });

  describe('Given NODE_ENV=production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    describe('When `vertz db migrate` runs', () => {
      it('then pending migrations are applied', async () => {
        await smartMigrateAction({});

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'deploy'],
          expect.any(Object),
        );
      });

      it('and NO new migration files are created', async () => {
        spawnMock.mockClear(); // Clear previous calls

        await smartMigrateAction({});

        // prisma migrate deploy does NOT create new migrations
        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'deploy'],
          expect.any(Object),
        );
        // Ensure it's NOT migrate dev
        expect(spawnMock).not.toHaveBeenCalledWith(
          'npx',
          expect.arrayContaining(['migrate', 'dev']),
          expect.any(Object),
        );
      });
    });
  });

  describe('Given NODE_ENV=ci', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'ci');
    });

    describe('When `vertz db migrate` runs', () => {
      it('then it uses migrate deploy (same as production)', async () => {
        await smartMigrateAction({});

        expect(spawnMock).toHaveBeenCalledWith(
          'npx',
          ['prisma', 'migrate', 'deploy'],
          expect.any(Object),
        );
      });
    });
  });

  describe('Error handling', () => {
    it('exits with error when project root not found', async () => {
      findProjectRootMock.mockReturnValue(undefined);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      // Explicitly pass undefined for all optional params
      await smartMigrateAction({
        createOnly: false,
        reset: false,
        status: false,
        name: undefined,
        verbose: false,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Could not find project root. Are you in a Vertz project?',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('exits with error when --create-only without name in dev', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      // Explicitly pass name as undefined
      await smartMigrateAction({ createOnly: true, name: undefined });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Migration name is required when using --create-only in development.',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
