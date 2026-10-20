import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;

export function getFirebaseAdminApp(): App | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    // Dynamic import to prevent bundling errors when admin credentials are not provided
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApps, initializeApp, cert } = require("firebase-admin/app");

    if (getApps().length > 0) {
      return getApps()[0];
    }

    if (privateKey.includes("\\n")) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return adminApp;
  } catch (err) {
    console.warn("Failed to initialize Firebase Admin SDK:", err);
    return null;
  }
}

export function getFirebaseAdminAuth() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAuth } = require("firebase-admin/auth");
    return getAuth(app);
  } catch {
    return null;
  }
}

export function getFirebaseAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  if (!adminFirestore) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getFirestore } = require("firebase-admin/firestore");
      adminFirestore = getFirestore(app);
    } catch (err) {
      console.warn("Failed to get Firebase Admin Firestore instance:", err);
      return null;
    }
  }
  return adminFirestore;
}
