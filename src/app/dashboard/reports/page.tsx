'use client';

import { useState } from 'react';

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  const reports = [
    { id: 'daily', name: 'Daily Processing Report', description: 'Summary of daily data processing activities' },
    { id: 'weekly', name: 'Weekly Analytics', description: 'Weekly trends and performance metrics' },
    { id: 'monthly', name: 'Monthly Overview', description: 'Comprehensive monthly processing statistics' },
  ];

  return (
    <>
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Reports
          </h2>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            type="button"
            className="ml-3 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Generate Report
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="overflow-hidden bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Available Reports</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Select a report type to view detailed analytics and statistics.</p>
            </div>
            <div className="mt-5">
              <div className="space-y-4">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className={`rounded-md px-6 py-5 cursor-pointer transition-colors ${
                      selectedReport === report.id
                        ? 'bg-indigo-50 border-2 border-indigo-500'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedReport(report.id)}
                  >
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{report.name}</div>
                      <div className="mt-1 text-gray-500">{report.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedReport && (
        <div className="mt-8">
          <div className="overflow-hidden bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Report Preview</h3>
              <div className="mt-5">
                <div className="rounded-md bg-gray-50 px-6 py-5">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">Report data will be displayed here</div>
                    <div className="mt-1 text-gray-500">
                      Select a report type and click "Generate Report" to view detailed analytics.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 