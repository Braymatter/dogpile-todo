import type { DogpileData } from '$lib/types';

export interface TodoStore {
  loadData(): Promise<DogpileData>;
  saveData(data: DogpileData): Promise<void>;
}
