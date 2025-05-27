'use client';

import { useState, useEffect } from 'react';
import { MotionDiv } from '@/components/ui/Motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const tools = [
  {
    name: 'Upload Voter List',
    description: 'Upload and process new voter lists',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
  {
    name: 'Test Extract Data',
    description: 'Test and validate data extraction processes',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    name: 'Generate Final Output',
    description: 'Process image, align it, and generate final JSON output',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: 'Data Analysis',
    description: 'Analyze voter data and generate insights',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    name: 'Validation Tools',
    description: 'Validate and verify voter information',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: 'Data Export',
    description: 'Export voter data in various formats',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
  {
    name: 'Batch Processing',
    description: 'Process multiple voter lists simultaneously',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    name: 'Data Cleanup',
    description: 'Clean and standardize voter data',
    icon: (
      <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
];

interface ExtractedData {
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  cnic: string;
  age: string;
  address: string;
  rawText: string;
}

interface RowData {
  y: number;
  elements: Array<{
    text: string;
    x: number;
    width: number;
    height: number;
    printableText?: string;
    vertices?: Array<{ x: number; y: number }>;
  }>;
}

interface CellData {
  text: string;
  x: number;
  width: number;
  vertices: Array<{ x: number; y: number }>;
}

interface ProcessedRow {
  row: number;
  cells: CellData[];
}

interface ProcessedRowData {
  row: number;
  silsila_no: string;
  gharana_no: string;
  cnic: string;
  remaining_text: string;
}

function processRows(annotations: any[]): RowData[] {
  const rows: RowData[] = [];
  let remainingAnnotations = [...annotations];

  while (remainingAnnotations.length > 0) {
    // Find the element with the lowest y-coordinate
    const firstElement = remainingAnnotations.reduce((lowest, current) => {
      const lowestY = Math.min(...lowest.boundingPoly.vertices.map((v: any) => v.y));
      const currentY = Math.min(...current.boundingPoly.vertices.map((v: any) => v.y));
      return currentY < lowestY ? current : lowest;
    });

    // Calculate row height based on the highest y-coordinate in the first element
    const rowHeight = Math.max(...firstElement.boundingPoly.vertices.map((v: any) => v.y)) -
                     Math.min(...firstElement.boundingPoly.vertices.map((v: any) => v.y));

    // Find all elements that belong to this row
    const rowElements = remainingAnnotations.filter(annotation => {
      const elementMinY = Math.min(...annotation.boundingPoly.vertices.map((v: any) => v.y));
      const elementMaxY = Math.max(...annotation.boundingPoly.vertices.map((v: any) => v.y));
      
      // Element belongs to row if its y-coordinates overlap with the row's y-range
      // We use 2 * rowHeight as a threshold to handle tilted pages
      return elementMinY <= Math.min(...firstElement.boundingPoly.vertices.map((v: any) => v.y)) + (2 * rowHeight);
    });

    // Sort elements by x-coordinate
    const sortedElements = rowElements.sort((a, b) => {
      const aX = Math.min(...a.boundingPoly.vertices.map((v: any) => v.x));
      const bX = Math.min(...b.boundingPoly.vertices.map((v: any) => v.x));
      return aX - bX;
    });

    // Create row data
    const row: RowData = {
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

    // Remove processed elements from remaining annotations
    remainingAnnotations = remainingAnnotations.filter(
      annotation => !rowElements.includes(annotation)
    );
  }

  return rows;
}

// Utility to estimate skew angle (in radians) from annotation bounding boxes
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
  // Return median angle (in radians)
  angles.sort((a, b) => a - b);
  return angles.length > 0 ? angles[Math.floor(angles.length / 2)] : 0;
}

// Utility to rotate a point by a given angle (in radians)
function rotatePoint(x: number, y: number, angle: number): { x: number, y: number } {
  return {
    x: Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
    y: Math.round(x * Math.sin(angle) + y * Math.cos(angle)),
  };
}

// Deskew all annotation bounding box vertices by the given angle
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

function processRowsIntoCells(rows: RowData[]): ProcessedRow[] {
  return rows.map((row, rowIndex) => {
    const cells: CellData[] = [];
    let currentCell: CellData | null = null;

    // Sort elements by x position
    const sortedElements = [...row.elements].sort((a, b) => a.x - b.x);

    sortedElements.forEach((element) => {
      if (!currentCell) {
        // Start new cell
        currentCell = {
          text: element.text,
          x: element.x,
          width: element.width,
          vertices: element.vertices || []
        };
      } else {
        const lastVertexX = currentCell.vertices[currentCell.vertices.length - 1]?.x || 0;
        const currentElementX = element.vertices?.[0]?.x || element.x;

        // Check if this element should be part of current cell or start new cell
        if (currentElementX - (lastVertexX + currentCell.width) > 3) {
          // Start new cell
          cells.push(currentCell);
          currentCell = {
            text: element.text,
            x: element.x,
            width: element.width,
            vertices: element.vertices || []
          };
        } else {
          // Add to current cell with a space
          currentCell.text = currentCell.text.trim() + ' ' + element.text.trim();
          currentCell.width = element.width + (element.x - currentCell.x);
          if (element.vertices) {
            currentCell.vertices = [...currentCell.vertices, ...element.vertices];
          }
        }
      }
    });

    // Add the last cell if exists
    if (currentCell) {
      cells.push(currentCell);
    }

    return {
      row: rowIndex + 1,
      cells
    };
  });
}

function processRowData(rows: RowData[]): ProcessedRowData[] {
  const processedData: ProcessedRowData[] = [];
  
  rows.forEach((row, rowIndex) => {
    console.log(`\n=== Processing Row ${rowIndex + 1} ===`);
    
    // Sort elements by x position (highest x first)
    const sortedElements = [...row.elements].sort((a, b) => b.x - a.x);
    
    // Extract silsila_no and gharana_no
    const silsila_no = sortedElements[0]?.text || '';
    const gharana_no = sortedElements[1]?.text || '';
    
    // Skip if silsila_no is not a valid number
    if (!silsila_no || isNaN(Number(silsila_no))) {
      console.log('Skipping row - Invalid silsila_no:', silsila_no);
      return;
    }
    
    console.log('Silsila No:', silsila_no);
    console.log('Gharana No:', gharana_no);
    
    // Remove silsila_no and gharana_no from the array
    const remainingElements = sortedElements.slice(2);
    console.log('Remaining elements:', remainingElements.map(e => e.text));
    
    // Concatenate remaining values
    const concatenatedString = remainingElements.map(e => e.text).join(' ');
    console.log('Concatenated string:', concatenatedString);
    
    // Find CNIC pattern
    const cnicPattern = /\d{5}-\d{7}-\d/;
    const cnicMatch = concatenatedString.match(cnicPattern);
    const cnic = cnicMatch ? cnicMatch[0] : '';
    
    console.log('Found CNIC:', cnic);
    
    // Remove CNIC from string
    const finalString = concatenatedString.replace(cnicPattern, '').trim();
    console.log('Final string (without CNIC):', finalString);
    
    // Add to processed data
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

export default function ToolsPage() {
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [lastImageUrl, setLastImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [rowData, setRowData] = useState<RowData[]>([]);
  const [processedCells, setProcessedCells] = useState<ProcessedRow[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'raw' | 'plot' | 'rowData' | 'htmlRows' | 'deskewed' | 'cells' | 'finalJson'>('table');
  const [alignedAngle, setAlignedAngle] = useState<number>(0);
  const [alignedAnnotations, setAlignedAnnotations] = useState<any[] | null>(null);
  const [finalProcessedData, setFinalProcessedData] = useState<ProcessedRowData[]>([]);
  const [modalPurpose, setModalPurpose] = useState<'extract' | 'finalOutput'>('extract');

  const handleImageSubmit = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      const response = await fetch('/api/extract-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process image');
      }

      setExtractedData(result.data);
      setRawData(result.rawData);
      setLastImageUrl(imageUrl);
      setAlignedAngle(0);
      setAlignedAnnotations(null);
      
      // Process raw data to generate row-based structure
      if (result.rawData?.textAnnotations) {
        const annotations = result.rawData.textAnnotations.slice(1);
        const skewAngle = estimateSkewAngle(annotations);
        const deskewedAnnotations = deskewAnnotations(annotations, skewAngle);
        const processedRows = processRows(deskewedAnnotations);
        setRowData(processedRows);

        // Process and log row data
        const processedData = processRowData(processedRows);
        setFinalProcessedData(processedData);

        // Process rows into cells
        const cells = processRowsIntoCells(processedRows);
        setProcessedCells(cells);
      }

      setShowImageModal(false);
      setShowResults(true);
      setImageUrl('');
    } catch (error) {
      console.error('Failed to process image:', error);
      setError(error instanceof Error ? error.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  // Align image handler
  const handleAlignImage = () => {
    if (!rawData?.textAnnotations) return;
    const annotations = rawData.textAnnotations.slice(1);
    const skewAngle = estimateSkewAngle(annotations);
    setAlignedAngle(-skewAngle);
    const aligned = deskewAnnotations(annotations, -skewAngle);
    setAlignedAnnotations(aligned);
    // Update rowData to use aligned annotations
    setRowData(processRows(aligned));
  };

  const handleGenerateFinalOutput = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      if (!lastImageUrl) {
        setError('Please process an image first');
        return;
      }

      const response = await fetch('/api/extract-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: lastImageUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process image');
      }

      setRawData(result.rawData);
      
      if (result.rawData?.textAnnotations) {
        const annotations = result.rawData.textAnnotations.slice(1);
        // Apply deskew
        const skewAngle = estimateSkewAngle(annotations);
        const deskewedAnnotations = deskewAnnotations(annotations, skewAngle);
        setAlignedAngle(-skewAngle);
        setAlignedAnnotations(deskewedAnnotations);
        
        // Process rows
        const processedRows = processRows(deskewedAnnotations);
        setRowData(processedRows);
        
        // Process and generate final data
        const processedData = processRowData(processedRows);
        setFinalProcessedData(processedData);
        
        // Process cells (keeping existing functionality)
        const cells = processRowsIntoCells(processedRows);
        setProcessedCells(cells);
      }

      setShowResults(true);
      setActiveTab('finalJson');
    } catch (error) {
      console.error('Failed to generate final output:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate final output');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageModalSubmit = async () => {
    if (modalPurpose === 'finalOutput') {
      setLastImageUrl(imageUrl); // set for future use
      setShowImageModal(false);
      setTimeout(() => handleGenerateFinalOutput(), 0);
    } else {
      await handleImageSubmit();
    }
  };

  useEffect(() => {
    if (activeTab === 'plot' && rawData) {
      const canvas = document.getElementById('plotCanvas') as HTMLCanvasElement;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas dimensions to match the container
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }

      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get original image dimensions from Vision API
      let imgWidth = 1, imgHeight = 1;
      if (rawData.fullTextAnnotation && rawData.fullTextAnnotation.pages && rawData.fullTextAnnotation.pages.length > 0) {
        imgWidth = rawData.fullTextAnnotation.pages[0].width || 1;
        imgHeight = rawData.fullTextAnnotation.pages[0].height || 1;
      }

      // Calculate scale factors
      const scaleX = canvas.width / imgWidth;
      const scaleY = canvas.height / imgHeight;

      // Process text annotations
      if (rawData.textAnnotations && rawData.textAnnotations.length > 0) {
        // Skip the first annotation as it contains the full text
        const annotations = rawData.textAnnotations.slice(1);
        
        // Group annotations by y-position to identify rows
        const yPositions = new Set<number>();
        annotations.forEach((annotation: any) => {
          if (annotation.boundingPoly?.vertices?.[0]?.y) {
            yPositions.add(annotation.boundingPoly.vertices[0].y);
          }
        });

        // Sort y-positions to get rows in order
        const sortedYPositions = Array.from(yPositions).sort((a: number, b: number) => a - b);

        // Create a map of y-position to row index
        const yToRowMap = new Map<number, number>();
        sortedYPositions.forEach((y, index) => {
          yToRowMap.set(y, index);
        });

        // Generate random colors for each row
        const rowColors = sortedYPositions.map(() => {
          const hue = Math.random() * 360;
          return `hsla(${hue}, 70%, 80%, 0.3)`;
        });

        // Calculate row heights
        const rowHeights = new Map<number, number>();
        annotations.forEach((annotation: any) => {
          if (annotation.boundingPoly?.vertices?.[0]?.y) {
            const y = annotation.boundingPoly.vertices[0].y;
            const vertices = annotation.boundingPoly.vertices;
            const minY = Math.min(...vertices.map((v: any) => v.y));
            const maxY = Math.max(...vertices.map((v: any) => v.y));
            const height = maxY - minY;
            
            // Store the maximum height for each row
            const currentHeight = rowHeights.get(y) || 0;
            rowHeights.set(y, Math.max(currentHeight, height));
          }
        });

        // Draw full-width row backgrounds
        sortedYPositions.forEach((y, index) => {
          const rowHeight = rowHeights.get(y) || 0;
          const nextY = sortedYPositions[index + 1];
          const height = nextY ? (nextY - y) : rowHeight;

          ctx.fillStyle = rowColors[index];
          ctx.fillRect(
            0,
            y * scaleY,
            canvas.width,
            height * scaleY
          );
        });

        // Draw text on top of the backgrounds
        ctx.fillStyle = '#4B5563';
        annotations.forEach((annotation: any) => {
          if (annotation.boundingPoly?.vertices?.[0]) {
            const firstVertex = annotation.boundingPoly.vertices[0];
            const x = Math.round(firstVertex.x * scaleX);
            const y = Math.round(firstVertex.y * scaleY);
            ctx.font = '14px Arial';
            ctx.fillText(annotation.description, x, y);
          }
        });
      }
    }
  }, [activeTab, rawData]);

  useEffect(() => {
    if (activeTab === 'deskewed' && rawData && lastImageUrl) {
      const canvas = document.getElementById('deskewedCanvas') as HTMLCanvasElement;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Load the image
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Set canvas size to image's natural size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        // Draw the image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // If alignedAngle is set, rotate the image
        if (alignedAngle !== 0) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(alignedAngle);
          ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        }

        // Draw deskewed or aligned bounding boxes
        let annotationsToDraw = alignedAnnotations || (rawData.textAnnotations && rawData.textAnnotations.length > 1 ? deskewAnnotations(rawData.textAnnotations.slice(1), estimateSkewAngle(rawData.textAnnotations.slice(1))) : []);
        if (annotationsToDraw && annotationsToDraw.length > 0) {
          ctx.save();
          if (alignedAngle !== 0) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(alignedAngle);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
          }
          ctx.strokeStyle = 'rgba(255,0,0,0.7)';
          ctx.lineWidth = 2;
          annotationsToDraw.forEach(annotation => {
            const vertices = annotation.boundingPoly.vertices;
            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
              ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
          });
          ctx.restore();
        }
      };
      img.src = lastImageUrl;
    }
  }, [activeTab, rawData, lastImageUrl, alignedAngle, alignedAnnotations]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Tools
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, index) => (
            <MotionDiv
              key={tool.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    {tool.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{tool.name}</h3>
                    <p className="mt-1 text-sm text-gray-500">{tool.description}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (tool.name === 'Test Extract Data') {
                        setModalPurpose('extract');
                        setShowImageModal(true);
                      } else if (tool.name === 'Generate Final Output') {
                        if (!lastImageUrl) {
                          setModalPurpose('finalOutput');
                          setShowImageModal(true);
                        } else {
                          handleGenerateFinalOutput();
                        }
                      }
                    }}
                    disabled={tool.name === 'Generate Final Output' && isProcessing}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tool.name === 'Generate Final Output' && isProcessing ? 'Processing...' : 'Open Tool'}
                  </button>
                </div>
              </div>
            </MotionDiv>
          ))}
        </div>

        {/* Image URL Modal */}
        {showImageModal && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Enter Image URL
                </h3>
                <button
                  onClick={() => setShowImageModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-4">
                <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-700">
                  Image URL
                </label>
                <input
                  type="url"
                  id="imageUrl"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-800"
                />
                {error && (
                  <p className="mt-2 text-sm text-red-600">{error}</p>
                )}
              </div>
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleImageModalSubmit}
                  disabled={isProcessing || !imageUrl}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing...' : 'Process Image'}
                </button>
                <button
                  onClick={() => setShowImageModal(false)}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Modal */}
        {showResults && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Extracted Data
                </h3>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-4">
                <button
                  onClick={handleAlignImage}
                  className="inline-flex items-center px-4 py-2 border border-indigo-600 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mb-2 mr-4"
                >
                  Align Image
                </button>
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('table')}
                    className={`${
                      activeTab === 'table'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Table View
                  </button>
                  <button
                    onClick={() => setActiveTab('raw')}
                    className={`${
                      activeTab === 'raw'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Raw JSON
                  </button>
                  <button
                    onClick={() => setActiveTab('rowData')}
                    className={`${
                      activeTab === 'rowData'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Row Data
                  </button>
                  <button
                    onClick={() => setActiveTab('htmlRows')}
                    className={`${
                      activeTab === 'htmlRows'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    HTML Rows
                  </button>
                  <button
                    onClick={() => setActiveTab('plot')}
                    className={`${
                      activeTab === 'plot'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Plot Data
                  </button>
                  <button
                    onClick={() => setActiveTab('deskewed')}
                    className={`${
                      activeTab === 'deskewed'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Deskewed Image
                  </button>
                  <button
                    onClick={() => setActiveTab('cells')}
                    className={`${
                      activeTab === 'cells'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Cell Data
                  </button>
                  <button
                    onClick={() => setActiveTab('finalJson')}
                    className={`${
                      activeTab === 'finalJson'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Final JSON
                  </button>
                </nav>
              </div>

              <div className="mt-4">
                {activeTab === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Silsila No</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gharana No</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNIC</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Age</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {extractedData.map((row, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.silsilaNo}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.gharanaNo}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.cnic}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.age}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">{row.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : activeTab === 'raw' ? (
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
                      }}
                      className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                      title="Copy to clipboard"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <pre className="text-sm text-gray-800 overflow-auto max-h-[60vh]">
                      {JSON.stringify(rawData, null, 2)}
                    </pre>
                  </div>
                ) : activeTab === 'rowData' ? (
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(rowData, null, 2));
                      }}
                      className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                      title="Copy to clipboard"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <pre className="text-sm text-gray-800 overflow-auto max-h-[60vh]">
                      {JSON.stringify(rowData, null, 2)}
                    </pre>
                  </div>
                ) : activeTab === 'htmlRows' ? (
                  <div className="bg-white rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        const htmlContent = document.getElementById('htmlRowsTable')?.outerHTML;
                        if (htmlContent) {
                          navigator.clipboard.writeText(htmlContent);
                        }
                      }}
                      className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                      title="Copy HTML to clipboard"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <div className="overflow-x-auto">
                      <table id="htmlRowsTable" className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Elements</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {rowData.map((row, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {index + 1}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                {row.elements[0]?.printableText || ''}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                <div className="space-y-1">
                                  {row.elements.map((element, elementIndex) => (
                                    <div key={elementIndex} className="flex items-center space-x-2">
                                      <span className="text-gray-500">[{elementIndex + 1}]</span>
                                      <span>{element.text}</span>
                                      <span className="text-gray-400 text-xs">
                                        (x: {element.x}, w: {element.width})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : activeTab === 'deskewed' ? (
                  <div className="bg-white rounded-lg p-4 relative">
                    <div className="relative w-full overflow-auto" style={{ height: '60vh' }}>
                      <canvas
                        id="deskewedCanvas"
                        className="border border-gray-200 bg-white"
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxWidth: '100%',
                          display: 'block',
                          position: 'relative',
                        }}
                      />
                    </div>
                  </div>
                ) : activeTab === 'cells' ? (
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(processedCells, null, 2));
                      }}
                      className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                      title="Copy to clipboard"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cells</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {processedCells.map((row) => (
                            <tr key={row.row}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {row.row}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900">
                                <div className="space-y-2">
                                  {row.cells.map((cell, cellIndex) => (
                                    <div key={cellIndex} className="flex items-center space-x-2">
                                      <span className="text-gray-500">Cell {cellIndex + 1}:</span>
                                      <span>{cell.text}</span>
                                      <span className="text-gray-400 text-xs">
                                        (x: {cell.x}, width: {cell.width})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4">
                      <pre className="text-sm text-gray-800 overflow-auto max-h-[30vh] bg-white p-4 rounded-lg">
                        {JSON.stringify(processedCells, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : activeTab === 'finalJson' ? (
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(finalProcessedData, null, 2));
                      }}
                      className="absolute top-2 right-2 p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md"
                      title="Copy to clipboard"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    </button>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Silsila No</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gharana No</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNIC</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining Text</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {finalProcessedData.map((row) => (
                            <tr key={row.row}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.row}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.silsila_no}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.gharana_no}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.cnic}</td>
                              <td className="px-6 py-4 text-sm text-gray-900">{row.remaining_text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4">
                      <pre className="text-sm text-gray-800 overflow-auto max-h-[30vh] bg-white p-4 rounded-lg">
                        {JSON.stringify(finalProcessedData, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 relative">
                    <div className="relative w-full overflow-auto" style={{ height: '60vh' }}>
                      <canvas
                        id="plotCanvas"
                        className="border border-gray-200 bg-white"
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setShowResults(false)}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 