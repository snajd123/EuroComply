'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface PdfCoordinates {
  page: number;
  bbox: [number, number, number, number]; // [left, top, right, bottom]
}

export interface PdfViewerProps {
  url: string;
  highlight?: PdfCoordinates | null;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function PdfViewer({ url, highlight, onPageChange, className = '' }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        const loadingTask = pdfjsLib.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [url]);

  // Render current page
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdf || !canvasRef.current) return;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      onPageChange?.(pageNum);
    } catch (err) {
      console.error('Error rendering page:', err);
    }
  }, [pdf, scale, onPageChange]);

  // Render page when it changes
  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, renderPage]);

  // Handle highlight
  useEffect(() => {
    if (!highlight || !canvasRef.current || !highlightRef.current || !pdf) return;

    // Jump to highlight page if different
    if (highlight.page !== currentPage) {
      setCurrentPage(highlight.page);
    }

    // Position highlight overlay
    const canvas = canvasRef.current;
    const highlightEl = highlightRef.current;

    // Convert PDF coordinates to canvas coordinates
    // PDF coordinates are from bottom-left, canvas from top-left
    const [left, bottom, right, top] = highlight.bbox;

    // Get page to calculate coordinate transformation
    pdf.getPage(highlight.page).then((page) => {
      const viewport = page.getViewport({ scale });

      // Transform coordinates
      const x = left * scale;
      const y = viewport.height - (top * scale);
      const width = (right - left) * scale;
      const height = (top - bottom) * scale;

      highlightEl.style.display = 'block';
      highlightEl.style.left = `${x}px`;
      highlightEl.style.top = `${y}px`;
      highlightEl.style.width = `${width}px`;
      highlightEl.style.height = `${height}px`;
    });
  }, [highlight, currentPage, pdf, scale]);

  // Clear highlight when removed
  useEffect(() => {
    if (!highlight && highlightRef.current) {
      highlightRef.current.style.display = 'none';
    }
  }, [highlight]);

  const goToPrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < numPages) setCurrentPage(currentPage + 1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-100 ${className}`}>
        <div className="text-gray-500">Loading PDF...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full bg-red-50 ${className}`}>
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-white border rounded disabled:opacity-50 hover:bg-gray-50"
          >
            ←
          </button>
          <span className="text-sm">
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="px-3 py-1 bg-white border rounded disabled:opacity-50 hover:bg-gray-50"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
            className="px-3 py-1 bg-white border rounded hover:bg-gray-50"
          >
            −
          </button>
          <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(3, s + 0.25))}
            className="px-3 py-1 bg-white border rounded hover:bg-gray-50"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-200 p-4"
      >
        <div className="relative inline-block mx-auto shadow-lg">
          <canvas ref={canvasRef} className="block" />
          <div
            ref={highlightRef}
            className="absolute bg-yellow-300/40 border-2 border-yellow-500 pointer-events-none"
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}

export default PdfViewer;
