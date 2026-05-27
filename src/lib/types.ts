export type CompletionFilter = 'all' | 'completed' | 'incomplete';

export type HistoryRange = 7 | 30;

export type TodoItem = {
  id: string;
  title: string;
  notes?: string;
  tags: string[];
  order: number;
  completed: boolean;
  completedAt?: string;
  durationMinutes?: number;
  createdAt: string;
  updatedAt: string;
};
