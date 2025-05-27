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
    // Vision API
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
    const client = new ImageAnnotatorClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      projectId: credentials.project_id
    });
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
  } catch (error) {
    console.error('Error in public-final-json:', error);
    return NextResponse.json({ error: 'Failed to process image and generate final JSON.' }, { status: 500 });
  }
} 