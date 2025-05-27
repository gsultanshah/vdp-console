'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Constituency {
  _id: string;
  name: string;
  label: string;
  description?: string;
  status: 'active' | 'inactive';
  blockCodes: string[];
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
  const router = useRouter();

  useEffect(() => {
    fetchConstituencies();
  }, []);

  const fetchConstituencies = async () => {
    try {
      const response = await fetch('/api/constituency');
      const data = await response.json();
      setConstituencies(data);
    } catch (error) {
      toast.error('Failed to fetch constituencies');
    } finally {
      setIsLoading(false);
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
          blockCodes: blockCodesArray
        })
      });

      if (!response.ok) throw new Error('Failed to create constituency');
      
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
      toast.error('Failed to create constituency');
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

  return (
    <div className="space-y-8">
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Constituency Management
          </h2>
        </div>
      </div>

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
                      <h4 className="text-lg font-medium">{constituency.name}</h4>
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
    </div>
  );
} 