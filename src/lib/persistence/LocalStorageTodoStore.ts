import type { DogpileData } from '$lib/types';
import type { TodoStore } from './TodoStore';
import { createEmptyDogpileData, parseDogpileDocument, serializeDogpileDocument } from './todoDocument';

const STORAGE_KEY = 'dogpile.todos.v1';

export class LocalStorageTodoStore implements TodoStore {
  async loadData(): Promise<DogpileData> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDogpileData();

    return parseDogpileDocument(raw);
  }

  async saveData(data: DogpileData): Promise<void> {
    localStorage.setItem(STORAGE_KEY, serializeDogpileDocument(data));
  }
}
