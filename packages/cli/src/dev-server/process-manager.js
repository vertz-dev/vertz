export function createProcessManager(spawnFn) {
  let child;
  const outputHandlers = [];
  const errorHandlers = [];
  return {
    start(entryPoint, env) {
      if (child) {
        child.kill('SIGTERM');
        child = undefined;
      }
      if (spawnFn) {
        child = spawnFn(entryPoint, env);
        child.stdout?.on('data', (data) => {
          const str = data.toString();
          for (const handler of outputHandlers) {
            handler(str);
          }
        });
        child.stderr?.on('data', (data) => {
          const str = data.toString();
          for (const handler of errorHandlers) {
            handler(str);
          }
        });
        child.on('exit', () => {
          child = undefined;
        });
      }
    },
    async stop() {
      if (!child) return;
      const proc = child;
      child = undefined;
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 2000);
        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        proc.kill('SIGTERM');
      });
    },
    async restart(entryPoint, env) {
      await this.stop();
      this.start(entryPoint, env);
    },
    isRunning() {
      return child !== undefined;
    },
    onOutput(handler) {
      outputHandlers.push(handler);
    },
    onError(handler) {
      errorHandlers.push(handler);
    },
  };
}
//# sourceMappingURL=process-manager.js.map
