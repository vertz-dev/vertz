/**
 * Shared inheritance resolution logic.
 *
 * Walk the inheritance chain from a source resource type down to a target type.
 * Returns the inherited role at the target type, or null if no path exists.
 *
 * Used by InMemoryRoleAssignmentStore, DbRoleAssignmentStore, and computeAccessSet.
 */

import type { AccessDefinition } from './define-access';

export function resolveInheritedRole(
  sourceType: string,
  sourceRole: string,
  targetType: string,
  accessDef: AccessDefinition,
): string | null {
  const hierarchy = accessDef.hierarchy;
  const sourceIdx = hierarchy.indexOf(sourceType);
  const targetIdx = hierarchy.indexOf(targetType);

  if (sourceIdx === -1 || targetIdx === -1 || sourceIdx >= targetIdx) return null;

  let currentRole = sourceRole;
  for (let i = sourceIdx; i < targetIdx; i++) {
    const currentType = hierarchy[i]!;
    const inheritanceMap = accessDef.inheritance[currentType];
    if (!inheritanceMap || !(currentRole in inheritanceMap)) return null;
    currentRole = inheritanceMap[currentRole]!;
  }

  return currentRole;
}
