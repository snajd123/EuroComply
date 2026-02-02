'use client';

import { useState, useRef, useCallback } from 'react';
import { ingestorApi, ExtractionResult } from '@/lib/api';

type SourceType = 'EUR_LEX' | 'ECHA' | 'MANUAL';
type TabType = 'url' | 'text' | 'pdf';

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

  // PDF tab state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfFileId, setPdfFileId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfFile = async (file: File) => {
    if (!file.type.includes('pdf')) {
      setPdfError('Please select a PDF file');
      return;
    }

    setPdfFile(file);
    setPdfLoading(true);
    setPdfError(null);
    setPdfFileId(null);

    try {
      const result = await ingestorApi.uploadPdf(file);
      setPdfFileId(result.fileId);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to upload PDF');
      setPdfFile(null);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // Early return AFTER all hooks
  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handlePdfFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handlePdfFile(files[0]);
    }
  };

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
    } else if (activeTab === 'text') {
      if (!textDocumentText.trim()) {
        return 'Document text is required';
      }
    } else if (activeTab === 'pdf') {
      if (!pdfFileId) {
        return 'Please upload a PDF first';
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
      let params: {
        sourceUrl?: string;
        sourceType: SourceType;
        documentText?: string;
        fileId?: string;
      };

      if (activeTab === 'url') {
        params = {
          sourceUrl: urlSourceUrl.trim(),
          sourceType: detectSourceType(urlSourceUrl),
          documentText: urlDocumentText.trim(),
        };
      } else if (activeTab === 'text') {
        params = {
          sourceUrl: textSourceUrl.trim() || 'manual-entry',
          sourceType: textSourceType,
          documentText: textDocumentText.trim(),
        };
      } else {
        // PDF tab
        params = {
          fileId: pdfFileId!,
          sourceType: 'MANUAL',
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
    setPdfFile(null);
    setPdfFileId(null);
    setPdfLoading(false);
    setPdfError(null);
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
            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={tabClass('pdf')}
            >
              Upload PDF
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

          {/* PDF Tab Content */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }
                  ${pdfLoading ? 'pointer-events-none opacity-50' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {pdfLoading ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                    <p className="text-gray-600">Uploading PDF...</p>
                  </div>
                ) : pdfFileId ? (
                  <div className="flex flex-col items-center">
                    <svg className="w-10 h-10 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-gray-800 font-medium">{pdfFile?.name}</p>
                    <p className="text-sm text-green-600 mt-1">Uploaded successfully</p>
                    <p className="text-sm text-gray-500 mt-1">Click or drop to replace</p>
                  </div>
                ) : pdfFile ? (
                  <div className="flex flex-col items-center">
                    <svg className="w-10 h-10 text-yellow-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-gray-800 font-medium">{pdfFile.name}</p>
                    <p className="text-sm text-yellow-600 mt-1">Upload incomplete</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-gray-600">Drop PDF here or click to browse</p>
                    <p className="text-sm text-gray-400 mt-1">Only .pdf files are accepted</p>
                  </div>
                )}
              </div>

              {/* PDF Error */}
              {pdfError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  Error: {pdfError}
                </div>
              )}

              {/* Upload Info */}
              {pdfFileId && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  PDF uploaded and ready for extraction. The server will extract text with coordinate information preserved.
                </div>
              )}
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
