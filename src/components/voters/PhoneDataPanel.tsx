'use client';

export interface PhoneDataResult {
  cnic: string;
  cnicDisplay?: string;
  phone: string;
  phoneDisplay?: string;
  firstname?: string;
  gender?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  sourceFile?: string;
  data?: Record<string, unknown>;
}

interface PhoneDataPanelProps {
  results: PhoneDataResult[];
  isLoading?: boolean;
  error?: string | null;
  notConfigured?: boolean;
  title?: string;
  emptyMessage?: string;
}

function extraDataFields(data: Record<string, unknown> | undefined) {
  if (!data) {
    return [];
  }

  const skip = new Set([
    'phone1',
    'firstname',
    'idcard',
    'address1',
    'address2',
    'address3',
    'gender',
    'sourceFile',
  ]);

  return Object.entries(data)
    .filter(([key, value]) => !skip.has(key) && value != null && String(value).trim() !== '')
    .map(([key, value]) => ({ key, value: String(value) }));
}

export default function PhoneDataPanel({
  results,
  isLoading = false,
  error = null,
  notConfigured = false,
  title = 'Phone data',
  emptyMessage = 'No phone records found for this search.',
}: PhoneDataPanelProps) {
  if (isLoading) {
    return (
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <div className="bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center justify-center bg-white px-6 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <div className="bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
        <div className="bg-amber-50 px-6 py-4 text-sm text-amber-900">
          Phone data search is not available. Contact your administrator.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <div className="bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
        <div className="bg-red-50 px-6 py-4 text-sm text-red-800">{error}</div>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <div className="bg-gray-50 px-6 py-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
        <div className="bg-white px-6 py-4 text-sm text-gray-500">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
      <div className="bg-gray-50 px-6 py-4">
        <h3 className="text-lg font-medium text-gray-900">
          {title} <span className="text-sm font-normal text-gray-500">({results.length})</span>
        </h3>
      </div>
      <div className="divide-y divide-gray-200 bg-white">
        {results.map((record) => {
          const extras = extraDataFields(record.data);
          const address = [record.address1, record.address2, record.address3].filter(Boolean).join(', ');

          return (
            <div key={`${record.cnic}-${record.phone}`} className="px-6 py-4">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">CNIC</dt>
                  <dd className="mt-1 font-mono text-sm text-gray-900">
                    {record.cnicDisplay || record.cnic}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-gray-500">Phone</dt>
                  <dd className="mt-1 font-mono text-sm text-gray-900">
                    {record.phoneDisplay || record.phone}
                  </dd>
                </div>
                {record.firstname && (
                  <div>
                    <dt className="text-xs font-medium uppercase text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{record.firstname}</dd>
                  </div>
                )}
                {record.gender && (
                  <div>
                    <dt className="text-xs font-medium uppercase text-gray-500">Gender</dt>
                    <dd className="mt-1 text-sm text-gray-900">{record.gender}</dd>
                  </div>
                )}
                {address && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs font-medium uppercase text-gray-500">Address</dt>
                    <dd className="mt-1 text-sm text-gray-900">{address}</dd>
                  </div>
                )}
                {record.sourceFile && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs font-medium uppercase text-gray-500">Source</dt>
                    <dd className="mt-1 font-mono text-xs text-gray-600">{record.sourceFile}</dd>
                  </div>
                )}
                {extras.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs font-medium uppercase text-gray-500">{field.key}</dt>
                    <dd className="mt-1 text-sm text-gray-900">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
