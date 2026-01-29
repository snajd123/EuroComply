const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface StagingRegulation {
  id: string;
  code: string;
  name: string;
  sourceType: string;
  status: string;
  createdAt: string;
  requirementCount: number;
}

export interface StagingRegulationDetail {
  id: string;
  code: string;
  name: string;
  sourceUrl: string;
  sourceType: string;
  status: string;
  createdAt: string;
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
