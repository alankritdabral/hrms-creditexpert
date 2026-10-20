import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAQFU0rudqnsF9wcDKo0YOBbqAOzZ_ixTg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "irregularhours-5f56e.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "irregularhours-5f56e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "irregularhours-5f56e.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "703529463831",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:703529463831:web:a9fc21d584c498481dec52",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    return app;
  } catch (error) {
    console.warn("Firebase initialization error:", error);
    return null;
  }
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (firebaseApp && !auth) {
    try {
      auth = getAuth(firebaseApp);
    } catch (e) {
      console.warn("Could not get Firebase Auth instance:", e);
    }
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (firebaseApp && !firestore) {
    try {
      firestore = getFirestore(firebaseApp);
    } catch (e) {
      console.warn("Could not get Firestore instance:", e);
    }
  }
  return firestore;
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const firebaseApp = getFirebaseApp();
  if (firebaseApp && !storage) {
    try {
      storage = getStorage(firebaseApp);
    } catch (e) {
      console.warn("Could not get Firebase Storage instance:", e);
    }
  }
  return storage;
}
