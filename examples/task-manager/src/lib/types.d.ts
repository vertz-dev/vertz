/**
 * Domain types for the Task Manager app.
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in-progress' | 'done';
export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    createdAt: string;
    updatedAt: string;
}
export interface CreateTaskBody {
    title: string;
    description: string;
    priority: TaskPriority;
}
export interface UpdateTaskBody {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
}
export interface TaskListResponse {
    tasks: Task[];
    total: number;
}
export interface Settings {
    theme: 'light' | 'dark';
    defaultPriority: TaskPriority;
}
//# sourceMappingURL=types.d.ts.map