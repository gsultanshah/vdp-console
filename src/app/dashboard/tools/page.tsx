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

export default function ToolsPage() {
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData[]>([]);
  const [rawData, setRawData] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'raw' | 'plot'>('table');

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

      // Set text color to dark gray
      ctx.fillStyle = '#4B5563';

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
        
        annotations.forEach((annotation: any) => {
          if (annotation.boundingPoly && annotation.boundingPoly.vertices && annotation.boundingPoly.vertices.length > 0) {
            // Use the first vertex for positioning
            const firstVertex = annotation.boundingPoly.vertices[0];
            // Scale coordinates
            const x = Math.round((firstVertex.x || 0) * scaleX);
            const y = Math.round((firstVertex.y || 0) * scaleY);
            // Draw the text at the scaled position
            ctx.font = '14px Arial';
            ctx.fillText(annotation.description, x, y);
          }
        });
      }
    }
  }, [activeTab, rawData]);

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
                    onClick={() => tool.name === 'Test Extract Data' ? setShowImageModal(true) : null}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Open Tool
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
                  onClick={handleImageSubmit}
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
                    onClick={() => setActiveTab('plot')}
                    className={`${
                      activeTab === 'plot'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    Plot Data
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