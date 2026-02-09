import type { CodegenAuth, CodegenOperation, FileFragment, Import } from '../../types';
import { toCamelCase, toPascalCase } from '../../utils/naming';

export function emitSDKConfig(auth: CodegenAuth): FileFragment {
  const imports: Import[] = [{ from: '@vertz/fetch', name: 'FetchClientConfig', isType: true }];

  const fields: string[] = [];

  for (const scheme of auth.schemes) {
    if (scheme.type === 'bearer') {
      fields.push(
        '  /** Bearer token or function returning a token. */\n  token?: string | (() => string | Promise<string>);',
      );
    } else if (scheme.type === 'apiKey') {
      fields.push(
        '  /** API key or function returning a key. */\n  apiKey?: string | (() => string | Promise<string>);',
      );
    }
  }

  if (fields.length === 0) {
    return {
      content: 'export interface SDKConfig extends FetchClientConfig {}',
      imports,
    };
  }

  const content = `export interface SDKConfig extends FetchClientConfig {\n${fields.join('\n')}\n}`;
  return { content, imports };
}

export function emitAuthStrategyBuilder(auth: CodegenAuth): FileFragment {
  const imports: Import[] = [{ from: '@vertz/fetch', name: 'AuthStrategy', isType: true }];

  const lines: string[] = [];
  lines.push('const authStrategies: AuthStrategy[] = [...(config.authStrategies ?? [])];');

  for (const scheme of auth.schemes) {
    if (scheme.type === 'bearer') {
      lines.push(
        "if (config.token) {\n  authStrategies.push({ type: 'bearer', token: config.token });\n}",
      );
    } else if (scheme.type === 'apiKey') {
      lines.push(
        `if (config.apiKey) {\n  authStrategies.push({ type: 'apiKey', key: config.apiKey, location: '${scheme.in}', name: '${scheme.paramName}' });\n}`,
      );
    }
  }

  return { content: lines.join('\n'), imports };
}

function buildPathExpression(path: string): string {
  // Check if path has any params (`:paramName`)
  if (!path.includes(':')) {
    return `'${path}'`;
  }
  // Convert `:id` to `${input.params.id}`
  // biome-ignore lint/suspicious/noTemplateCurlyInString: replacement string for regex, not a template literal
  const interpolated = path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '${input.params.$1}');
  return `\`${interpolated}\``;
}

function buildRequestOptions(op: CodegenOperation): string {
  const opts: string[] = [];
  if (op.query) {
    opts.push('query: input?.query');
  }
  if (op.body) {
    opts.push('body: input.body');
  }
  if (op.headers) {
    opts.push('headers: input?.headers');
  }
  if (opts.length === 0) {
    return '';
  }
  return `, { ${opts.join(', ')} }`;
}

export function emitOperationMethod(op: CodegenOperation): FileFragment {
  const imports: Import[] = [];
  const methodName = toCamelCase(op.operationId);
  const inputTypeName = `${toPascalCase(op.operationId)}Input`;
  const responseTypeName = `${toPascalCase(op.operationId)}Response`;

  const hasInput = op.params || op.query || op.body || op.headers;

  if (hasInput) {
    // Query-only or headers-only inputs are optional
    const isInputOptional = !op.params && !op.body;
    const inputParam = isInputOptional ? `input?: ${inputTypeName}` : `input: ${inputTypeName}`;
    imports.push({ from: '../types', name: inputTypeName, isType: true });

    imports.push({ from: '../types', name: responseTypeName, isType: true });

    const pathExpr = buildPathExpression(op.path);
    const reqOpts = buildRequestOptions(op);

    const content = `${methodName}(${inputParam}): Promise<SDKResult<${responseTypeName}>> {\n  return client.request('${op.method}', ${pathExpr}${reqOpts});\n}`;
    return { content, imports };
  }

  imports.push({ from: '../types', name: responseTypeName, isType: true });
  const pathExpr = buildPathExpression(op.path);
  const content = `${methodName}(): Promise<SDKResult<${responseTypeName}>> {\n  return client.request('${op.method}', ${pathExpr});\n}`;
  return { content, imports };
}
