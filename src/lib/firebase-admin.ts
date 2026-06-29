import admin from 'firebase-admin';
import { firebaseConfig, isFirebasePipelineConfigured } from '@/config/firebase';

let initialized = false;

export function getFirebaseAdminApp(): admin.app.App | null {
  if (!isFirebasePipelineConfigured()) {
    return null;
  }

  if (!initialized) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail: firebaseConfig.clientEmail,
          privateKey: firebaseConfig.privateKey,
        }),
        databaseURL: firebaseConfig.databaseURL,
        storageBucket: firebaseConfig.storageBucket,
      });
    }
    initialized = true;
  }

  return admin.app();
}

export function getFirebaseDatabase(): admin.database.Database | null {
  const app = getFirebaseAdminApp();
  return app ? admin.database(app) : null;
}
