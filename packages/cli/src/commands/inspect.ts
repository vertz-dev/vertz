import { createCompiler } from '@vertz/compiler';
import { formatInspectOutput } from '../context/inspect';

interface InspectOptions {
  json?: boolean;
}

export async function inspectAction(options: InspectOptions = {}): Promise<void> {
  try {
    const compiler = createCompiler();
    const appIR = await compiler.analyze();

    const output = formatInspectOutput(appIR);

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Human-readable format
      console.log('\nVertz Project\n');

      console.log(`Entities (${output.summary.entityCount}):`);
      for (const [name, entity] of Object.entries(output.entities)) {
        const ops = Object.entries(entity.access)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ');
        console.log(`  ${name} — fields: ${entity.fields.join(', ')} | ops: ${ops}`);
        if (entity.relations.length > 0) {
          for (const rel of entity.relations) {
            console.log(`    → ${rel.name} (${rel.type} ${rel.entity})`);
          }
        }
      }

      if (output.suggestions.length > 0) {
        console.log('\nSuggestions:');
        for (const s of output.suggestions) {
          console.log(`  ⚠ ${s}`);
        }
      }

      console.log('');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('tsconfig')) {
      console.error('Not a Vertz project (no tsconfig.json found).');
    } else {
      console.error('Failed to inspect project:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  }
}
