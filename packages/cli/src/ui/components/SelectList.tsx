import { Box, Text } from 'ink';
import type React from 'react';
import { symbols } from '../theme';

interface Choice {
  label: string;
  value: string;
}

interface SelectListProps {
  title: string;
  choices: readonly Choice[];
  selectedIndex: number;
}

export function SelectList({ title, choices, selectedIndex }: SelectListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{title}</Text>
      {choices.map((choice, index) => (
        <Text key={choice.value}>
          {index === selectedIndex ? symbols.pointer : ' '} {choice.label}
        </Text>
      ))}
    </Box>
  );
}
