import { NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

// --- Helper functions from dashboard/tools/page.tsx logic ---
function estimateSkewAngle(annotations: any[]): number {
  const angles: number[] = [];
  annotations.forEach(annotation => {
    const v0 = annotation.boundingPoly.vertices[0];
    const v1 = annotation.boundingPoly.vertices[1];
    if (v0 && v1) {
      const dx = v1.x - v0.x;
      const dy = v1.y - v0.y;
      if (dx !== 0) {
        angles.push(Math.atan2(dy, dx));
      }
    }
  });
  angles.sort((a, b) => a - b);
  return angles.length > 0 ? angles[Math.floor(angles.length / 2)] : 0;
}

function rotatePoint(x: number, y: number, angle: number): { x: number, y: number } {
  return {
    x: Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
    y: Math.round(x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

function deskewAnnotations(annotations: any[], angle: number): any[] {
  return annotations.map(annotation => {
    const newVertices = annotation.boundingPoly.vertices.map((v: any) =>
      rotatePoint(v.x, v.y, -angle)
    );
    return {
      ...annotation,
      boundingPoly: {
        ...annotation.boundingPoly,
        vertices: newVertices,
      },
    };
  });
}

function processRows(annotations: any[]): any[] {
  const rows: any[] = [];
  let remainingAnnotations = [...annotations];
  while (remainingAnnotations.length > 0) {
    const firstElement = remainingAnnotations.reduce((lowest, current) => {
      const lowestY = Math.min(...lowest.boundingPoly.vertices.map((v: any) => v.y));
      const currentY = Math.min(...current.boundingPoly.vertices.map((v: any) => v.y));
      return currentY < lowestY ? current : lowest;
    });
    const rowHeight = Math.max(...firstElement.boundingPoly.vertices.map((v: any) => v.y)) -
                     Math.min(...firstElement.boundingPoly.vertices.map((v: any) => v.y));
    const rowElements = remainingAnnotations.filter(annotation => {
      const elementMinY = Math.min(...annotation.boundingPoly.vertices.map((v: any) => v.y));
      return elementMinY <= Math.min(...firstElement.boundingPoly.vertices.map((v: any) => v.y)) + (2 * rowHeight);
    });
    const sortedElements = rowElements.sort((a, b) => {
      const aX = Math.min(...a.boundingPoly.vertices.map((v: any) => v.x));
      const bX = Math.min(...b.boundingPoly.vertices.map((v: any) => v.x));
      return aX - bX;
    });
    const row = {
      y: Math.min(...firstElement.boundingPoly.vertices.map((v: any) => v.y)),
      elements: sortedElements.map(element => {
        const vertices = element.boundingPoly.vertices;
        const minX = Math.min(...vertices.map((v: any) => v.x));
        const maxX = Math.max(...vertices.map((v: any) => v.x));
        const minY = Math.min(...vertices.map((v: any) => v.y));
        const maxY = Math.max(...vertices.map((v: any) => v.y));
        return {
          text: element.description,
          x: minX,
          width: maxX - minX,
          height: maxY - minY,
          vertices: vertices,
          printableText: element.description.trim()
        };
      })
    };
    rows.push(row);
    remainingAnnotations = remainingAnnotations.filter(
      annotation => !rowElements.includes(annotation)
    );
  }
  return rows;
}

function processRowData(rows: any[]): any[] {
  const processedData: any[] = [];
  rows.forEach((row, rowIndex) => {
    // Sort elements by x position (highest x first)
    const sortedElements = [...row.elements].sort((a, b) => b.x - a.x);
    const silsila_no = sortedElements[0]?.text || '';
    const gharana_no = sortedElements[1]?.text || '';
    if (!silsila_no || isNaN(Number(silsila_no))) {
      return;
    }
    const remainingElements = sortedElements.slice(2);
    const concatenatedString = remainingElements.map(e => e.text).join(' ');
    const cnicPattern = /\d{5}-\d{7}-\d/;
    const cnicMatch = concatenatedString.match(cnicPattern);
    const cnic = cnicMatch ? cnicMatch[0] : '';
    const finalString = concatenatedString.replace(cnicPattern, '').trim();
    processedData.push({
      row: rowIndex + 1,
      silsila_no,
      gharana_no,
      cnic,
      remaining_text: finalString
    });
  });
  return processedData;
}

// --- API Route ---
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('imageurl');
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageurl query param is required' }, { status: 400 });
    }
    // Download image
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      headers: { 'Accept': 'image/*' }
    });
    const imageBuffer = Buffer.from(response.data);

    // Ensure the image buffer is valid
    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json({ error: 'Invalid image data received' }, { status: 400 });
    }

    // Vision API
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

    try {
      const [result] = await client.textDetection({
        image: { content: imageBuffer.toString('base64') }
      });
      const detections = result.textAnnotations;
      if (!detections || detections.length === 0) {
        return NextResponse.json({ error: 'No text detected in image' }, { status: 400 });
      }
      // Deskew and process
      const annotations = detections.slice(1);
      const skewAngle = estimateSkewAngle(annotations);
      const deskewedAnnotations = deskewAnnotations(annotations, skewAngle);
      const processedRows = processRows(deskewedAnnotations);
      const finalJson = processRowData(processedRows);
      return NextResponse.json({ finalJson });
    } catch (visionError: any) {
      console.error('Vision API Error:', visionError);
      return NextResponse.json({ 
        error: 'Failed to process image with Vision API. Please ensure the image is in a supported format (JPEG, PNG, GIF, BMP).',
        details: visionError.message || 'Unknown Vision API error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in public-final-json:', error);
    return NextResponse.json({ 
      error: 'Failed to process image and generate final JSON.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 