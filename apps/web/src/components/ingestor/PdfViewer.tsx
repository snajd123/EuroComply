'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PdfCoordinates {
  page: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] in PDF points
}

interface PdfViewerProps {
  /** File ID of the uploaded PDF */
  fileId: string;
  /** Coordinates to highlight (optional) */
  highlightCoordinates?: PdfCoordinates | null;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
}

export function PdfViewer({ fileId, highlightCoordinates, onPageChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF when fileId changes
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `/api/v1/admin/ingestor/upload/pdf/${fileId}`;
        const loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };

    if (fileId) {
      loadPdf();
    }

    return () => {
      // Cleanup
      if (pdf) {
        pdf.destroy();
      }
    };
  }, [fileId]);

  // Render page with highlight
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(currentPage);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page
        await page.render({
          canvasContext: context,
          viewport,
        }).promise;

        // Draw highlight if on this page
        if (highlightCoordinates && highlightCoordinates.page === currentPage) {
          const [x1, y1, x2, y2] = highlightCoordinates.bbox;

          // PDF coordinates: origin is bottom-left
          // Canvas coordinates: origin is top-left
          // Need to transform y coordinates
          const pdfHeight = viewport.height / scale;

          const canvasX1 = x1 * scale;
          const canvasY1 = (pdfHeight - y2) * scale; // Flip Y
          const width = (x2 - x1) * scale;
          const height = (y2 - y1) * scale;

          // Draw semi-transparent yellow highlight
          context.fillStyle = 'rgba(255, 255, 0, 0.3)';
          context.fillRect(canvasX1, canvasY1, width, height);

          // Draw border
          context.strokeStyle = 'rgba(255, 180, 0, 0.8)';
          context.lineWidth = 2;
          context.strokeRect(canvasX1, canvasY1, width, height);
        }
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };

    renderPage();
  }, [pdf, currentPage, scale, highlightCoordinates]);

  // Jump to highlight page when coordinates change
  useEffect(() => {
    if (highlightCoordinates && highlightCoordinates.page !== currentPage) {
      setCurrentPage(highlightCoordinates.page);
    }
  }, [highlightCoordinates]);

  // Notify parent of page changes
  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage(p => Math.max(1, p - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center text-red-600">
          <p>Error loading PDF</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-4 p-2 bg-gray-100 border-b shrink-0">
        <button
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
          className="px-3 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
          className="px-3 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
        <div className="border-l pl-4 ml-2">
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="px-2 py-1 border rounded bg-white"
          >
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.2}>120%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 bg-gray-200"
      >
        <canvas
          ref={canvasRef}
          className="mx-auto shadow-lg bg-white"
        />
      </div>
    </div>
  );
}
