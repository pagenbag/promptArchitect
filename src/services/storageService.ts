import { Project } from "../types";

const STORAGE_KEY = 'prompt_architect_projects';

export interface StorageAdapter {
  isLocal: boolean;
  loadProjects(): Promise<Project[] | null>;
  saveProjects(projects: Project[]): Promise<void>;
}

class BrowserStorageAdapter implements StorageAdapter {
  isLocal = false;
  async loadProjects(): Promise<Project[] | null> {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }
  async saveProjects(projects: Project[]): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }
}

class LocalFileSystemAdapter implements StorageAdapter {
  isLocal = true;
  async loadProjects(): Promise<Project[] | null> {
    try {
      const response = await fetch('/api/storage/load');
      if (!response.ok) throw new Error("Failed to load from local storage");
      const data = await response.json();
      return data.projects.length > 0 ? data.projects : null;
    } catch (error) {
      console.error("Local load error:", error);
      return null;
    }
  }
  async saveProjects(projects: Project[]): Promise<void> {
    try {
      const response = await fetch('/api/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects })
      });
      if (!response.ok) throw new Error("Failed to sync to local storage");
    } catch (error) {
      console.error("Local sync error:", error);
    }
  }
}

export async function getStorageAdapter(): Promise<StorageAdapter> {
  try {
    const response = await fetch('/api/storage/status');
    const data = await response.json();
    if (data.isLocal) {
      return new LocalFileSystemAdapter();
    }
  } catch (e) {
    // Fallback to browser if API fails
  }
  return new BrowserStorageAdapter();
}
