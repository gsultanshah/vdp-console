'use client';

import { useState } from 'react';
import type { PhoneDataResult } from '@/components/voters/PhoneDataPanel';

export interface PhoneDataFormValues {
  cnic: string;
  phone: string;
  firstname: string;
  gender: string;
  address1: string;
  address2: string;
  address3: string;
}

const emptyForm: PhoneDataFormValues = {
  cnic: '',
  phone: '',
  firstname: '',
  gender: '',
  address1: '',
  address2: '',
  address3: '',
};

function formatCNIC(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) {
    return digits;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

interface PhoneDataFormProps {
  notConfigured?: boolean;
  onSaved?: (record: PhoneDataResult) => void;
}

export default function PhoneDataForm({ notConfigured = false, onSaved }: PhoneDataFormProps) {
  const [form, setForm] = useState<PhoneDataFormValues>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = (field: keyof PhoneDataFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.cnic.trim() || !form.phone.trim()) {
      setError('CNIC and phone are required');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/phone-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnic: form.cnic,
          phone: form.phone,
          firstname: form.firstname || undefined,
          gender: form.gender || undefined,
          address1: form.address1 || undefined,
          address2: form.address2 || undefined,
          address3: form.address3 || undefined,
        }),
      });

      const data = await response.json();

      if (response.status === 503) {
        setError('Phone data is not configured. Set AWS credentials in .env.');
        return;
      }

      if (!response.ok) {
        setError(data.details || data.error || 'Failed to save phone record');
        return;
      }

      const record = data.record as PhoneDataResult;
      setSuccess('Phone record saved successfully.');
      setForm({
        ...emptyForm,
        cnic: form.cnic,
      });
      onSaved?.(record);
    } catch {
      setError('Failed to save phone record');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
      <div className="bg-gray-50 px-6 py-4">
        <h3 className="text-lg font-medium text-gray-900">Add phone record</h3>
        <p className="mt-1 text-sm text-gray-500">
          Save a CNIC and phone link. Same CNIC + phone overwrites the previous row.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white px-6 py-5">
        {notConfigured && (
          <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Phone data is not configured. Set AWS credentials in <code className="rounded bg-amber-100 px-1">.env</code>.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="add-cnic" className="mb-1 block text-sm font-medium text-gray-700">
              CNIC <span className="text-red-600">*</span>
            </label>
            <input
              id="add-cnic"
              type="text"
              required
              value={form.cnic}
              disabled={notConfigured || isSaving}
              onChange={(e) => {
                const value = e.target.value;
                if (value.replace(/\D/g, '').length <= 13) {
                  updateField('cnic', formatCNIC(value));
                }
              }}
              placeholder="35101-2509021-5"
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="add-phone" className="mb-1 block text-sm font-medium text-gray-700">
              Phone <span className="text-red-600">*</span>
            </label>
            <input
              id="add-phone"
              type="text"
              required
              value={form.phone}
              disabled={notConfigured || isSaving}
              onChange={(e) => {
                const value = e.target.value;
                if (value.replace(/\D/g, '').length <= 11) {
                  updateField('phone', formatPhoneInput(value));
                }
              }}
              placeholder="0301-7989554"
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="add-name" className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="add-name"
              type="text"
              value={form.firstname}
              disabled={notConfigured || isSaving}
              onChange={(e) => updateField('firstname', e.target.value)}
              placeholder="AHMED RAZA"
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="add-gender" className="mb-1 block text-sm font-medium text-gray-700">
              Gender
            </label>
            <select
              id="add-gender"
              value={form.gender}
              disabled={notConfigured || isSaving}
              onChange={(e) => updateField('gender', e.target.value)}
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label htmlFor="add-address1" className="mb-1 block text-sm font-medium text-gray-700">
              Address line 1
            </label>
            <input
              id="add-address1"
              type="text"
              value={form.address1}
              disabled={notConfigured || isSaving}
              onChange={(e) => updateField('address1', e.target.value)}
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="add-address2" className="mb-1 block text-sm font-medium text-gray-700">
              Address line 2
            </label>
            <input
              id="add-address2"
              type="text"
              value={form.address2}
              disabled={notConfigured || isSaving}
              onChange={(e) => updateField('address2', e.target.value)}
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="add-address3" className="mb-1 block text-sm font-medium text-gray-700">
              City / district
            </label>
            <input
              id="add-address3"
              type="text"
              value={form.address3}
              disabled={notConfigured || isSaving}
              onChange={(e) => updateField('address3', e.target.value)}
              placeholder="Kasur"
              className="block w-full rounded-lg border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm"
            />
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && (
          <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
        )}

        <button
          type="submit"
          disabled={notConfigured || isSaving || !form.cnic.trim() || !form.phone.trim()}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save phone record'}
        </button>
      </form>
    </div>
  );
}
