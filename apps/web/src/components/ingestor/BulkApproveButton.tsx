'use client';

import { useState } from 'react';

interface BulkApproveButtonProps {
  matchCount: number;
  onApprove: () => Promise<void>;
  disabled?: boolean;
}

export function BulkApproveButton({ matchCount, onApprove, disabled }: BulkApproveButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading || disabled || matchCount === 0) return;

    setLoading(true);
    try {
      await onApprove();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading || matchCount === 0}
      className={`
        px-4 py-2 rounded-lg font-medium transition-colors
        ${matchCount === 0
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
        }
      `}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin">&#x27F3;</span>
          Approving...
        </span>
      ) : (
        <>Approve All Matches ({matchCount})</>
      )}
    </button>
  );
}
