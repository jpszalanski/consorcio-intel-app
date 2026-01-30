
import { AppDataStore, ImportedFileLog, Administrator } from '../types';

const STORAGE_KEY = 'consorcio_intel_data';

const initialData: AppDataStore = {
  overview: [],
  regional: [],
  competitors: [],
  administrators: [],
  importedFiles: [],
  lastUpdated: null
};

export const dataStore = {
  saveData: (newData: Partial<AppDataStore>) => {
    const current = dataStore.getData();
    
    // Merge de Administradoras (sem duplicar por CNPJ)
    let updatedAdmins = [...current.administrators];
    if (newData.administrators) {
      const adminMap = new Map(updatedAdmins.map(a => [a.cnpj, a]));
      newData.administrators.forEach(a => adminMap.set(a.cnpj, a));
      updatedAdmins = Array.from(adminMap.values());
    }

    const updated = { 
      ...current, 
      ...newData,
      administrators: updatedAdmins,
      importedFiles: newData.importedFiles 
        ? [...current.importedFiles, ...newData.importedFiles] 
        : current.importedFiles,
      lastUpdated: new Date().toISOString() 
    };

    // Deduplicação de logs de arquivos
    if (newData.importedFiles) {
        const uniqueFiles = new Map();
        updated.importedFiles.forEach(file => uniqueFiles.set(file.fileName, file));
        updated.importedFiles = Array.from(uniqueFiles.values());
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('dataUpdate'));
    return updated;
  },

  getData: (): AppDataStore => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialData;
    
    const parsed = JSON.parse(saved);
    if (!parsed.importedFiles) parsed.importedFiles = [];
    if (!parsed.administrators) parsed.administrators = [];
    return parsed;
  },

  clearData: () => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('dataUpdate'));
  },

  isFileImported: (fileName: string): ImportedFileLog | undefined => {
    const data = dataStore.getData();
    return data.importedFiles.find(f => f.fileName === fileName);
  }
};
