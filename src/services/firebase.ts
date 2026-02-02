
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';

// Configuração do Firebase Consórcio Intel
const firebaseConfig = {
  apiKey: "AIzaSyDb_17CJm3Ajbmwnt4q-Sc6KKimuOa3asA",
  authDomain: "consorcio-intel-app.firebaseapp.com",
  projectId: "consorcio-intel-app",
  storageBucket: "consorcio-intel-app.firebasestorage.app",
  messagingSenderId: "654186633996",
  appId: "1:654186633996:web:1feddb11c5238414844729",
  measurementId: "G-VQ5JTT3JQN"
};

// Inicializa o Firebase App
const app = initializeApp(firebaseConfig);

// Inicializa Auth
export const auth = getAuth(app);

// Inicializa Firestore com persistência offline robusta
// Isso evita o erro "Could not reach Cloud Firestore backend" em conexões instáveis
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

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

  try {
    console.log("Iniciando nova sessão anônima...");
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error: any) {
    if (error.code !== 'auth/configuration-not-found' && error.code !== 'auth/operation-not-allowed') {
      console.error("Falha na autenticação anônima:", error);
    }
    return null;
  }
};
