import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { ImageAnnotatorClient } from '@google-cloud/vision';

export interface GoogleVisionCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface VisionTextDetectionResult {
  textAnnotations?: Array<{
    description?: string | null;
    boundingPoly?: { vertices: { x?: number; y?: number }[] };
  }>;
  [key: string]: unknown;
}

const DEFAULT_PROJECT_ID = 'engaged-fact-460917-f7';
const DEFAULT_CLIENT_EMAIL = 'vdp-console@engaged-fact-460917-f7.iam.gserviceaccount.com';

let dotEnvLoaded = false;
let cachedCredentials: GoogleVisionCredentials | null = null;
let visionClient: ImageAnnotatorClient | null = null;

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

export function loadDotEnvIfNeeded(): void {
  if (dotEnvLoaded) {
    return;
  }
  dotEnvLoaded = true;

  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore unreadable .env
  }
}

function readCredentialsFile(filePath: string): GoogleVisionCredentials | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (!parsed.private_key || !parsed.client_email) {
      return null;
    }

    return {
      project_id: parsed.project_id ?? DEFAULT_PROJECT_ID,
      client_email: parsed.client_email,
      private_key: normalizePrivateKey(parsed.private_key),
    };
  } catch {
    return null;
  }
}

export function resolveGoogleVisionApiKey(): string | null {
  loadDotEnvIfNeeded();
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  return apiKey || null;
}

export function resolveGoogleVisionCredentials(): GoogleVisionCredentials {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  loadDotEnvIfNeeded();

  const envPrivateKey = process.env.GOOGLE_VISION_PRIVATE_KEY;
  const envClientEmail = process.env.GOOGLE_VISION_CLIENT_EMAIL;

  if (envPrivateKey && envClientEmail) {
    cachedCredentials = {
      project_id: process.env.GOOGLE_VISION_PROJECT_ID ?? DEFAULT_PROJECT_ID,
      client_email: envClientEmail,
      private_key: normalizePrivateKey(envPrivateKey),
    };
    return cachedCredentials;
  }

  const applicationCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (applicationCredentialsPath) {
    const fromApplicationCredentials = readCredentialsFile(applicationCredentialsPath);
    if (fromApplicationCredentials) {
      cachedCredentials = fromApplicationCredentials;
      return cachedCredentials;
    }
  }

  const credentialPaths = [
    join(process.cwd(), 'credentials.json'),
    join(process.cwd(), 'google-credentials.json'),
  ];

  for (const credentialPath of credentialPaths) {
    const fromFile = readCredentialsFile(credentialPath);
    if (fromFile) {
      cachedCredentials = fromFile;
      return cachedCredentials;
    }
  }

  throw new Error(
    'Google Vision credentials not found. Set GOOGLE_VISION_API_KEY in .env, or set ' +
      'GOOGLE_VISION_PRIVATE_KEY and GOOGLE_VISION_CLIENT_EMAIL, or place credentials.json ' +
      'in the project root.'
  );
}

async function detectTextViaRestApi(
  contentBase64: string,
  apiKey: string
): Promise<VisionTextDetectionResult> {
  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      requests: [
        {
          image: { content: contentBase64 },
          features: [{ type: 'TEXT_DETECTION' }],
        },
      ],
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const visionResponse = response.data?.responses?.[0] as
    | (VisionTextDetectionResult & { error?: { message?: string } })
    | undefined;

  if (!visionResponse) {
    throw new Error('Empty response from Google Vision API');
  }

  if (visionResponse.error?.message) {
    throw new Error(visionResponse.error.message);
  }

  return visionResponse;
}

export function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) {
    return visionClient;
  }

  const credentials = resolveGoogleVisionCredentials();

  visionClient = new ImageAnnotatorClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
  });

  return visionClient;
}

export async function detectTextInImage(contentBase64: string): Promise<VisionTextDetectionResult> {
  const apiKey = resolveGoogleVisionApiKey();
  if (apiKey) {
    return detectTextViaRestApi(contentBase64, apiKey);
  }

  const client = getVisionClient();
  const [result] = await client.textDetection({
    image: { content: contentBase64 },
  });

  return result as VisionTextDetectionResult;
}
