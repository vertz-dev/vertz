import type { Diagnostic } from '@vertz/compiler';
import { Text } from 'ink';
import type React from 'react';
import { colors, symbols } from '@vertz/tui';

interface DiagnosticSummaryProps {
  diagnostics: readonly Diagnostic[];
}

export function DiagnosticSummary({ diagnostics }: DiagnosticSummaryProps): React.ReactElement {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    return <Text color={colors.success}>{symbols.success} No errors</Text>;
  }

  const parts: React.ReactNode[] = [];

  if (errors.length > 0) {
    parts.push(
      <Text key="errors" color={colors.error}>
        {errors.length} error{errors.length === 1 ? '' : 's'}
      </Text>,
    );
  }

  if (warnings.length > 0) {
    if (parts.length > 0) {
      parts.push(<Text key="sep">, </Text>);
    }
    parts.push(
      <Text key="warnings" color={colors.warning}>
        {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      </Text>,
    );
  }

  return <Text>{parts}</Text>;
}
