import { JournalEntry } from '../types';

const STORAGE_KEY = 'mindflow_journal_entries_v1';

export const StorageService = {
  getEntries: (): JournalEntry[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load entries", e);
      return [];
    }
  },

  saveEntries: (entries: JournalEntry[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.error("Failed to save entries", e);
    }
  },

  addEntry: (entry: JournalEntry): JournalEntry[] => {
    const entries = StorageService.getEntries();
    const newEntries = [entry, ...entries];
    StorageService.saveEntries(newEntries);
    return newEntries;
  },

  updateEntry: (updatedEntry: JournalEntry): JournalEntry[] => {
    const entries = StorageService.getEntries();
    const newEntries = entries.map(e => e.id === updatedEntry.id ? updatedEntry : e);
    StorageService.saveEntries(newEntries);
    return newEntries;
  },

  deleteEntry: (id: string): JournalEntry[] => {
    const entries = StorageService.getEntries();
    const newEntries = entries.filter(e => e.id !== id);
    StorageService.saveEntries(newEntries);
    return newEntries;
  }
};