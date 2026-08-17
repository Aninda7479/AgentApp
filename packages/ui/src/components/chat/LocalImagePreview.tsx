import React, { useState } from 'react';

interface LocalImagePreviewProps {
  filePath: string;
  apiBaseUrl?: string;
  alt?: string;
}

export const LocalImagePreview: React.FC<LocalImagePreviewProps> = ({
  filePath,
  apiBaseUrl,
  alt = 'Local image'
}) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const imageUrl = apiBaseUrl 
    ? `${apiBaseUrl}/api/media/${encodeURIComponent(filePath)}`
    : filePath;

  return (
    <div className="relative rounded-lg overflow-hidden border border-[color:var(--brand-border)] bg-[color:var(--brand-card)] max-w-sm">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--brand-card)]">
          <div className="w-5 h-5 rounded-full border-2 border-[color:var(--brand-border)] border-t-[color:var(--brand-text-main)] animate-spin" />
        </div>
      )}
      
      {error ? (
        <div className="p-4 flex items-center justify-center text-sm text-[color:var(--neon-destructive)] text-center min-h-[100px]">
          Failed to load image
          <br />
          <span className="text-xs text-[color:var(--brand-text-muted)] truncate max-w-full px-2 mt-1">
            {filePath}
          </span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          className={`w-full h-auto max-h-[300px] object-contain transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
        />
      )}
    </div>
  );
};
