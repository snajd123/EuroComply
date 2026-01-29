import { cn } from '@/lib/utils';

export type ConsensusStatus = 'MATCH' | 'CONFLICT' | 'LOW_CONFIDENCE' | 'SHADOW_MISSING';

interface ConsensusBadgeProps {
  status: ConsensusStatus;
  className?: string;
}

const statusConfig: Record<ConsensusStatus, { label: string; className: string }> = {
  MATCH: {
    label: 'Match',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  CONFLICT: {
    label: 'Conflict',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  LOW_CONFIDENCE: {
    label: 'Low Confidence',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  SHADOW_MISSING: {
    label: 'Unverified',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

export function ConsensusBadge({ status, className }: ConsensusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
