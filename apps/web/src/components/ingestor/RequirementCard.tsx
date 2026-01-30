'use client';

import { ConsensusBadge, type ConsensusStatus } from './ConsensusBadge';
import type { PdfCoordinates } from '../pdf';

export interface Requirement {
  id: string;
  code: string;
  name: string;
  substanceName?: string;
  casNumber?: string;
  operator?: string;
  thresholdValue?: number;
  unit?: string;
  scope?: string[];
  legalReference?: string;
  confidenceScore?: number;
  reasoning?: string;
  consensusStatus: ConsensusStatus;
  conflictDetails?: {
    claude: { threshold: number; unit: string };
    gemini: { threshold: number; unit: string };
  };
  pdfCoordinates?: PdfCoordinates;
  isApproved?: boolean;
}

export interface RequirementCardProps {
  requirement: Requirement;
  isSelected?: boolean;
  onClick?: () => void;
  onApprove?: () => void;
  onEdit?: (requirement: Requirement) => void;
  onViewReasoning?: () => void;
}

export function RequirementCard({
  requirement,
  isSelected = false,
  onClick,
  onApprove,
  onEdit,
  onViewReasoning,
}: RequirementCardProps) {
  const {
    code,
    name,
    substanceName,
    casNumber,
    operator,
    thresholdValue,
    unit,
    scope,
    legalReference,
    confidenceScore,
    consensusStatus,
    conflictDetails,
    pdfCoordinates,
    isApproved,
  } = requirement;

  const formatThreshold = () => {
    if (thresholdValue === undefined) return null;
    const op = operator === 'LT' ? '<' : operator === 'LTE' ? '<=' : operator === 'GT' ? '>' : operator === 'GTE' ? '>=' : operator === 'EQ' ? '=' : '';
    return `${op} ${thresholdValue} ${unit || ''}`;
  };

  return (
    <div
      onClick={onClick}
      className={`
        p-4 bg-white border rounded-lg cursor-pointer transition-all
        ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-300'}
        ${isApproved ? 'border-l-4 border-l-green-500' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{code}</span>
            <ConsensusBadge status={consensusStatus} />
            {isApproved && (
              <span className="text-xs text-green-600 font-medium">Approved</span>
            )}
          </div>
          <h4 className="font-medium text-gray-900 mt-1">{name}</h4>
        </div>
        <div className="flex items-start gap-4">
          {pdfCoordinates?.page !== undefined && (
            <div className="text-right">
              <div className="text-xs text-gray-400">Page {pdfCoordinates.page}</div>
            </div>
          )}
          {confidenceScore !== undefined && (
            <div className="text-right">
              <div className="text-xs text-gray-500">Confidence</div>
              <div className={`font-medium ${confidenceScore >= 0.95 ? 'text-green-600' : confidenceScore >= 0.85 ? 'text-yellow-600' : 'text-red-600'}`}>
                {Math.round(confidenceScore * 100)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Substance Info */}
      {(substanceName || casNumber) && (
        <div className="mb-2">
          {substanceName && <div className="text-sm font-medium">{substanceName}</div>}
          {casNumber && <div className="text-xs text-gray-500">CAS: {casNumber}</div>}
        </div>
      )}

      {/* Threshold */}
      {formatThreshold() && (
        <div className="mb-2">
          <span className="text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
            {formatThreshold()}
          </span>
        </div>
      )}

      {/* Conflict Details */}
      {consensusStatus === 'CONFLICT' && conflictDetails && (
        <div className="mb-2 p-2 bg-red-50 rounded text-xs">
          <div className="font-medium text-red-800 mb-1">Threshold Conflict:</div>
          <div className="flex gap-4">
            <div>
              <span className="text-gray-600">Claude:</span>{' '}
              <span className="font-medium">{conflictDetails.claude.threshold} {conflictDetails.claude.unit}</span>
            </div>
            <div>
              <span className="text-gray-600">Gemini:</span>{' '}
              <span className="font-medium">{conflictDetails.gemini.threshold} {conflictDetails.gemini.unit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Scope */}
      {scope && scope.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {scope.map((s, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Legal Reference */}
      {legalReference && (
        <div className="text-xs text-gray-500 mb-2">
          Ref: {legalReference}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t">
        {!isApproved && onApprove && (
          <button
            onClick={(e) => { e.stopPropagation(); onApprove(); }}
            className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Approve
          </button>
        )}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(requirement); }}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Edit
          </button>
        )}
        {onViewReasoning && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewReasoning(); }}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            View Reasoning
          </button>
        )}
      </div>
    </div>
  );
}
