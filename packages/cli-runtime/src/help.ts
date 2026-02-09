import type { CommandDefinition, CommandManifest, FieldDefinition } from './types';

type NamespaceCommands = Record<string, CommandDefinition>;

export function generateHelp(name: string, version: string, commands: CommandManifest): string {
  const lines: string[] = [];

  lines.push(`${name} v${version}`);
  lines.push('');
  lines.push('Usage:');
  lines.push(`  ${name} <namespace> <command> [options]`);
  lines.push('');
  lines.push('Namespaces:');

  for (const namespace of Object.keys(commands)) {
    const cmds = Object.keys(commands[namespace] ?? {});
    lines.push(`  ${namespace}    ${cmds.join(', ')}`);
  }

  lines.push('');
  lines.push('Global Options:');
  lines.push('  --help       Show help');
  lines.push('  --version    Show version');
  lines.push('  --output     Output format (json, table, human)');

  return lines.join('\n');
}

export function generateNamespaceHelp(
  name: string,
  namespace: string,
  commands: NamespaceCommands,
): string {
  const lines: string[] = [];

  lines.push(`${name} ${namespace}`);
  lines.push('');
  lines.push('Commands:');

  for (const [cmdName, cmdDef] of Object.entries(commands)) {
    lines.push(`  ${cmdName}    ${cmdDef.description}`);
  }

  lines.push('');
  lines.push(`Run '${name} ${namespace} <command> --help' for more information on a command.`);

  return lines.join('\n');
}

export function generateCommandHelp(
  namespace: string,
  command: string,
  definition: CommandDefinition,
): string {
  const lines: string[] = [];

  lines.push(`${namespace} ${command} - ${definition.description}`);
  lines.push('');
  lines.push(`  ${definition.method} ${definition.path}`);
  lines.push('');

  const allFields: { name: string; field: FieldDefinition; source: string }[] = [];

  if (definition.params) {
    for (const [name, field] of Object.entries(definition.params)) {
      allFields.push({ name, field, source: 'params' });
    }
  }

  if (definition.query) {
    for (const [name, field] of Object.entries(definition.query)) {
      allFields.push({ name, field, source: 'query' });
    }
  }

  if (definition.body) {
    for (const [name, field] of Object.entries(definition.body)) {
      allFields.push({ name, field, source: 'body' });
    }
  }

  if (allFields.length > 0) {
    lines.push('Options:');
    for (const { name, field } of allFields) {
      const parts: string[] = [`  --${name}`];
      parts.push(`<${field.type}>`);
      if (field.description) {
        parts.push(field.description);
      }
      if (field.required) {
        parts.push('(required)');
      }
      if (field.enum) {
        parts.push(`[${field.enum.join(', ')}]`);
      }
      lines.push(parts.join('  '));
    }
  }

  return lines.join('\n');
}
