import type { Diagnostic } from '@vertz/compiler';
import { colors, symbols } from '@vertz/tui';
import { Box, Text } from 'ink';
import type React from 'react';

interface DiagnosticDisplayProps {
  diagnostic: Diagnostic;
}

export function DiagnosticDisplay({ diagnostic }: DiagnosticDisplayProps): React.ReactElement {
  const isError = diagnostic.severity === 'error';
  const icon = isError ? symbols.error : symbols.warning;
  const color = isError ? colors.error : colors.warning;

  const location = diagnostic.file
    ? `${diagnostic.file}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}`
    : '';

  return (
    <Box flexDirection="column">
      <Text color={color}>
        {icon} {diagnostic.code}
      </Text>
      <Text> {diagnostic.message}</Text>
      {location && <Text dimColor> at {location}</Text>}
      {diagnostic.sourceContext && (
        <Box flexDirection="column" marginTop={1}>
          {diagnostic.sourceContext.lines.map((line) => (
            <Text key={line.number}>
              <Text dimColor>{String(line.number).padStart(4)} </Text>
              <Text>{line.text}</Text>
            </Text>
          ))}
        </Box>
      )}
      {diagnostic.suggestion && (
        <Text color={colors.info}>
          {'  '}
          {symbols.info} {diagnostic.suggestion}
        </Text>
      )}
    </Box>
  );
}
