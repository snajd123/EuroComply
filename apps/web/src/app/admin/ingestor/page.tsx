'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ingestorApi, type StagingRegulation } from '@/lib/api';
import { ExtractModal } from '@/components/ingestor';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  PARTIALLY_APPROVED: 'bg-blue-100 text-blue-800',
  PUBLISHED: 'bg-purple-100 text-purple-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function IngestorPage() {
  const [regulations, setRegulations] = useState<StagingRegulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extractModalOpen, setExtractModalOpen] = useState(false);

  useEffect(() => {
    loadRegulations();
  }, []);

  const loadRegulations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ingestorApi.listStaging();
      setRegulations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load regulations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="container mx-auto p-8">
        <div className="text-center text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Regulation Ingestor</h1>
          <p className="text-gray-600">Review and approve AI-extracted regulations</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setExtractModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            New Extraction
          </button>
          <button
            onClick={loadRegulations}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {regulations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No staging regulations found.</p>
          <p className="text-sm text-gray-400 mt-1">
            Extract a regulation using the API to see it here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Regulation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requirements
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {regulations.map((reg) => (
                <tr key={reg.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{reg.name}</div>
                    <div className="text-sm text-gray-500">{reg.code}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{reg.sourceType}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[reg.status] || 'bg-gray-100'}`}>
                      {reg.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {reg.requirementCount}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(reg.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/ingestor/${reg.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExtractModal
        isOpen={extractModalOpen}
        onClose={() => setExtractModalOpen(false)}
        onSuccess={() => {
          setExtractModalOpen(false);
          loadRegulations();
        }}
      />
    </main>
  );
}
