import { TaskCard } from '../components/TaskCard';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  assignee?: string;
}

export function TaskListPage() {
  let tasks: Task[] = [
    { id: '1', title: 'Design API', status: 'done', assignee: 'Alice' },
    { id: '2', title: 'Write tests', status: 'in-progress', assignee: 'Bob' },
    { id: '3', title: 'Deploy app', status: 'todo' },
  ];

  let statusFilter = 'all';

  const filtered = statusFilter === 'all'
    ? tasks
    : tasks.filter((t: Task) => t.status === statusFilter);

  function handleStatusChange(taskId: string, newStatus: string) {
    tasks = tasks.map((t: Task) =>
      t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t
    );
  }

  return (
    <div class="task-list-page">
      <div class="filters">
        <button onClick={() => { statusFilter = 'all'; }}>All</button>
        <button onClick={() => { statusFilter = 'todo'; }}>Todo</button>
        <button onClick={() => { statusFilter = 'in-progress'; }}>In Progress</button>
        <button onClick={() => { statusFilter = 'done'; }}>Done</button>
      </div>
      <div class="task-list">
        {filtered.map((task: Task) => (
          <TaskCard
            title={task.title}
            status={task.status}
            assignee={task.assignee}
            onStatusChange={(s: string) => handleStatusChange(task.id, s)}
          />
        ))}
      </div>
    </div>
  );
}
