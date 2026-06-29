import React, { useState, useCallback } from 'react';

export interface PDFPageOutline {
  pageNumber: number;
  title: string;
}

export interface PDFViewportProps {
  src?: string;
  numPages?: number;
  initialPage?: number;
  title?: string;
  outline?: PDFPageOutline[];
  onPageChange?: (page: number) => void;
}

export const PDFViewport: React.FC<PDFViewportProps> = ({
  numPages = 10,
  initialPage = 1,
  title = 'SuperAgent_Generated_Document.pdf',
  outline = [
    { pageNumber: 1, title: 'Executive Summary' },
    { pageNumber: 2, title: 'System Architecture' },
    { pageNumber: 3, title: 'Multi-Agent Orchestration' },
    { pageNumber: 4, title: 'Multimodal Media Pipelines' },
    { pageNumber: 5, title: 'Performance & Benchmarks' },
  ],
  onPageChange,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOutline, setShowOutline] = useState<boolean>(true);

  const totalPages = Math.max(1, numPages);

  const goToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(1, page), totalPages);
      setCurrentPage(target);
      if (onPageChange) onPageChange(target);
    },
    [totalPages, onPageChange]
  );

  const handleZoom = (delta: number) => {
    setScale((prev) => Number(Math.min(Math.max(prev + delta, 0.5), 2.5).toFixed(2)));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <div style={styles.container} data-testid="pdf-viewport">
      {/* Top Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            style={styles.iconBtn}
            onClick={() => setShowOutline(!showOutline)}
            title="Toggle Sidebar"
          >
            📋
          </button>
          <span style={styles.docTitle}>{title}</span>
        </div>

        {/* Page Navigation */}
        <div style={styles.toolbarCenter}>
          <button style={styles.navBtn} onClick={() => goToPage(1)} disabled={currentPage <= 1}>
            «
          </button>
          <button style={styles.navBtn} onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            ‹
          </button>
          <div style={styles.pageInputGroup}>
            <input
              type="number"
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              style={styles.pageInput}
              min="1"
              max={totalPages}
            />
            <span style={styles.totalPagesLabel}>/ {totalPages}</span>
          </div>
          <button style={styles.navBtn} onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
            ›
          </button>
          <button style={styles.navBtn} onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages}>
            »
          </button>
        </div>

        {/* Zoom & Search */}
        <div style={styles.toolbarRight}>
          <div style={styles.searchBox}>
            <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>🔍</span>
            <input
              type="text"
              placeholder="Search PDF..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.zoomGroup}>
            <button style={styles.iconBtn} onClick={() => handleZoom(-0.15)} title="Zoom Out">
              -
            </button>
            <span style={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
            <button style={styles.iconBtn} onClick={() => handleZoom(0.15)} title="Zoom In">
              +
            </button>
            <button style={styles.iconBtn} onClick={() => setScale(1.0)} title="Fit Page">
              ⟲
            </button>
          </div>

          <button style={styles.iconBtn} onClick={handleRotate} title="Rotate Clockwise">
            ↻
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={styles.mainArea}>
        {/* Sidebar Outline */}
        {showOutline && (
          <div style={styles.sidebar} data-testid="pdf-outline">
            <h4 style={styles.sidebarTitle}>Document Outline</h4>
            <div style={styles.outlineList}>
              {outline.map((item) => (
                <div
                  key={item.pageNumber}
                  style={{
                    ...styles.outlineItem,
                    ...(item.pageNumber === currentPage ? styles.activeOutlineItem : {}),
                  }}
                  onClick={() => goToPage(item.pageNumber)}
                >
                  <span style={styles.outlinePageNum}>P.{item.pageNumber}</span>
                  <span style={styles.outlineTitle}>{item.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Scroll Viewport */}
        <div style={styles.viewport}>
          <div
            style={{
              ...styles.pageContainer,
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'top center',
            }}
          >
            {/* Simulated Rendered PDF Page */}
            <div style={styles.pdfPage}>
              <div style={styles.pdfHeader}>
                <span>CONFIDENTIAL & PROPRIETARY</span>
                <span>PAGE {currentPage}</span>
              </div>

              <div style={styles.pdfBody}>
                <h2 style={styles.pdfHeading}>
                  Chapter {currentPage}: {outline.find((o) => o.pageNumber === currentPage)?.title || 'Technical Report'}
                </h2>
                <div style={styles.pdfRule} />

                <p style={styles.pdfParagraph}>
                  This document provides verified specifications for the SuperAgent autonomous desktop workspace.
                  Using advanced local execution models and context compression, SuperAgent provides high-throughput
                  media processing and multi-agent coordination.
                </p>

                {searchQuery && (
                  <div style={styles.searchMatchNotice}>
                    Matched search query: <strong>"{searchQuery}"</strong> (Highlighted on current viewport)
                  </div>
                )}

                <div style={styles.mockDiagram}>
                  <div style={styles.diagramBox}>Agent Core</div>
                  <div style={styles.diagramArrow}>➔</div>
                  <div style={styles.diagramBox}>PDF Viewport Engine</div>
                </div>

                <p style={styles.pdfParagraph}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
                  et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
                  aliquip ex ea commodo consequat.
                </p>
              </div>

              <div style={styles.pdfFooter}>
                <span>Generated by SuperAgent Desktop PDF Compiler</span>
                <span>Document ID: 9191FFBE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '600px',
    backgroundColor: '#121215',
    border: '1px solid #27272a',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  toolbar: {
    height: '48px',
    backgroundColor: '#18181b',
    borderBottom: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  docTitle: {
    color: '#f4f4f5',
    fontSize: '0.85rem',
    fontWeight: 600,
    maxWidth: '220px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  navBtn: {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    color: '#ffffff',
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    margin: '0 4px',
  },
  pageInput: {
    width: '45px',
    backgroundColor: '#09090b',
    border: '1px solid #3f3f46',
    color: '#ffffff',
    textAlign: 'center',
    borderRadius: '4px',
    padding: '2px 4px',
    fontSize: '0.85rem',
  },
  totalPagesLabel: {
    color: '#a1a1aa',
    fontSize: '0.85rem',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#09090b',
    border: '1px solid #3f3f46',
    borderRadius: '6px',
    padding: '2px 8px',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '0.8rem',
    width: '110px',
  },
  zoomGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#09090b',
    border: '1px solid #3f3f46',
    borderRadius: '6px',
    padding: '2px 6px',
  },
  zoomLabel: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
    minWidth: '40px',
    textAlign: 'center',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: '220px',
    backgroundColor: '#18181b',
    borderRight: '1px solid #27272a',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
  },
  sidebarTitle: {
    color: '#a1a1aa',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  },
  outlineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  outlineItem: {
    padding: '8px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#a1a1aa',
    fontSize: '0.8rem',
    transition: 'background-color 0.2s',
  },
  activeOutlineItem: {
    backgroundColor: '#27272a',
    color: '#ffffff',
    fontWeight: 600,
  },
  outlinePageNum: {
    backgroundColor: '#09090b',
    color: '#8b5cf6',
    padding: '2px 4px',
    borderRadius: '4px',
    fontSize: '0.7rem',
  },
  outlineTitle: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  viewport: {
    flex: 1,
    backgroundColor: '#09090b',
    overflow: 'auto',
    padding: '32px',
    display: 'flex',
    justifyContent: 'center',
  },
  pageContainer: {
    transition: 'transform 0.2s ease-out',
  },
  pdfPage: {
    width: '595px', // A4 proportional standard width
    minHeight: '842px',
    backgroundColor: '#ffffff',
    color: '#18181b',
    padding: '48px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    borderRadius: '2px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  pdfHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.7rem',
    color: '#71717a',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e4e4e7',
    paddingBottom: '8px',
  },
  pdfBody: {
    flex: 1,
    marginTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  pdfHeading: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#09090b',
  },
  pdfRule: {
    height: '2px',
    backgroundColor: '#8b5cf6',
    width: '60px',
  },
  pdfParagraph: {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#27272a',
  },
  searchMatchNotice: {
    backgroundColor: '#fef08a',
    border: '1px solid #facc15',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    color: '#854d0e',
  },
  mockDiagram: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    backgroundColor: '#f4f4f5',
    padding: '20px',
    borderRadius: '8px',
    margin: '12px 0',
  },
  diagramBox: {
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '0.85rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  diagramArrow: {
    color: '#8b5cf6',
    fontWeight: 700,
  },
  pdfFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.7rem',
    color: '#71717a',
    borderTop: '1px solid #e4e4e7',
    paddingTop: '12px',
  },
};
