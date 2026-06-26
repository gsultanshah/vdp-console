'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import InputMask from 'react-input-mask';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProcessVoterTab from '@/components/processing/ProcessVoterTab';
import MarkTitlePagesTab from '@/components/processing/MarkTitlePagesTab';

interface Constituency {
  _id: string;
  halkaName?: string;
  name?: string;
  label?: string;
  description?: string;
  status: 'active' | 'inactive';
  blockCodes: string[];
}

interface Voter {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
  imageUrl?: string;
}

interface DeletePollingSchemeModal {
  isOpen: boolean;
  deleteType: 'sn' | 'blockcode' | 'halkaName' | null;
  value: string;
}

interface DataReport {
  total: number;
  fields: {
    [key: string]: number;
  };
}

export default function DataProcessing() {
  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newConstituency, setNewConstituency] = useState({
    name: '',
    label: '',
    description: '',
    status: 'active' as const,
    blockCodes: ''
  });
  const [editingConstituency, setEditingConstituency] = useState<Constituency | null>(null);
  const [newVoter, setNewVoter] = useState<Voter>({
    cnic: '',
    halkaName: '',
    blockCode: '',
    silsilaNo: '',
    gharanaNo: '',
    name: ''
  });
  const [language, setLanguage] = useState<'urdu' | 'english'>('english');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingSchemeFile, setPollingSchemeFile] = useState<File | null>(null);
  const [pollingSchemeHalka, setPollingSchemeHalka] = useState('');
  const [pollingSchemeUploading, setPollingSchemeUploading] = useState(false);
  const [pollingSchemeUploadResult, setPollingSchemeUploadResult] = useState<string | null>(null);
  const [deletePollingSchemeModal, setDeletePollingSchemeModal] = useState<DeletePollingSchemeModal>({
    isOpen: false,
    deleteType: null,
    value: ''
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [dataReport, setDataReport] = useState<DataReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchConstituencies();
    fetchDataReport();
  }, []);

  const fetchConstituencies = async () => {
    try {
      const response = await fetch('/api/constituency?activeOnly=true');
      const data = await response.json();
      setConstituencies(data);
    } catch (error) {
      toast.error('Failed to fetch constituencies');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDataReport = async () => {
    setIsLoadingReport(true);
    try {
      const response = await fetch('/api/voters/stats');
      const data = await response.json();
      setDataReport(data);
    } catch (error) {
      toast.error('Failed to fetch data report');
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleCreateConstituency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const blockCodesArray = newConstituency.blockCodes
        .split('\n')
        .map(code => code.trim())
        .filter(code => code);

      const response = await fetch('/api/constituency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newConstituency,
          halkaName: newConstituency.name,
          blockCodes: blockCodesArray
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create constituency');
      }
      
      toast.success('Constituency created successfully');
      setNewConstituency({
        name: '',
        label: '',
        description: '',
        status: 'active',
        blockCodes: ''
      });
      fetchConstituencies();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create constituency');
    }
  };

  const handleUpdateConstituency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConstituency) return;

    try {
      const blockCodesArray = editingConstituency.blockCodes
        .join('\n')
        .split('\n')
        .map((code: string) => code.trim())
        .filter((code: string) => code);

      const response = await fetch('/api/constituency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingConstituency._id,
          ...editingConstituency,
          blockCodes: blockCodesArray
        })
      });

      if (!response.ok) throw new Error('Failed to update constituency');
      
      toast.success('Constituency updated successfully');
      setEditingConstituency(null);
      fetchConstituencies();
    } catch (error) {
      toast.error('Failed to update constituency');
    }
  };

  const handleDeleteConstituency = async (id: string) => {
    if (!confirm('Are you sure you want to delete this constituency?')) return;

    try {
      const response = await fetch(`/api/constituency?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete constituency');
      
      toast.success('Constituency deleted successfully');
      fetchConstituencies();
    } catch (error) {
      toast.error('Failed to delete constituency');
    }
  };

  const validateVoterData = (data: Voter): string | null => {
    if (!data.cnic) return language === 'urdu' ? 'شناختی کارڈ نمبر درکار ہے' : 'CNIC is required';
    if (!data.halkaName) return language === 'urdu' ? 'حلقہ کا نام درکار ہے' : 'Halka Name is required';
    if (!data.blockCode) return language === 'urdu' ? 'بلاک کوڈ درکار ہے' : 'Block Code is required';
    if (!data.silsilaNo) return language === 'urdu' ? 'سلسلہ نمبر درکار ہے' : 'Silsila Number is required';
    if (!data.gharanaNo) return language === 'urdu' ? 'گھرانہ نمبر درکار ہے' : 'Gharana Number is required';
    if (!data.name) return language === 'urdu' ? 'نام درکار ہے' : 'Name is required';

    // Validate CNIC format (13 digits after removing dashes)
    const cnicWithoutDashes = data.cnic.replace(/-/g, '');
    if (cnicWithoutDashes.length !== 13) {
      return language === 'urdu' ? 'شناختی کارڈ نمبر درست نہیں ہے' : 'Invalid CNIC format';
    }

    return null;
  };

  const handleCreateVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate data
    const validationError = validateVoterData(newVoter);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/voters/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVoter)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create voter');
      }

      if (data.message === 'Voter already exists') {
        toast.error(language === 'urdu' ? 'یہ رائے دہندہ پہلے سے موجود ہے' : 'This voter already exists');
        return;
      }
      
      toast.success(language === 'urdu' ? 'رائے دہندہ کامیابی سے شامل کر دیا گیا' : 'Voter created successfully');
      setNewVoter({
        cnic: '',
        halkaName: '',
        blockCode: '',
        silsilaNo: '',
        gharanaNo: '',
        name: ''
      });
    } catch (error) {
      toast.error(language === 'urdu' ? 'رائے دہندہ شامل کرنے میں خرابی' : 'Failed to create voter');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePollingSchemeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xls', 'xlsx', 'csv'].includes(ext || '')) {
      toast.error('Invalid file format. Please upload an xls, xlsx, or csv file.');
      setPollingSchemeFile(null);
      return;
    }
    setPollingSchemeFile(file);
  };

  const handlePollingSchemeUpload = async () => {
    console.log('Upload started', { file: pollingSchemeFile, halka: pollingSchemeHalka });
    setPollingSchemeUploadResult(null);
    if (!pollingSchemeFile) {
      console.log('No file selected');
      toast.error('Please select a file to upload.');
      return;
    }
    if (!pollingSchemeHalka) {
      console.log('No halka name');
      toast.error('Please enter Halka Name.');
      return;
    }
    const halkaName = pollingSchemeHalka.replace(/\s+/g, '').toUpperCase();
    setPollingSchemeUploading(true);
    try {
      console.log('Creating form data');
      const formData = new FormData();
      formData.append('file', pollingSchemeFile);
      formData.append('halkaName', halkaName);
      console.log('Sending request');
      const res = await fetch('/api/polling-scheme/upload', {
        method: 'POST',
        body: formData,
      });
      console.log('Response received', res.status);
      const data = await res.json();
      console.log('Response data', data);
      if (!res.ok) {
        setPollingSchemeUploadResult(data.error || 'Upload failed.');
        toast.error(data.error || 'Upload failed.');
      } else {
        setPollingSchemeUploadResult(data.message || 'Upload successful!');
        toast.success(data.message || 'Upload successful!');
      }
    } catch (err: any) {
      console.error('Upload error', err);
      setPollingSchemeUploadResult(err.message || 'Upload failed.');
      toast.error(err.message || 'Upload failed.');
    } finally {
      setPollingSchemeUploading(false);
    }
  };

  const handleDeletePollingScheme = async () => {
    if (!deletePollingSchemeModal.deleteType || !deletePollingSchemeModal.value) {
      toast.error('Please select a type and enter a value');
      return;
    }

    if (!confirm('Are you sure you want to delete these records? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/polling-scheme/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: deletePollingSchemeModal.deleteType,
          value: deletePollingSchemeModal.value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete records');
      }

      toast.success(`Successfully deleted ${data.deletedCount} records`);
      setDeletePollingSchemeModal({
        isOpen: false,
        deleteType: null,
        value: ''
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete records');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetProcessing = async () => {
    if (!confirm('Are you sure you want to reset all processing records? This will make them available for processing again.')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/blockcodes/reset-processing', {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset processing status');
      }

      toast.success(`Successfully reset ${data.modifiedCount} records`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset processing status');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Data Processing
          </h2>
        </div>
      </div>

      <Tabs defaultValue="management" className="w-full">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="process-voters">Process Voters</TabsTrigger>
          <TabsTrigger value="mark-title-pages">Mark Title Pages</TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-8 mt-6">
      {/* Create New Constituency Form */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Create New Constituency</h3>
          <form onSubmit={handleCreateConstituency} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  id="name"
                  value={newConstituency.name}
                  onChange={(e) => setNewConstituency({ ...newConstituency, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="label" className="block text-sm font-medium text-gray-700">Label</label>
                <input
                  type="text"
                  id="label"
                  value={newConstituency.label}
                  onChange={(e) => setNewConstituency({ ...newConstituency, label: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description (Optional)</label>
              <textarea
                id="description"
                value={newConstituency.description}
                onChange={(e) => setNewConstituency({ ...newConstituency, description: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                rows={3}
              />
            </div>
            <div>
              <label htmlFor="blockCodes" className="block text-sm font-medium text-gray-700">Block Codes (One per line)</label>
              <textarea
                id="blockCodes"
                value={newConstituency.blockCodes}
                onChange={(e) => setNewConstituency({ ...newConstituency, blockCodes: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                rows={5}
                placeholder="Enter block codes, one per line"
              />
            </div>
            <div>
              <button
                type="submit"
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Create Constituency
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Constituencies List */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">Constituencies</h3>
          {isLoading ? (
            <div className="mt-4 text-center">Loading...</div>
          ) : (
            <div className="mt-4 space-y-4">
              {constituencies.map((constituency) => (
                <div key={constituency._id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-lg font-medium">{constituency.halkaName ?? constituency.name}</h4>
                      <p className="text-sm text-gray-500">{constituency.label}</p>
                      {constituency.description && (
                        <p className="mt-1 text-sm text-gray-600">{constituency.description}</p>
                      )}
                      <p className="mt-2 text-sm text-gray-500">
                        Block Codes: {constituency.blockCodes.length}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingConstituency(constituency)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteConstituency(constituency._id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Constituency Modal */}
      {editingConstituency && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-lg font-medium mb-4">Edit Constituency</h3>
            <form onSubmit={handleUpdateConstituency} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    id="edit-name"
                    value={editingConstituency.name}
                    onChange={(e) => setEditingConstituency({ ...editingConstituency, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-label" className="block text-sm font-medium text-gray-700">Label</label>
                  <input
                    type="text"
                    id="edit-label"
                    value={editingConstituency.label}
                    onChange={(e) => setEditingConstituency({ ...editingConstituency, label: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  id="edit-description"
                  value={editingConstituency.description || ''}
                  onChange={(e) => setEditingConstituency({ ...editingConstituency, description: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="edit-blockCodes" className="block text-sm font-medium text-gray-700">Block Codes (One per line)</label>
                <textarea
                  id="edit-blockCodes"
                  value={editingConstituency.blockCodes.join('\n')}
                  onChange={(e) => setEditingConstituency({ ...editingConstituency, blockCodes: e.target.value.split('\n') })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  rows={5}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingConstituency(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Voter Form */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            {language === 'urdu' ? 'نیا رائے دہندہ شامل کریں' : 'Add New Voter'}
          </h3>
          <form onSubmit={handleCreateVoter} className="mt-5 space-y-4">
            <div className="flex space-x-4 mb-4">
              <button
                type="button"
                onClick={() => setLanguage('english')}
                className={`px-4 py-2 rounded-md ${
                  language === 'english'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('urdu')}
                className={`px-4 py-2 rounded-md ${
                  language === 'urdu'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                اردو
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cnic" className="block text-sm font-medium text-gray-700">
                  {language === 'urdu' ? 'شناختی کارڈ نمبر' : 'CNIC'}
                </label>
                <InputMask
                  mask="99999-9999999-9"
                  maskChar={null}
                  value={newVoter.cnic}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVoter({ ...newVoter, cnic: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                  placeholder={language === 'urdu' ? 'شناختی کارڈ نمبر' : 'CNIC Number'}
                />
              </div>
              <div>
                <label htmlFor="halkaName" className="block text-sm font-medium text-gray-700">
                  {language === 'urdu' ? 'حلقہ کا نام' : 'Halka Name'}
                </label>
                <input
                  type="text"
                  id="halkaName"
                  value={newVoter.halkaName}
                  onChange={(e) => setNewVoter({ ...newVoter, halkaName: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                  placeholder={language === 'urdu' ? 'حلقہ کا نام' : 'Halka Name'}
                  dir={language === 'urdu' ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="blockCode" className="block text-sm font-medium text-gray-700">
                  {language === 'urdu' ? 'بلاک کوڈ' : 'Block Code'}
                </label>
                <input
                  type="text"
                  id="blockCode"
                  value={newVoter.blockCode}
                  onChange={(e) => setNewVoter({ ...newVoter, blockCode: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                  placeholder={language === 'urdu' ? 'بلاک کوڈ' : 'Block Code'}
                  dir={language === 'urdu' ? 'rtl' : 'ltr'}
                />
              </div>
              <div>
                <label htmlFor="silsilaNo" className="block text-sm font-medium text-gray-700">
                  {language === 'urdu' ? 'سلسلہ نمبر' : 'Silsila No'}
                </label>
                <input
                  type="text"
                  id="silsilaNo"
                  value={newVoter.silsilaNo}
                  onChange={(e) => setNewVoter({ ...newVoter, silsilaNo: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                  placeholder={language === 'urdu' ? 'سلسلہ نمبر' : 'Silsila Number'}
                  dir={language === 'urdu' ? 'rtl' : 'ltr'}
                />
              </div>
              <div>
                <label htmlFor="gharanaNo" className="block text-sm font-medium text-gray-700">
                  {language === 'urdu' ? 'گھرانہ نمبر' : 'Gharana No'}
                </label>
                <input
                  type="text"
                  id="gharanaNo"
                  value={newVoter.gharanaNo}
                  onChange={(e) => setNewVoter({ ...newVoter, gharanaNo: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                  required
                  placeholder={language === 'urdu' ? 'گھرانہ نمبر' : 'Gharana Number'}
                  dir={language === 'urdu' ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                {language === 'urdu' ? 'نام' : 'Name'}
              </label>
              <input
                type="text"
                id="name"
                value={newVoter.name}
                onChange={(e) => setNewVoter({ ...newVoter, name: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                required
                placeholder={language === 'urdu' ? 'نام' : 'Name'}
                dir={language === 'urdu' ? 'rtl' : 'ltr'}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {language === 'urdu' ? 'جاری ہے...' : 'Processing...'}
                  </span>
                ) : (
                  language === 'urdu' ? 'رائے دہندہ شامل کریں' : 'Add Voter'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Polling Scheme Import Section */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Import Polling Scheme</h3>
            <div className="flex space-x-2">
              <button
                onClick={handleResetProcessing}
                disabled={isResetting}
                className={`inline-flex justify-center rounded-md border border-transparent bg-yellow-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 ${
                  isResetting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isResetting ? 'Resetting...' : 'Reset In Queue'}
              </button>
              <button
                onClick={() => setDeletePollingSchemeModal({ isOpen: true, deleteType: null, value: '' })}
                className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete Records
              </button>
            </div>
          </div>
          <img src="/valid-polling-scheme.png" alt="Valid Polling Scheme Format Example" className="mb-4 border rounded shadow max-w-full h-auto" />
          <div className="mb-4">
            <label htmlFor="polling-halka" className="block text-sm font-medium text-gray-700">Halka Name (e.g. PP23)</label>
            <input
              type="text"
              id="polling-halka"
              value={pollingSchemeHalka}
              onChange={e => setPollingSchemeHalka(e.target.value.replace(/\s+/g, '').toUpperCase())}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
              placeholder="PP23"
            />
          </div>
          <div className="mb-4">
            <input type="file" accept=".xls,.xlsx,.csv" onChange={handlePollingSchemeFileChange} />
          </div>
          <button
            type="button"
            onClick={handlePollingSchemeUpload}
            disabled={pollingSchemeUploading}
            className={`inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${pollingSchemeUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {pollingSchemeUploading ? 'Uploading...' : 'Upload Polling Scheme'}
          </button>
          {pollingSchemeUploadResult && (
            <div className="mt-2 text-sm text-red-600">{pollingSchemeUploadResult}</div>
          )}
          <div className="mt-2 text-xs text-gray-500">
            File must be .xls, .xlsx, or .csv. Required columns: sn, polling_station_name, area, blockcode, male, female, total, male_booth, female_booth, total_booth. <br />
            <b>Note:</b> Rows with empty blockcode will be skipped. Total is calculated as sum of male and female (empty = 0). Booth fields are optional.
          </div>
        </div>
      </div>

      {/* Data Report Section */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Data Report</h3>
            <button
              onClick={fetchDataReport}
              disabled={isLoadingReport}
              className={`inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                isLoadingReport ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isLoadingReport ? 'Refreshing...' : 'Refresh Report'}
            </button>
          </div>
          
          {isLoadingReport ? (
            <div className="text-center py-4">Loading report...</div>
          ) : dataReport ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Field
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Count
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Total Records
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {dataReport.total.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      100%
                    </td>
                  </tr>
                  {Object.entries(dataReport.fields).map(([field, count]) => (
                    <tr key={field}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {field}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {count.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {((count / dataReport.total) * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">No data available</div>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="process-voters" className="mt-6">
          <ProcessVoterTab />
        </TabsContent>

        <TabsContent value="mark-title-pages" className="mt-6">
          <MarkTitlePagesTab />
        </TabsContent>
      </Tabs>

      {/* Delete Polling Scheme Modal */}
      {deletePollingSchemeModal.isOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Delete Polling Scheme Records</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Delete Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDeletePollingSchemeModal(prev => ({ ...prev, deleteType: 'sn' }))}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      deletePollingSchemeModal.deleteType === 'sn'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Serial Number
                  </button>
                  <button
                    onClick={() => setDeletePollingSchemeModal(prev => ({ ...prev, deleteType: 'blockcode' }))}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      deletePollingSchemeModal.deleteType === 'blockcode'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Block Code
                  </button>
                  <button
                    onClick={() => setDeletePollingSchemeModal(prev => ({ ...prev, deleteType: 'halkaName' }))}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      deletePollingSchemeModal.deleteType === 'halkaName'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Halka
                  </button>
                </div>
              </div>

              {deletePollingSchemeModal.deleteType && (
                <div>
                  <label htmlFor="delete-value" className="block text-sm font-medium text-gray-700">
                    Enter {deletePollingSchemeModal.deleteType === 'sn' ? 'Serial Number' : 
                           deletePollingSchemeModal.deleteType === 'blockcode' ? 'Block Code' : 'Halka Name'}
                  </label>
                  <input
                    type="text"
                    id="delete-value"
                    value={deletePollingSchemeModal.value}
                    onChange={(e) => setDeletePollingSchemeModal(prev => ({ ...prev, value: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                    placeholder={`Enter ${deletePollingSchemeModal.deleteType === 'sn' ? 'Serial Number' : 
                                deletePollingSchemeModal.deleteType === 'blockcode' ? 'Block Code' : 'Halka Name'}`}
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => setDeletePollingSchemeModal({ isOpen: false, deleteType: null, value: '' })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeletePollingScheme}
                  disabled={isDeleting || !deletePollingSchemeModal.deleteType || !deletePollingSchemeModal.value}
                  className={`px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                    (isDeleting || !deletePollingSchemeModal.deleteType || !deletePollingSchemeModal.value) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 