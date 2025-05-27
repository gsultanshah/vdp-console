'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
}

export default function ConstituencyPage() {
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [selectedConstituency, setSelectedConstituency] = useState<Constituency | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
                <div className="mt-4">
                  <button
                    onClick={() => setSelectedConstituency(selectedConstituency?._id === constituency._id ? null : constituency)}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {selectedConstituency?._id === constituency._id ? 'Hide Block Codes' : 'View Block Codes'}
                  </button>
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
                Block Codes for {selectedConstituency.halkaName}
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
                          Constituency
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Total Voters
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Muslim Voters
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                          Qadiani Voters
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
                            {selectedConstituency.halkaName}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {selectedConstituency.totalVoters.toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {(selectedConstituency.muslimMale + selectedConstituency.muslimFemale).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {(selectedConstituency.qadianiMale + selectedConstituency.qadianiFemale).toLocaleString()}
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
    </div>
  );
} 