import { createCompiler } from '@vertz/compiler';

interface CheckOptions {
  json?: boolean;
}

interface CheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function checkProjectAction(options: CheckOptions = {}): Promise<void> {
  const result: CheckResult = { valid: true, errors: [], warnings: [] };

  try {
    const compiler = createCompiler();
    const appIR = await compiler.analyze();

    // Check for diagnostics
    for (const diag of appIR.diagnostics) {
      if (diag.severity === 'error') {
        result.errors.push(diag.message);
        result.valid = false;
      } else {
        result.warnings.push(diag.message);
      }
    }

    // Check entities
    if (appIR.entities.length === 0) {
      result.warnings.push('No entities defined');
    }

    for (const entity of appIR.entities) {
      // Warn about fully-open access
      if (
        entity.access.delete === 'function' &&
        entity.access.update === 'function'
      ) {
        result.warnings.push(
          `Entity '${entity.name}' has open delete + update access — consider restricting`,
        );
      }
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(
      error instanceof Error ? error.message : String(error),
    );
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
    return;
  }

  // Human-readable output
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`  ✗ ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
  }

  if (result.valid && result.warnings.length === 0) {
    console.log('  ✓ Project is valid');
  }

  process.exit(result.valid ? 0 : 1);
}
