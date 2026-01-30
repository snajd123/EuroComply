'use client';

import { useState } from 'react';
import { ingestorApi, ExtractionResult } from '@/lib/api';

type SourceType = 'EUR_LEX' | 'ECHA' | 'MANUAL';
type TabType = 'url' | 'text';

interface ExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ExtractionResult) => void;
}

function detectSourceType(url: string): SourceType {
  if (url.includes('eur-lex.europa.eu')) return 'EUR_LEX';
  if (url.includes('echa.europa.eu')) return 'ECHA';
  return 'MANUAL';
}

export function ExtractModal({ isOpen, onClose, onSuccess }: ExtractModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('url');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL tab state
  const [urlSourceUrl, setUrlSourceUrl] = useState('');
  const [urlDocumentText, setUrlDocumentText] = useState('');

  // Text tab state
  const [textSourceType, setTextSourceType] = useState<SourceType>('MANUAL');
  const [textSourceUrl, setTextSourceUrl] = useState('');
  const [textDocumentText, setTextDocumentText] = useState('');

  if (!isOpen) return null;

  const handleUrlChange = (url: string) => {
    setUrlSourceUrl(url);
  };

  const validateForm = (): string | null => {
    if (activeTab === 'url') {
      if (!urlSourceUrl.trim()) {
        return 'Source URL is required';
      }
      if (!urlDocumentText.trim()) {
        return 'Document text is required';
      }
    } else {
      if (!textDocumentText.trim()) {
        return 'Document text is required';
      }
    }
    return null;
  };

  const handleExtract = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let params: { sourceUrl: string; sourceType: SourceType; documentText: string };

      if (activeTab === 'url') {
        params = {
          sourceUrl: urlSourceUrl.trim(),
          sourceType: detectSourceType(urlSourceUrl),
          documentText: urlDocumentText.trim(),
        };
      } else {
        params = {
          sourceUrl: textSourceUrl.trim() || 'manual-entry',
          sourceType: textSourceType,
          documentText: textDocumentText.trim(),
        };
      }

      const result = await ingestorApi.extract(params);
      onSuccess(result);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract regulation');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    setUrlSourceUrl('');
    setUrlDocumentText('');
    setTextSourceType('MANUAL');
    setTextSourceUrl('');
    setTextDocumentText('');
    setError(null);
    setActiveTab('url');
    onClose();
  };

  const tabClass = (tab: TabType) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-blue-600 text-blue-600 bg-blue-50'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Extract New Regulation</h2>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={tabClass('url')}
            >
              From URL
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={tabClass('text')}
            >
              Paste Text
            </button>
          </div>

          {/* URL Tab Content */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="url-source" className="block text-sm font-medium text-gray-700 mb-1">
                  Source URL <span className="text-red-500">*</span>
                </label>
                <input
                  id="url-source"
                  type="url"
                  value={urlSourceUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://eur-lex.europa.eu/..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {urlSourceUrl && (
                  <p className="mt-1 text-sm text-gray-500">
                    Detected source: <span className="font-medium">{detectSourceType(urlSourceUrl)}</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="url-document-text" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="url-document-text"
                  value={urlDocumentText}
                  onChange={(e) => setUrlDocumentText(e.target.value)}
                  placeholder="Paste the regulation document text here..."
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Copy and paste the full text content from the regulation document.
                </p>
              </div>
            </div>
          )}

          {/* Text Tab Content */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="text-source-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Source Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="text-source-type"
                  value={textSourceType}
                  onChange={(e) => setTextSourceType(e.target.value as SourceType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="EUR_LEX">EUR-Lex (European Union Law)</option>
                  <option value="ECHA">ECHA (European Chemicals Agency)</option>
                  <option value="MANUAL">Manual Entry</option>
                </select>
              </div>

              <div>
                <label htmlFor="text-source-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Reference URL <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  id="text-source-url"
                  type="url"
                  value={textSourceUrl}
                  onChange={(e) => setTextSourceUrl(e.target.value)}
                  placeholder="https://example.com/regulation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="text-document-text" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="text-document-text"
                  value={textDocumentText}
                  onChange={(e) => setTextDocumentText(e.target.value)}
                  placeholder="Paste the regulation document text here..."
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              Error: {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExtract}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Extracting...' : 'Extract'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
