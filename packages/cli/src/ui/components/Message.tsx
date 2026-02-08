import { Text } from 'ink';
import type React from 'react';
import { colors, symbols } from '../theme';

type MessageType = 'info' | 'error' | 'warning' | 'success';

interface MessageProps {
  type: MessageType;
  children: React.ReactNode;
}

const symbolMap: Record<MessageType, string> = {
  info: symbols.info,
  error: symbols.error,
  warning: symbols.warning,
  success: symbols.success,
};

const colorMap: Record<MessageType, string> = {
  info: colors.info,
  error: colors.error,
  warning: colors.warning,
  success: colors.success,
};

export function Message({ type, children }: MessageProps): React.ReactElement {
  return (
    <Text color={colorMap[type]}>
      {symbolMap[type]} {children}
    </Text>
  );
}
