export interface ResolveOptions {
  specVersion: '3.0' | '3.1';
}

class OpenAPIParserError extends Error {
  override name = 'OpenAPIParserError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRefSegments(ref: string): string[] {
  if (!ref.startsWith('#/')) {
    throw new OpenAPIParserError(`External $ref values are not supported: ${ref}`);
  }

  return ref.slice(2).split('/');
}

function getRefName(ref: string): string {
  const segments = getRefSegments(ref);
  return segments[segments.length - 1] ?? ref;
}

function getRawRefTarget(ref: string, document: Record<string, unknown>): Record<string, unknown> {
  let current: unknown = document;

  for (const segment of getRefSegments(ref)) {
    if (!isRecord(current) || !(segment in current)) {
      throw new OpenAPIParserError(`Could not resolve $ref: ${ref}`);
    }

    current = current[segment];
  }

  if (!isRecord(current)) {
    throw new OpenAPIParserError(`Resolved $ref is not an object schema: ${ref}`);
  }

  return current;
}

function resolveNestedValue(
  value: unknown,
  document: Record<string, unknown>,
  options: ResolveOptions,
  resolving: Set<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      isRecord(entry) ? resolveSchema(entry, document, options, resolving) : entry,
    );
  }

  if (isRecord(value)) {
    return resolveSchema(value, document, options, resolving);
  }

  return value;
}

function mergeSchemas(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...left };

  for (const [key, value] of Object.entries(right)) {
    if (key === 'properties' && isRecord(merged.properties) && isRecord(value)) {
      merged.properties = { ...merged.properties, ...value };
      continue;
    }

    if (key === 'required' && Array.isArray(merged.required) && Array.isArray(value)) {
      merged.required = [...new Set([...merged.required, ...value])];
      continue;
    }

    if (isRecord(merged[key]) && isRecord(value)) {
      merged[key] = mergeSchemas(merged[key] as Record<string, unknown>, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function resolveRef(
  ref: string,
  document: Record<string, unknown>,
  options: ResolveOptions,
): Record<string, unknown> {
  const target = getRawRefTarget(ref, document);

  if (typeof target.$ref === 'string') {
    return resolveRef(target.$ref, document, options);
  }

  return resolveSchema(target, document, options);
}

export function resolveSchema(
  schema: Record<string, unknown>,
  document: Record<string, unknown>,
  options: ResolveOptions,
  resolving: Set<string> = new Set(),
): Record<string, unknown> {
  let workingSchema = { ...schema };

  if (typeof workingSchema.$ref === 'string') {
    const ref = workingSchema.$ref;

    if (resolving.has(ref)) {
      return { $circular: getRefName(ref) };
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(ref);

    const resolvedTarget = resolveSchema(
      getRawRefTarget(ref, document),
      document,
      options,
      nextResolving,
    );
    const siblingEntries = Object.entries(workingSchema).filter(([key]) => key !== '$ref');

    if (options.specVersion === '3.0' || siblingEntries.length === 0) {
      workingSchema = resolvedTarget;
    } else {
      const siblings = Object.fromEntries(siblingEntries);
      workingSchema = mergeSchemas(
        resolvedTarget,
        resolveSchema(siblings, document, options, nextResolving),
      );
    }
  }

  if (Array.isArray(workingSchema.allOf)) {
    const flattened = workingSchema.allOf.reduce<Record<string, unknown>>((accumulator, member) => {
      if (!isRecord(member)) {
        return accumulator;
      }

      return mergeSchemas(
        accumulator,
        resolveSchema(member, document, options, new Set(resolving)),
      );
    }, {});

    const { allOf: _allOf, ...rest } = workingSchema;
    return mergeSchemas(flattened, resolveSchema(rest, document, options, resolving));
  }

  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(workingSchema)) {
    if (key === 'properties' && isRecord(value)) {
      resolved.properties = Object.fromEntries(
        Object.entries(value).map(([propertyName, propertySchema]) => [
          propertyName,
          isRecord(propertySchema)
            ? resolveSchema(propertySchema, document, options, new Set(resolving))
            : propertySchema,
        ]),
      );
      continue;
    }

    resolved[key] = resolveNestedValue(value, document, options, new Set(resolving));
  }

  return resolved;
}
