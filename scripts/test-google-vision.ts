#!/usr/bin/env node
/**
 * Validate Google Vision credentials before running OCR jobs.
 */

import axios from 'axios';
import {
  detectTextInImage,
  loadDotEnvIfNeeded,
  resolveGoogleVisionApiKey,
  resolveGoogleVisionCredentials,
} from '../src/lib/google-vision-client';
import { JWT } from 'google-auth-library';

// 1x1 white PNG
const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function testApiKey(apiKey: string): Promise<void> {
  console.log('Using GOOGLE_VISION_API_KEY');
  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      requests: [
        {
          image: { content: TEST_IMAGE_BASE64 },
          features: [{ type: 'TEXT_DETECTION' }],
        },
      ],
    }
  );

  if (response.data?.responses?.[0]?.error) {
    throw new Error(response.data.responses[0].error.message);
  }

  await detectTextInImage(TEST_IMAGE_BASE64);
  console.log('API key auth OK');
}

async function testServiceAccount(): Promise<void> {
  const credentials = resolveGoogleVisionCredentials();
  console.log(`Using service account: ${credentials.client_email}`);

  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-vision'],
  });

  const token = await client.authorize();
  console.log(`Service account auth OK (token length: ${token.access_token?.length ?? 0})`);
}

async function main() {
  loadDotEnvIfNeeded();

  try {
    const apiKey = resolveGoogleVisionApiKey();
    if (apiKey) {
      await testApiKey(apiKey);
    } else {
      await testServiceAccount();
    }

    console.log('\nGoogle Vision credentials are valid.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nGoogle Vision credentials are invalid or missing.');
    console.error(message);
    console.error(`
Fix options:
  - API key: set GOOGLE_VISION_API_KEY in .env (enable Cloud Vision API for the key)
  - Service account: set GOOGLE_VISION_PRIVATE_KEY + GOOGLE_VISION_CLIENT_EMAIL, or credentials.json
`);
    process.exit(1);
  }
}

main();
