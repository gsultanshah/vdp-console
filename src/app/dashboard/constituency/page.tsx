'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { canSeeProcessButtons } from '@/lib/utils';

interface BlockCode {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  tag: string;
  halkaName: string;
  gender: string;
  religion: string;
  status: string;
  uploadedAt: string;
}

interface Estimate {
  _id: string;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  totalVoters: number;
  estimatedAt: string;
}

interface Constituency {
  _id: string;
  halkaName: string;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  totalVoters: number;
  blockCodes: string[];
  lastUpdated: string;
  estimates: Estimate[];
}

interface BlockCodeStats {
  totalFiles: number;
  estimatedVoters: number;
  estimatedReligion: {
    min: number;
    max: number;
  };
  estimatedGender: {
    min: number;
    max: number;
  };
}

interface VoterStats {
  totalFiles: number;
  totalMuslimVoters: {
    min: number;
    max: number;
  };
  totalMale: {
    min: number;
    max: number;
  };
  totalFemale: {
    min: number;
    max: number;
  };
}

interface EstimationProgress {
  current: number;
  total: number;
  isEstimating: boolean;
}

interface ProcessingProgress {
  current: number;
  total: number;
  isProcessing: boolean;
}

export default function ConstituencyPage() {
  const { data: session } = useSession();
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [selectedConstituency, setSelectedConstituency] = useState<Constituency | null>(null);
  const [blockCodeStats, setBlockCodeStats] = useState<Record<string, BlockCodeStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isEstimating, setIsEstimating] = useState<Record<string, boolean>>({});
  const [estimationProgress, setEstimationProgress] = useState<Record<string, EstimationProgress>>({});
  const [showEstimates, setShowEstimates] = useState<Record<string, boolean>>({});
  const [isUpdatingCount, setIsUpdatingCount] = useState<Record<string, boolean>>({});
  const [showVoterStats, setShowVoterStats] = useState<boolean>(false);
  const [selectedBlockCode, setSelectedBlockCode] = useState<string>('');
  const [voterStats, setVoterStats] = useState<VoterStats | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    current: 0,
    total: 0,
    isProcessing: false
  });
  const router = useRouter();

  useEffect(() => {
    fetchConstituencies();
  }, []);

  const fetchConstituencies = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/constituency');
      const data = await response.json();
      setConstituencies(data);
    } catch (error) {
      console.error('Failed to fetch constituencies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const estimateBlockCodeStats = async (blockCode: string) => {
    try {
      setIsEstimating(prev => ({ ...prev, [blockCode]: true }));
      const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
      const data: BlockCode[] = await response.json();
      
      const totalFiles = data.length;
      const estimatedVoters = totalFiles * 28;
      const estimatedReligion = {
        min: estimatedVoters - 31,
        max: estimatedVoters + 31
      };
      const estimatedGender = {
        min: estimatedVoters - 31,
        max: estimatedVoters + 31
      };

      setBlockCodeStats(prev => ({
        ...prev,
        [blockCode]: {
          totalFiles,
          estimatedVoters,
          estimatedReligion,
          estimatedGender
        }
      }));
    } catch (error) {
      console.error('Failed to estimate block code stats:', error);
    } finally {
      setIsEstimating(prev => ({ ...prev, [blockCode]: false }));
    }
  };

  const estimateConstituency = async (constituency: Constituency) => {
    try {
      setEstimationProgress(prev => ({
        ...prev,
        [constituency._id]: {
          current: 0,
          total: constituency.blockCodes.length,
          isEstimating: true
        }
      }));

      let totalMuslimMale = 0;
      let totalMuslimFemale = 0;
      let totalQadianiMale = 0;
      let totalQadianiFemale = 0;

      for (let i = 0; i < constituency.blockCodes.length; i++) {
        const blockCode = constituency.blockCodes[i];
        const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
        const data: BlockCode[] = await response.json();

        // Calculate statistics for this block code
        const totalFiles = data.length;
        const estimatedVoters = totalFiles * 28;

        // Update progress
        setEstimationProgress(prev => ({
          ...prev,
          [constituency._id]: {
            ...prev[constituency._id],
            current: i + 1
          }
        }));

        // Update running totals
        totalMuslimMale += data.filter(d => d.religion === 'muslim' && d.gender === 'male').length * 28;
        totalMuslimFemale += data.filter(d => d.religion === 'muslim' && d.gender === 'female').length * 28;
        totalQadianiMale += data.filter(d => d.religion === 'qadiani' && d.gender === 'male').length * 28;
        totalQadianiFemale += data.filter(d => d.religion === 'qadiani' && d.gender === 'female').length * 28;

        // Update block code stats
        setBlockCodeStats(prev => ({
          ...prev,
          [blockCode]: {
            totalFiles,
            estimatedVoters,
            estimatedReligion: {
              min: estimatedVoters - 31,
              max: estimatedVoters + 31
            },
            estimatedGender: {
              min: estimatedVoters - 31,
              max: estimatedVoters + 31
            }
          }
        }));
      }

      const totalVoters = totalMuslimMale + totalMuslimFemale + totalQadianiMale + totalQadianiFemale;

      // Create new estimate
      const newEstimate = {
        muslimMale: totalMuslimMale,
        muslimFemale: totalMuslimFemale,
        qadianiMale: totalQadianiMale,
        qadianiFemale: totalQadianiFemale,
        totalVoters,
        estimatedAt: new Date().toISOString()
      };

      // Save to database
      const response = await fetch('/api/constituency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _id: constituency._id,
          estimates: [...(constituency.estimates || []), newEstimate]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save constituency data');
      }

      const savedConstituency = await response.json();

      // Update local state with saved data
      setConstituencies(prev => 
        prev.map(c => c._id === constituency._id ? savedConstituency : c)
      );

    } catch (error) {
      console.error('Failed to estimate constituency:', error);
    } finally {
      setEstimationProgress(prev => ({
        ...prev,
        [constituency._id]: {
          ...prev[constituency._id],
          isEstimating: false
        }
      }));
    }
  };

  const updateFromEstimate = async (constituencyId: string, estimateId: string) => {
    try {
      setIsUpdatingCount(prev => ({ ...prev, [estimateId]: true }));
      
      const response = await fetch('/api/constituency', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _id: constituencyId,
          updateFromEstimate: estimateId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update constituency counts');
      }

      const updatedConstituency = await response.json();
      
      // Update local state with the new counts
      setConstituencies(prev => 
        prev.map(c => c._id === constituencyId ? updatedConstituency : c)
      );

    } catch (error) {
      console.error('Failed to update constituency counts:', error);
    } finally {
      setIsUpdatingCount(prev => ({ ...prev, [estimateId]: false }));
    }
  };

  const processVoterStats = async (blockCode: string) => {
    try {
      setSelectedBlockCode(blockCode);
      const response = await fetch(`/api/blockcodes?blockCode=${blockCode}`);
      const data: BlockCode[] = await response.json();
      
      const totalFiles = data.length;
      const maleFiles = data.filter(d => d.gender === 'male').length;
      const femaleFiles = data.filter(d => d.gender === 'female').length;
      
      const stats: VoterStats = {
        totalFiles,
        totalMuslimVoters: {
          min: (totalFiles * 28) - 31,
          max: (totalFiles * 28) + 27
        },
        totalMale: {
          min: (maleFiles * 28) - 31,
          max: (maleFiles * 28) + 27
        },
        totalFemale: {
          min: (femaleFiles * 28) - 31,
          max: (femaleFiles * 28) + 27
        }
      };
      
      setVoterStats(stats);
      setShowVoterStats(true);
    } catch (error) {
      console.error('Failed to process voter stats:', error);
    }
  };

  const initiateProcess = async () => {
    try {
      setIsProcessing(true);
      setProcessingProgress({
        current: 0,
        total: 0,
        isProcessing: true
      });

      // Get all documents for the selected block code
      const response = await fetch(`/api/blockcodes?blockCode=${selectedBlockCode}`);
      const blockCodeDocs: BlockCode[] = await response.json();
      
      setProcessingProgress(prev => ({
        ...prev,
        total: blockCodeDocs.length
      }));

      // Process each document
      for (let i = 0; i < blockCodeDocs.length; i++) {
        const doc = blockCodeDocs[i];
        const encodedUrl = encodeURIComponent(doc.url);
        
        // Call the API to get voter data
        const voterResponse = await fetch(`/api/public-final-json?imageurl=${encodedUrl}`);
        const voterData = await voterResponse.json();

        // Save each voter to the database
        if (voterData.finalJson && Array.isArray(voterData.finalJson)) {
          for (const voter of voterData.finalJson) {
            await fetch('/api/voters', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...voter,
                halkaName: doc.halkaName,
                blockCode: doc.blockCode
              }),
            });
          }
        }

        // Update progress
        setProcessingProgress(prev => ({
          ...prev,
          current: i + 1
        }));
      }

      // Close the popup after processing
      setShowVoterStats(false);
    } catch (error) {
      console.error('Failed to initiate process:', error);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({
        current: 0,
        total: 0,
        isProcessing: false
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Constituencies</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all constituencies with their voter statistics and block codes.
          </p>
        </div>
      </div>

      {/* Constituency Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full text-center py-4">Loading...</div>
        ) : constituencies.length === 0 ? (
          <div className="col-span-full text-center py-4">No constituencies found</div>
        ) : (
          constituencies.map((constituency) => (
            <div
              key={constituency._id}
              className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200"
            >
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium text-gray-900">{constituency.halkaName}</h3>
                <p className="mt-1 text-sm text-gray-500">Last updated: {new Date(constituency.lastUpdated).toLocaleDateString()}</p>
              </div>
              <div className="px-4 py-5 sm:p-6">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Muslim Male</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.muslimMale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Muslim Female</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.muslimFemale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Qadiani Male</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.qadianiMale.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Qadiani Female</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.qadianiFemale.toLocaleString()}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Total Voters</dt>
                    <dd className="mt-1 text-sm text-gray-900">{constituency.totalVoters.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => setSelectedConstituency(selectedConstituency?._id === constituency._id ? null : constituency)}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {selectedConstituency?._id === constituency._id ? 'Hide Block Codes' : 'View Block Codes'}
                  </button>
                  {canSeeProcessButtons(session?.user?.email) && (
                    <>
                      <button
                        onClick={() => estimateConstituency(constituency)}
                        disabled={estimationProgress[constituency._id]?.isEstimating}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {estimationProgress[constituency._id]?.isEstimating ? 'Estimating...' : 'Estimate Constituency'}
                      </button>
                      {constituency.estimates && constituency.estimates.length > 0 && (
                        <button
                          onClick={() => setShowEstimates(prev => ({ ...prev, [constituency._id]: !prev[constituency._id] }))}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          {showEstimates[constituency._id] ? 'Hide Estimates' : 'View Estimates'}
                        </button>
                      )}
                    </>
                  )}
                  {estimationProgress[constituency._id]?.isEstimating && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${(estimationProgress[constituency._id].current / estimationProgress[constituency._id].total) * 100}%`
                        }}
                      ></div>
                    </div>
                  )}
                  {showEstimates[constituency._id] && constituency.estimates && (
                    <div className="mt-4 space-y-4">
                      <h4 className="text-sm font-medium text-gray-900">Estimate History</h4>
                      <div className="space-y-2">
                        {constituency.estimates.map((estimate, index) => (
                          <div key={estimate._id} className="bg-gray-50 p-3 rounded-md">
                            <div className="flex justify-between items-start">
                              <p className="text-xs text-gray-500">
                                {new Date(estimate.estimatedAt).toLocaleString()}
                              </p>
                              <button
                                onClick={() => updateFromEstimate(constituency._id, estimate._id)}
                                disabled={isUpdatingCount[estimate._id]}
                                className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isUpdatingCount[estimate._id] ? 'Updating...' : 'Update Count'}
                              </button>
                            </div>
                            <dl className="mt-1 grid grid-cols-2 gap-2">
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Muslim Male</dt>
                                <dd className="text-xs text-gray-900">{estimate.muslimMale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Muslim Female</dt>
                                <dd className="text-xs text-gray-900">{estimate.muslimFemale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Qadiani Male</dt>
                                <dd className="text-xs text-gray-900">{estimate.qadianiMale.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Qadiani Female</dt>
                                <dd className="text-xs text-gray-900">{estimate.qadianiFemale.toLocaleString()}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-xs font-medium text-gray-500">Total Voters</dt>
                                <dd className="text-xs text-gray-900">{estimate.totalVoters.toLocaleString()}</dd>
                              </div>
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Block Codes Table */}
      {selectedConstituency && (
        <div className="mt-8">
          <div className="sm:flex sm:items-center mb-4">
            <div className="sm:flex-auto">
              <h2 className="text-xl font-semibold text-gray-900">
                Block Codes for {selectedConstituency.halkaName} ({selectedConstituency.blockCodes.length} total)
              </h2>
            </div>
          </div>
          <div className="mt-4 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                          Block Code
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Total Files
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Estimated Voters
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Religion Range
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Gender Range
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {selectedConstituency.blockCodes.map((code, index) => (
                        <tr key={index}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            {code}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code]?.totalFiles || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code]?.estimatedVoters.toLocaleString() || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code] ? 
                              `${blockCodeStats[code].estimatedReligion.min.toLocaleString()} - ${blockCodeStats[code].estimatedReligion.max.toLocaleString()}` 
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {blockCodeStats[code] ? 
                              `${blockCodeStats[code].estimatedGender.min.toLocaleString()} - ${blockCodeStats[code].estimatedGender.max.toLocaleString()}` 
                              : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            <div className="flex space-x-2">
                              {canSeeProcessButtons(session?.user?.email) && (
                                <>
                                  <button
                                    onClick={() => estimateBlockCodeStats(code)}
                                    disabled={isEstimating[code]}
                                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isEstimating[code] ? 'Estimating...' : 'Estimate'}
                                  </button>
                                  <button
                                    onClick={() => processVoterStats(code)}
                                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                  >
                                    Process Voter
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voter Stats Popup */}
      {showVoterStats && voterStats && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Voter Statistics for Block Code: {selectedBlockCode}
              </h3>
              <button
                onClick={() => setShowVoterStats(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <dl className="grid grid-cols-1 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Files</dt>
                <dd className="mt-1 text-sm text-gray-900">{voterStats.totalFiles.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Muslim Voters</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalMuslimVoters.min.toLocaleString()} to {voterStats.totalMuslimVoters.max.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Male</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalMale.min.toLocaleString()} to {voterStats.totalMale.max.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Female</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voterStats.totalFemale.min.toLocaleString()} to {voterStats.totalFemale.max.toLocaleString()}
                </dd>
              </div>
            </dl>
            <div className="mt-6 space-y-3">
              {processingProgress.isProcessing && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${(processingProgress.current / processingProgress.total) * 100}%`
                    }}
                  ></div>
                  <p className="text-sm text-gray-600 mt-1 text-center">
                    Processing {processingProgress.current} of {processingProgress.total} documents
                  </p>
                </div>
              )}
              <button
                onClick={initiateProcess}
                disabled={isProcessing}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : 'Initiate Process'}
              </button>
              <button
                onClick={() => setShowVoterStats(false)}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 