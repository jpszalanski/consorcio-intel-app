
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Configuração do Firebase Consórcio Intel
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Inicializa o Firebase App
const app = initializeApp(firebaseConfig);

// Inicializa Auth
export const auth = getAuth(app);

// Inicializa Firestore
export const db = getFirestore(app);


// Inicializa Storage
export const storage = getStorage(app);

// Inicializa Functions (us-central1)
export const functions = getFunctions(app, 'us-central1');

// Função auxiliar para garantir autenticação antes de chamadas ao Firestore
export const ensureAuth = async (): Promise<User | null> => {
  if (auth.currentUser) return auth.currentUser;

  const user = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe();
      resolve(u);
    });
  });

  if (user) return user;

  // REMOVED AUTO ANONYMOUS LOGIN
  // We want strict login for protected features. Public features use "allow read: if true" (no auth needed).
  return null;
};
