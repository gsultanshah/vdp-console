function readEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function readProjectId(): string {
  return readEnv('FIREBASE_PROJECT_ID') || readEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
}

function resolveDatabaseURL(): string {
  const projectId = readProjectId();
  const candidates = [
    readEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL'),
    readEnv('FIREBASE_DATABASE_URL'),
    projectId ? `https://${projectId}.firebaseio.com` : '',
    projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : '',
    projectId ? `https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app` : '',
  ].filter(Boolean);

  if (projectId) {
    const matching = candidates.find((url) => url.includes(projectId));
    if (matching) {
      return matching;
    }
  }

  return candidates[0] ?? '';
}

function readPrivateKey(): string {
  const raw = readEnv('FIREBASE_PRIVATE_KEY');
  if (!raw) {
    return '';
  }
  if (raw.includes('\\n')) {
    return raw.replace(/\\n/g, '\n');
  }
  return raw;
}

function readClientEmail(): string {
  const email = readEnv('FIREBASE_CLIENT_EMAIL');
  if (email.includes('...@')) {
    return '';
  }
  return email;
}

export const firebaseConfig = {
  projectId: readProjectId(),
  databaseURL: resolveDatabaseURL(),
  clientEmail: readClientEmail(),
  privateKey: readPrivateKey(),
  apiKey: readEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  storageBucket: readEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  appId: readEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

export function isFirebasePipelineConfigured(): boolean {
  return Boolean(
    firebaseConfig.projectId &&
      firebaseConfig.databaseURL &&
      firebaseConfig.clientEmail &&
      firebaseConfig.privateKey.startsWith('-----BEGIN')
  );
}

export function isFirebaseClientConfigured(): boolean {
  const apiKey = firebaseConfig.apiKey;
  return Boolean(
    firebaseConfig.projectId &&
      firebaseConfig.databaseURL &&
      apiKey &&
      apiKey !== '...' &&
      apiKey.length > 20
  );
}
