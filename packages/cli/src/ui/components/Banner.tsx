import { Text } from 'ink';
import type React from 'react';

interface BannerProps {
  version: string;
}

export function Banner({ version }: BannerProps): React.ReactElement {
  return (
    <Text>
      <Text bold color="cyanBright">
        vertz
      </Text>{' '}
      <Text dimColor>v{version}</Text>
    </Text>
  );
}
