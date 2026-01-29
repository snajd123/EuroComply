'use client';

import { useState } from 'react';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  regulationName: string;
  approvedCount: number;
  totalCount: number;
}

export function PublishModal({
  isOpen,
  onClose,
  onConfirm,
  regulationName,
  approvedCount,
  totalCount,
}: PublishModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const unapprovedCount = totalCount - approvedCount;
  const canPublish = approvedCount > 0;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
          <h2 className="text-xl font-bold mb-4">Publish to Production</h2>

          <div className="mb-4">
            <p className="text-gray-600 mb-2">
              You are about to publish <strong>{regulationName}</strong> to the production database.
            </p>

            <div className="bg-gray-50 p-3 rounded-lg space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Approved requirements:</span>
                <span className="font-medium text-green-600">{approvedCount}</span>
              </div>
              {unapprovedCount > 0 && (
                <div className="flex justify-between">
                  <span>Unapproved (will be skipped):</span>
                  <span className="font-medium text-yellow-600">{unapprovedCount}</span>
                </div>
              )}
            </div>
          </div>

          {unapprovedCount > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              Warning: {unapprovedCount} requirement(s) have not been approved and will remain in staging for later review.
            </div>
          )}

          {!canPublish && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              Cannot publish: No requirements have been approved.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              Error: {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !canPublish}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
