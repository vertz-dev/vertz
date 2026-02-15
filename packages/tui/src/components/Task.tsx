import { Text } from 'ink';
import type React from 'react';
import { symbols } from '../theme';

type TaskStatus = 'pending' | 'running' | 'done' | 'error';

interface TaskProps {
  name: string;
  status: TaskStatus;
  detail?: string;
}

export function Task({ name, status, detail }: TaskProps): React.ReactElement {
  const iconMap: Record<TaskStatus, string> = {
    pending: symbols.dash,
    running: symbols.pointer,
    done: symbols.success,
    error: symbols.error,
  };
  const icon = iconMap[status];
  return (
    <Text>
      {icon} {name}
      {detail ? ` ${detail}` : ''}
    </Text>
  );
}
