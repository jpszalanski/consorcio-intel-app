import { ensureAuth } from './firebase';

export const dataStore = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const user = await ensureAuth();
      return !!user;
    } catch (error) {
      return false;
    }
  }
};
