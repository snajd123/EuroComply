const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getAdminKey(): string {
  return process.env.NEXT_PUBLIC_ADMIN_KEY || '';
}

export interface StagingRegulation {
  id: string;
  code: string;
  name: string;
  sourceType: string;
  status: string;
  createdAt: string;
  requirementCount: number;
}

export interface ExtractionResult {
  stagingRegulationId: string;
  regulationCode: string;
  regulationName: string;
  requirementCount: number;
  consensusSummary: {
    match: number;
    conflict: number;
    lowConfidence: number;
    shadowMissing: number;
  };
}

export interface StagingRegulationDetail {
  id: string;
  code: string;
  name: string;
  sourceUrl: string;
  sourceType: string;
  status: string;
  createdAt: string;
  pdfFileId?: string;
  primaryPayload: unknown;
  shadowPayload: unknown;
  requirements: Array<{
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
    type: string;
    severity: string;
    confidenceScore?: number;
    reasoning?: string;
    consensusStatus: string;
    conflictDetails?: {
      claude: { threshold: number; unit: string };
      gemini: { threshold: number; unit: string };
    };
    isApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    pdfCoordinates?: { page: number; bbox: number[] };
  }>;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': process.env.NEXT_PUBLIC_ADMIN_KEY || '',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

export const ingestorApi = {
  uploadPdf: async (file: File): Promise<{ fileId: string; filename: string; size: number }> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/api/v1/admin/ingestor/upload/pdf`, {
      method: 'POST',
      headers: {
        'X-Admin-Key': getAdminKey(),
      },
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: { message: 'Upload failed' } }));
      throw new Error(data.error?.message || 'Upload failed');
    }

    const data = await res.json();
    return data.data;
  },

  extract: (params: {
    sourceUrl?: string;
    sourceType: 'EUR_LEX' | 'ECHA' | 'MANUAL';
    documentText?: string;
    fileId?: string;
  }) =>
    fetchApi<ExtractionResult>('/api/v1/admin/ingestor/extract', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  listStaging: () => fetchApi<StagingRegulation[]>('/api/v1/admin/ingestor/staging'),

  getStaging: (id: string) => fetchApi<StagingRegulationDetail>(`/api/v1/admin/ingestor/staging/${id}`),

  bulkApprove: (id: string) => fetchApi<{ approvedCount: number }>(
    `/api/v1/admin/ingestor/staging/${id}/bulk-approve`,
    { method: 'POST' }
  ),

  publish: (id: string) => fetchApi<{ regulationId: string; requirementCount: number }>(
    `/api/v1/admin/ingestor/staging/${id}/publish`,
    { method: 'POST' }
  ),

  deleteStaging: (id: string) => fetchApi<void>(
    `/api/v1/admin/ingestor/staging/${id}`,
    { method: 'DELETE' }
  ),
};
