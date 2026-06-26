import { NextResponse } from 'next/server';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { detectTextInImage } from '@/lib/google-vision-client';

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
    const result = await detectTextInImage(processedImageBuffer.toString('base64'));
    
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