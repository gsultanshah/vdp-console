'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { buildCloudinaryRowCropUrl, publicIdFromCloudinaryUrl } from '@/lib/cloudinary-url';

interface Voter {
  _id: string;
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row: number;
  rowY: number;
  rowHeight: number;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface PollingInfo {
  _id: string;
  sn: string;
  polling_station_name: string;
  area: string;
  blockcode: number;
  male: number;
  female: number;
  total: number;
  male_booth: string;
  female_booth: string;
  total_booth: string;
  halkaName: string;
  type: string;
}

export default function SearchVoters() {
  const [searchQuery, setSearchQuery] = useState('');
  const [voters, setVoters] = useState<Voter[]>([]);
  const [pollingInfo, setPollingInfo] = useState<PollingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFamily, setShowFamily] = useState(false);
  const [isLoadingPolling, setIsLoadingPolling] = useState(false);
  const [cloudinaryUrls, setCloudinaryUrls] = useState<Record<string, string>>({});

  const formatCNIC = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Format as 34104-2955553-6
    if (digits.length <= 5) {
      return digits;
    } else if (digits.length <= 12) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    } else {
      return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-PK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow up to 13 digits (5-7-1 format)
    if (value.replace(/\D/g, '').length <= 13) {
      setSearchQuery(formatCNIC(value));
    }
  };

  const uploadToCloudinary = async (imageUrl: string) => {
    try {
      const response = await fetch('/api/cloudinary/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload to Cloudinary');
      }

      const data = await response.json();
      return data.data.secure_url;
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      return imageUrl; // Fallback to original URL if upload fails
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowFamily(false);
    setPollingInfo(null);
    setCloudinaryUrls({});
    
    try {
      const response = await fetch(`/api/voters/search?cnic=${searchQuery}`);
      const data = await response.json();
      // Only take the first result if available
      const voter = data.length > 0 ? data[0] : null;
      
      if (voter) {
        // Upload image to Cloudinary
        const cloudinaryUrl = await uploadToCloudinary(voter.imageUrl);
        setCloudinaryUrls({ [voter._id]: cloudinaryUrl });
        setVoters([voter]);

        // If voter is found, fetch polling information
        setIsLoadingPolling(true);
        try {
          const pollingResponse = await fetch(
            `/api/polling-scheme?halkaName=${voter.halkaName}&blockcode=${voter.blockCode}&type=male`
          );
          if (pollingResponse.ok) {
            const pollingData = await pollingResponse.json();
            setPollingInfo(pollingData);
          }
        } catch (error) {
          console.error('Error fetching polling information:', error);
        } finally {
          setIsLoadingPolling(false);
        }
      } else {
        setVoters([]);
      }
    } catch (error) {
      console.error('Error searching voters:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowFamily = async () => {
    if (voters.length === 0) return;
    
    setIsLoading(true);
    try {
      const voter = voters[0];
      const response = await fetch(`/api/voters/family?blockCode=${voter.blockCode}&gharanaNo=${voter.gharanaNo}`);
      const data = await response.json();
      
      // Upload all family member images to Cloudinary
      const newCloudinaryUrls = { ...cloudinaryUrls };
      for (const familyMember of data) {
        if (!cloudinaryUrls[familyMember._id]) {
          const cloudinaryUrl = await uploadToCloudinary(familyMember.imageUrl);
          newCloudinaryUrls[familyMember._id] = cloudinaryUrl;
        }
      }
      setCloudinaryUrls(newCloudinaryUrls);
      setVoters(data);
      setShowFamily(true);
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCloudinaryUrl = (imageUrl: string, rowY: number, rowHeight: number) => {
    const publicId = publicIdFromCloudinaryUrl(imageUrl);
    if (!publicId) {
      return imageUrl;
    }
    return buildCloudinaryRowCropUrl(publicId, rowY, rowHeight + 30);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Search Voters
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Enter CNIC number to search voter details
          </p>
        </div>

        <div className="mt-12">
          <form onSubmit={handleSearch} className="mx-auto max-w-3xl">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleInputChange}
                  placeholder="Enter CNIC (e.g., 34104-2955553-6)"
                  className="block w-full rounded-lg border-0 py-4 pl-4 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg bg-indigo-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        </div>

        {/* Results section */}
        <div className="mt-8">
          {voters.length > 0 ? (
            <div className="space-y-6">
              {/* Voter Information */}
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    {showFamily ? 'Family Members' : 'Voter Details'}
                  </h3>
                  {!showFamily && (
                    <button
                      onClick={handleShowFamily}
                      disabled={isLoading}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Loading...' : 'Show Family'}
                    </button>
                  )}
                </div>
                {/* Desktop view - Table */}
                <div className="hidden sm:block">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">CNIC</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Halka</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Block Code</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Silsila No</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Gharana No</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {voters.map((voter) => (
                        <>
                          <tr key={voter._id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{voter.cnic}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{voter.halkaName}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{voter.blockCode}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{voter.silsilaNo}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{voter.gharanaNo}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              <div className="flex flex-col gap-2">
                                <a
                                  href={cloudinaryUrls[voter._id] || voter.imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                >
                                  View Original
                                </a>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="px-6 pb-4 pt-0 text-2xl text-right font-bold text-gray-900 bg-gray-50">
                              {voter.name}
                            </td>
                          </tr>
                          {voter.rowY !== undefined && voter.rowHeight !== undefined && (
                            <tr>
                              <td colSpan={6} className="px-6 py-4 bg-white">
                                <div className="overflow-hidden rounded-lg">
                                  <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-sm font-medium text-gray-900">Voter Image</h4>
                                    <a
                                      href={getCloudinaryUrl(cloudinaryUrls[voter._id] || voter.imageUrl, voter.rowY, voter.rowHeight)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                    >
                                      View
                                    </a>
                                  </div>
                                  <img
                                    src={getCloudinaryUrl(cloudinaryUrls[voter._id] || voter.imageUrl, voter.rowY, voter.rowHeight)}
                                    alt={`${voter.name}'s voter image`}
                                    className="w-full h-auto"
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view - Cards */}
                <div className="sm:hidden">
                  {voters.map((voter) => (
                    <div key={voter._id} className="bg-white p-4 border-b border-gray-200">
                      <div className="text-2xl font-bold text-gray-900 mb-4">{voter.name}</div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">CNIC</span>
                          <span className="text-sm text-gray-900">{voter.cnic}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">Halka</span>
                          <span className="text-sm text-gray-900">{voter.halkaName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">Block Code</span>
                          <span className="text-sm text-gray-900">{voter.blockCode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">Silsila No</span>
                          <span className="text-sm text-gray-900">{voter.silsilaNo}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-gray-500">Gharana No</span>
                          <span className="text-sm text-gray-900">{voter.gharanaNo}</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          <a
                            href={cloudinaryUrls[voter._id] || voter.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-full justify-center items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                          >
                            View Original
                          </a>
                        </div>
                        {voter.rowY !== undefined && voter.rowHeight !== undefined && (
                          <div className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="text-sm font-medium text-gray-900">Voter Image</h4>
                              <a
                                href={getCloudinaryUrl(cloudinaryUrls[voter._id] || voter.imageUrl, voter.rowY, voter.rowHeight)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                              >
                                View
                              </a>
                            </div>
                            <div className="overflow-hidden rounded-lg">
                              <img
                                src={getCloudinaryUrl(cloudinaryUrls[voter._id] || voter.imageUrl, voter.rowY, voter.rowHeight)}
                                alt={`${voter.name}'s voter image`}
                                className="w-full h-auto"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Polling Information */}
              {isLoadingPolling ? (
                <div className="text-center py-4">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-indigo-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading polling information...</p>
                </div>
              ) : pollingInfo ? (
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                  <div className="bg-gray-50 px-6 py-4">
                    <h3 className="text-lg font-medium text-gray-900">Polling Information</h3>
                  </div>
                  <div className="bg-white px-6 py-4">
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Polling Station</dt>
                        <dd className="mt-1 text-sm text-gray-900">{pollingInfo.polling_station_name}</dd>
                      </div>
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Area</dt>
                        <dd className="mt-1 text-sm text-gray-900">{pollingInfo.area}</dd>
                      </div>
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Serial Number</dt>
                        <dd className="mt-1 text-sm text-gray-900">{pollingInfo.sn}</dd>
                      </div>
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Type</dt>
                        <dd className="mt-1 text-sm text-gray-900 capitalize">{pollingInfo.type}</dd>
                      </div>
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">Booth Number</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {pollingInfo.type === 'male' 
                            ? pollingInfo.male_booth || 'N/A'
                            : pollingInfo.female_booth || 'N/A'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-4">
              {isLoading ? 'Searching...' : 'No voters found. Try searching with a CNIC number.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 