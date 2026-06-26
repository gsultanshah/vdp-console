import { ImageAnnotatorClient } from '@google-cloud/vision';
import axios from 'axios';

let visionClient: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (visionClient) {
    return visionClient;
  }

  const credentials = {
    project_id: 'engaged-fact-460917-f7',
    private_key: process.env.GOOGLE_VISION_PRIVATE_KEY?.replace(/\\n/g, '\n') ??
      '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCPqu/FcFOS5SSG\n1DizcSQ0eFSY2UiCokOkRJ1SbmZiacTJvG6Q6rKES5uKKrViZ0Ghy6ki1Q3tHeJG\nEZ2wChiTBeuAPXwkho5DtfcdOTxmrZTlGNmxDYIb5LNYFwLWHC0gYTW36HledlZF\nphZ3o3JWfITrL8zgTzhigMJizMKhjcs25cRlZedxO3O6vJgjRmZUbarZ/N8Yq5fz\nL7yKXMb35y/Np9K5rZpWX9ExybO38BuE3qlRInhNq9PDhsXY9LKxIOMXa2q2cu34\nNYmLM6VK2aD3Qd2WOXCKyAC8gScMViWmD1ZSrYeGGJ4zxxI986r2z1tjCkpCDnvX\n18NEuNfxAgMBAAECggEACS0n53qHPAi6zonbnUqKv3c4IBMw2Hc4ztM7ITq/+2U6\nFpCcl1EGWgDiTG7x6vkhbg4uHXVyUETqYQNbCRV8AFgOdMB4n3SgvZ5vzEQNoZlQ\nu1lc/jwYpWN0ORovKjHeiATtg3Or3Oa+F/DF2ppsAS4u5z7EXUdyGIiU4e6mN99Y\nLUD1ck/7eabHy1n/zjjbfdMGlqTVyJWhXCI7D0F8euv7KS46lOydB//mVnhkYP4y\nMkD6koXQ2Cj2KNl0SyYBC2ewcGodOqYHUmpSmsD30+ip1BF868spcMkN1f0GOH5T\nDjnkOSjFdpzjYm0ACISl3KpXX2zpuW6c1dA4gbM3YQKBgQDCRgmesIC/pHcW4CeO\nyEpu6LRvMzavh0A+2p82XdPN5ufrKQuXXyUI5nLy2XQZbLvRBy3LWx4QttznHeDx\ngZksm8hB2uP7nxcftMUtmzXNoCofdudSbYF7LHI5DNcEjiiwjZF7aYjwtZ2BxKRj\nLXKpLZ1YUgdKHPGhfrTSUyV77QKBgQC9UK74ni4REngyKKFRwDfqx+pgnCsRRSHX\ndYwMQoSV9+UWlR0p6i1yswSTlunqci/Qo+cfjQyjZsBZhEezhk6rTXFYsuTHuJyi\nFNwN1hZkRb9sLJyIJSqcsfdwaeTU+eyozNg3b97VOzz5++TEAmV2ouYtCK1Pv9E/\nWiw3pSWzlQKBgAEh42B3auizDrala9WbOUPYO2UCiWkQgsFbCN6KQXfLxsJKJPUm\n6tJYdYcQ2Wpkhdu8DPpId65lQnheZjdCKCBocAxiOD35OWtH5HZVl0SxkE1KpiKG\n3OBY6/mFJ6OxKG+PA7ASd2ffxyFAgizJ0QdHaslfAQffj1D/qhInxeopAoGAfdka\n127flL3AZSeZRa0P/uTyq1JlVs+sFXywop29Yawu//oULv7bQ3o5upsB2LYbjwjF\n5bVwB1eQ2nES8QaBWWLbzGjvqMzSYvSW7CO7MuEixRhK3j5Gu2+a24GpeuLBLd0u\nhnu5l+oPOOb4RkyJgnn7pUg1XeRXh1O8PSltjJkCgYA11qeyixdPXneQ3AnwmY2F\n3RXPaTarC+7vCoM9EuQvA+KctcQ9Elx2aovjO9fMEwy6iZNxKogfziPxdtAPuN76\nlE0Ur4ft4amoIg/1JIYSgJqAwZJSajsTJFWa+EmfWoCVhNXxiUfNRMHDHG0swCXo\nwOJUrx7K8xKs1TpTbBjRJA==\n-----END PRIVATE KEY-----\n',
    client_email:
      process.env.GOOGLE_VISION_CLIENT_EMAIL ??
      'vdp-console@engaged-fact-460917-f7.iam.gserviceaccount.com',
  };

  visionClient = new ImageAnnotatorClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    projectId: credentials.project_id,
  });

  return visionClient;
}

export async function extractTextFromImageUrl(imageUrl: string): Promise<string> {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    headers: { Accept: 'image/*' },
  });
  const imageBuffer = Buffer.from(response.data);

  if (!imageBuffer.length) {
    throw new Error('Invalid image data received');
  }

  const client = getVisionClient();
  const [result] = await client.textDetection({
    image: { content: imageBuffer.toString('base64') },
  });

  return result.textAnnotations?.[0]?.description ?? '';
}
