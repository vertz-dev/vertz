export function createDevLoop(deps) {
  return {
    async start() {
      const result = await deps.compile();
      if (result.success) {
        deps.startProcess();
        deps.onCompileSuccess(result);
      } else {
        deps.onCompileError(result);
      }
      deps.onFileChange(async (_changes) => {
        const recompileResult = await deps.compile();
        if (recompileResult.success) {
          await deps.stopProcess();
          deps.startProcess();
          deps.onCompileSuccess(recompileResult);
        } else {
          deps.onCompileError(recompileResult);
        }
      });
    },
    async stop() {
      await deps.stopProcess();
    },
  };
}
//# sourceMappingURL=dev-loop.js.map
