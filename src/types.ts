export interface Block {
  id: string;
  content: string;
  isDone?: boolean;
  description?: string;
  isDirty?: boolean;
  isThinking?: boolean;
}

export interface Project {
  id: string;
  name: string;
  parentId: string | null;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
}

export type TreeItem = Project;
