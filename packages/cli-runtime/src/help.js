export function generateHelp(name, version, commands) {
  const lines = [];
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
export function generateNamespaceHelp(name, namespace, commands) {
  const lines = [];
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
export function generateCommandHelp(namespace, command, definition) {
  const lines = [];
  lines.push(`${namespace} ${command} - ${definition.description}`);
  lines.push('');
  lines.push(`  ${definition.method} ${definition.path}`);
  lines.push('');
  const allFields = [];
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
      const parts = [`  --${name}`];
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
//# sourceMappingURL=help.js.map
