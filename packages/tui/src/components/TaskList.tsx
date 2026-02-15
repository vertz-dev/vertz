import { Box, Text } from 'ink';
import type React from 'react';
import { Task } from './Task';

type TaskStatus = 'pending' | 'running' | 'done' | 'error';

interface TaskItem {
  name: string;
  status: TaskStatus;
  detail?: string;
}

interface TaskListProps {
  title: string;
  tasks: readonly TaskItem[];
}

export function TaskList({ title, tasks }: TaskListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {tasks.map((task) => (
        <Task key={task.name} name={task.name} status={task.status} detail={task.detail} />
      ))}
    </Box>
  );
}
