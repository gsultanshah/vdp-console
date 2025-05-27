import { NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

// Initialize Vision API client with credentials
const credentials = {
  type: "service_account",
  project_id: "engaged-fact-460917-f7",
  private_key_id: "5154c95af3e5f5c88a4ae7ba43d3a76c50cbb890",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCPqu/FcFOS5SSG\n1DizcSQ0eFSY2UiCokOkRJ1SbmZiacTJvG6Q6rKES5uKKrViZ0Ghy6ki1Q3tHeJG\nEZ2wChiTBeuAPXwkho5DtfcdOTxmrZTlGNmxDYIb5LNYFwLWHC0gYTW36HledlZF\nphZ3o3JWfITrL8zgTzhigMJizMKhjcs25cRlZedxO3O6vJgjRmZUbarZ/N8Yq5fz\nL7yKXMb35y/Np9K5rZpWX9ExybO38BuE3qlRInhNq9PDhsXY9LKxIOMXa2q2cu34\nNYmLM6VK2aD3Qd2WOXCKyAC8gScMViWmD1ZSrYeGGJ4zxxI986r2z1tjCkpCDnvX\n18NEuNfxAgMBAAECggEACS0n53qHPAi6zonbnUqKv3c4IBMw2Hc4ztM7ITq/+2U6\nFpCcl1EGWgDiTG7x6vkhbg4uHXVyUETqYQNbCRV8AFgOdMB4n3SgvZ5vzEQNoZlQ\nu1lc/jwYpWN0ORovKjHeiATtg3Or3Oa+F/DF2ppsAS4u5z7EXUdyGIiU4e6mN99Y\nLUD1ck/7eabHy1n/zjjbfdMGlqTVyJWhXCI7D0F8euv7KS46lOydB//mVnhkYP4y\nMkD6koXQ2Cj2KNl0SyYBC2ewcGodOqYHUmpSmsD30+ip1BF868spcMkN1f0GOH5T\nDjnkOSjFdpzjYm0ACISl3KpXX2zpuW6c1dA4gbM3YQKBgQDCRgmesIC/pHcW4CeO\nyEpu6LRvMzavh0A+2p82XdPN5ufrKQuXXyUI5nLy2XQZbLvRBy3LWx4QttznHeDx\ngZksm8hB2uP7nxcftMUtmzXNoCofdudSbYF7LHI5DNcEjiiwjZF7aYjwtZ2BxKRj\nLXKpLZ1YUgdKHPGhfrTSUyV77QKBgQC9UK74ni4REngyKKFRwDfqx+pgnCsRRSHX\ndYwMQoSV9+UWlR0p6i1yswSTlunqci/Qo+cfjQyjZsBZhEezhk6rTXFYsuTHuJyi\nFNwN1hZkRb9sLJyIJSqcsfdwaeTU+eyozNg3b97VOzz5++TEAmV2ouYtCK1Pv9E/\nWiw3pSWzlQKBgAEh42B3auizDrala9WbOUPYO2UCiWkQgsFbCN6KQXfLxsJKJPUm\n6tJYdYcQ2Wpkhdu8DPpId65lQnheZjdCKCBocAxiOD35OWtH5HZVl0SxkE1KpiKG\n3OBY6/mFJ6OxKG+PA7ASd2ffxyFAgizJ0QdHaslfAQffj1D/qhInxeopAoGAfdka\n127flL3AZSeZRa0P/uTyq1JlVs+sFXywop29Yawu//oULv7bQ3o5upsB2LYbjwjF\n5bVwB1eQ2nES8QaBWWLbzGjvqMzSYvSW7CO7MuEixRhK3j5Gu2+a24GpeuLBLd0u\nhnu5l+oPOOb4RkyJgnn7pUg1XeRXh1O8PSltjJkCgYA11qeyixdPXneQ3AnwmY2F\n3RXPaTarC+7vCoM9EuQvA+KctcQ9Elx2aovjO9fMEwy6iZNxKogfziPxdtAPuN76\nlE0Ur4ft4amoIg/1JIYSgJqAwZJSajsTJFWa+EmfWoCVhNXxiUfNRMHDHG0swCXo\nwOJUrx7K8xKs1TpTbBjRJA==\n-----END PRIVATE KEY-----\n",
  client_email: "vdp-console@engaged-fact-460917-f7.iam.gserviceaccount.com",
  client_id: "106905403905044130231",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/vdp-console%40engaged-fact-460917-f7.iam.gserviceaccount.com"
};

const client = new ImageAnnotatorClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id
});

// Supported image formats by Google Cloud Vision API
const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'ico'];

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // Download image
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      headers: {
        'Accept': 'image/*'
      }
    });
    
    const imageBuffer = Buffer.from(response.data);

    // Validate and convert image format
    let processedImageBuffer;
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      
      // Check if the format is supported
      if (!metadata.format || !SUPPORTED_FORMATS.includes(metadata.format.toLowerCase())) {
        // Convert to JPEG if format is not supported
        processedImageBuffer = await image
          .jpeg({ quality: 90 }) // Convert to JPEG with good quality
          .toBuffer();
      } else {
        processedImageBuffer = imageBuffer;
      }
    } catch (error) {
      console.error('Error processing image format:', error);
      return NextResponse.json(
        { error: 'Failed to process image format. Please ensure the image is in a supported format.' },
        { status: 400 }
      );
    }

    // Perform OCR
    const [result] = await client.textDetection({
      image: {
        content: processedImageBuffer.toString('base64')
      }
    });
    
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return NextResponse.json({ error: 'No text detected in image' }, { status: 400 });
    }

    // Process the extracted text
    const extractedData = processExtractedText(detections);

    return NextResponse.json({ 
      data: extractedData,
      rawData: result // Include the raw Google Vision API response
    });
  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      { error: 'Failed to process image. Please ensure the image is accessible and contains clear text.' },
      { status: 500 }
    );
  }
}

function processExtractedText(detections: any[]) {
  const tableData = [];
  const minLineHeight = 40;
  const diffByColWidth = [20, 20, 30, 50, 20, 20, 100];
  const allowedCellTextLength = [4, 4, 30, 150, 200, 200, 200];

  // Sort detections by Y position
  const sortedDetections = detections
    .filter(d => d.description && d.description.length < 300)
    .sort((a, b) => a.boundingPoly.vertices[0].y - b.boundingPoly.vertices[0].y);

  let currentRow = [];
  let lastY = 0;

  for (const detection of sortedDetections) {
    const y = detection.boundingPoly.vertices[0].y;
    const x = detection.boundingPoly.vertices[0].x;
    const text = detection.description;

    if (y > lastY + minLineHeight) {
      if (currentRow.length > 0) {
        tableData.push(processRow(currentRow));
        currentRow = [];
      }
    }

    currentRow.push({ x, y, text });
    lastY = y;
  }

  // Process the last row
  if (currentRow.length > 0) {
    tableData.push(processRow(currentRow));
  }

  return tableData;
}

function processRow(row: any[]) {
  // Sort row items by X position
  row.sort((a, b) => a.x - b.x);

  // Extract data using regex patterns
  const rowText = row.map(item => item.text).join(' ');
  
  const cnic = extractCNIC(rowText);
  const silsilaNo = extractSilsilaNo(rowText);
  const gharanaNo = extractGharanaNo(rowText);
  const age = extractAge(rowText);
  const name = extractName(rowText, cnic, age);
  const address = extractAddress(rowText, cnic, age);

  return {
    silsilaNo,
    gharanaNo,
    name,
    cnic,
    age,
    address,
    rawText: rowText
  };
}

function extractCNIC(text: string) {
  const cnicRegex = /\d{5}-\d{7}-\d/;
  const match = text.match(cnicRegex);
  return match ? match[0] : '';
}

function extractSilsilaNo(text: string) {
  const silsilaRegex = /^\d+/;
  const match = text.match(silsilaRegex);
  return match ? match[0] : '';
}

function extractGharanaNo(text: string) {
  const gharanaRegex = /\d+\s+(\d+)/;
  const match = text.match(gharanaRegex);
  return match ? match[1] : '';
}

function extractAge(text: string) {
  const ageRegex = /(\d+)\s*سال/;
  const match = text.match(ageRegex);
  return match ? match[1] : '';
}

function extractName(text: string, cnic: string, age: string) {
  let name = text;
  [cnic, age].forEach(item => {
    if (item) {
      name = name.replace(item, '').trim();
    }
  });
  return name.replace(/[| ]/g, '').trim();
}

function extractAddress(text: string, cnic: string, age: string) {
  let address = text;
  [cnic, age].forEach(item => {
    if (item) {
      address = address.replace(item, '').trim();
    }
  });
  return address.replace(/[| ]/g, '').trim();
} 