'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ingestorApi, type StagingRegulationDetail } from '@/lib/api';
import { RequirementCard, type Requirement, type ConsensusStatus } from '@/components/ingestor';
import { ReasoningDrawer } from '@/components/ingestor/ReasoningDrawer';
import { BulkApproveButton } from '@/components/ingestor/BulkApproveButton';
import { PublishModal } from '@/components/ingestor/PublishModal';
import { PdfViewer, type PdfCoordinates } from '@/components/pdf';

export default function StagingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [regulation, setRegulation] = useState<StagingRegulationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [highlight, setHighlight] = useState<PdfCoordinates | null>(null);

  const loadRegulation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ingestorApi.getStaging(id);
      setRegulation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load regulation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRegulation();
  }, [loadRegulation]);

  const handleBulkApprove = async () => {
    await ingestorApi.bulkApprove(id);
    await loadRegulation();
  };

  const handlePublish = async () => {
    await ingestorApi.publish(id);
    router.push('/admin/ingestor');
  };

  const handleRequirementClick = (req: Requirement) => {
    setSelectedRequirement(req);
    if (req.pdfCoordinates) {
      setHighlight({
        page: req.pdfCoordinates.page,
        bbox: req.pdfCoordinates.bbox as [number, number, number, number],
      });
    }
  };

  if (loading) {
    return (
      <main className="container mx-auto p-8">
        <div className="text-center text-gray-500">Loading...</div>
      </main>
    );
  }

  if (error || !regulation) {
    return (
      <main className="container mx-auto p-8">
        <div className="text-red-600">{error || 'Regulation not found'}</div>
        <Link href="/admin/ingestor" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to list
        </Link>
      </main>
    );
  }

  const requirements: Requirement[] = regulation.requirements.map(r => ({
    ...r,
    consensusStatus: r.consensusStatus as ConsensusStatus,
    pdfCoordinates: r.pdfCoordinates ? {
      page: r.pdfCoordinates.page,
      bbox: r.pdfCoordinates.bbox as [number, number, number, number],
    } : undefined,
  }));

  const matchCount = requirements.filter(r => r.consensusStatus === 'MATCH' && !r.isApproved).length;
  const approvedCount = requirements.filter(r => r.isApproved).length;

  return (
    <main className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin/ingestor" className="text-sm text-gray-500 hover:text-gray-700">
              Back to list
            </Link>
            <h1 className="text-xl font-bold mt-1">{regulation.name}</h1>
            <p className="text-sm text-gray-600">{regulation.code} - {regulation.sourceType}</p>
          </div>
          <div className="flex items-center gap-3">
            <BulkApproveButton
              matchCount={matchCount}
              onApprove={handleBulkApprove}
            />
            <button
              onClick={() => setPublishOpen(true)}
              disabled={approvedCount === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Publish to Production
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Dual Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - PDF Viewer */}
        <div className="w-1/2 border-r">
          {regulation.sourceUrl ? (
            <PdfViewer
              url={regulation.sourceUrl}
              highlight={highlight}
              className="h-full"
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100 text-gray-500">
              No PDF available
            </div>
          )}
        </div>

        {/* Right Pane - Requirements List */}
        <div className="w-1/2 overflow-y-auto p-4 bg-gray-50">
          <div className="mb-4">
            <h2 className="font-semibold">
              Requirements ({requirements.length})
            </h2>
            <p className="text-sm text-gray-600">
              {approvedCount} approved - {matchCount} matches ready to approve
            </p>
          </div>

          <div className="space-y-3">
            {requirements.map((req) => (
              <RequirementCard
                key={req.id}
                requirement={req}
                isSelected={selectedRequirement?.id === req.id}
                onClick={() => handleRequirementClick(req)}
                onViewReasoning={() => {
                  setSelectedRequirement(req);
                  setReasoningOpen(true);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Reasoning Drawer */}
      <ReasoningDrawer
        requirement={selectedRequirement}
        isOpen={reasoningOpen}
        onClose={() => setReasoningOpen(false)}
      />

      {/* Publish Modal */}
      <PublishModal
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        regulationName={regulation.name}
        approvedCount={approvedCount}
        totalCount={requirements.length}
      />
    </main>
  );
}
