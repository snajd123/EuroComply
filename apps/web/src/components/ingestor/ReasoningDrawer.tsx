'use client';

import { useEffect } from 'react';
import type { Requirement } from './RequirementCard';

interface ReasoningDrawerProps {
  requirement: Requirement | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReasoningDrawer({ requirement, isOpen, onClose }: ReasoningDrawerProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !requirement) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold">AI Reasoning</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Requirement Info */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Requirement</div>
            <div className="font-medium">{requirement.name}</div>
            <div className="text-sm text-gray-600">{requirement.code}</div>
          </div>

          {/* Confidence */}
          {requirement.confidenceScore !== undefined && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confidence Score</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      requirement.confidenceScore >= 0.95 ? 'bg-green-500' :
                      requirement.confidenceScore >= 0.85 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${requirement.confidenceScore * 100}%` }}
                  />
                </div>
                <span className="font-medium text-sm">
                  {Math.round(requirement.confidenceScore * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Extraction Reasoning
            </div>
            <div className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
              {requirement.reasoning || 'No reasoning provided.'}
            </div>
          </div>

          {/* Conflict Details */}
          {requirement.consensusStatus === 'CONFLICT' && requirement.conflictDetails && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Model Disagreement
              </div>
              <div className="bg-red-50 p-3 rounded-lg text-sm space-y-2">
                <div>
                  <span className="font-medium">Claude (Primary):</span>{' '}
                  {requirement.conflictDetails.claude.threshold} {requirement.conflictDetails.claude.unit}
                </div>
                <div>
                  <span className="font-medium">Gemini (Shadow):</span>{' '}
                  {requirement.conflictDetails.gemini.threshold} {requirement.conflictDetails.gemini.unit}
                </div>
                <p className="text-red-700 text-xs mt-2">
                  Warning: The two AI models extracted different threshold values. Please verify against the source document.
                </p>
              </div>
            </div>
          )}

          {/* Legal Reference */}
          {requirement.legalReference && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Legal Reference
              </div>
              <div className="text-sm bg-blue-50 p-3 rounded-lg">
                {requirement.legalReference}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
