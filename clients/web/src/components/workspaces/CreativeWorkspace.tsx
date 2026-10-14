import React, { useState } from 'react';
import {
  Palette,
  Film,
  Sparkles,
  Play,
  Layers,
  Sliders,
  Shield,
  Download,
  Check,
  Eye,
  Crop,
  Video,
} from 'lucide-react';
import { DEMO_CREATIVE_STUDIO, CreativeProject } from '../../demoData';

export const CreativeWorkspace: React.FC = () => {
  const [project, setProject] = useState<CreativeProject>(DEMO_CREATIVE_STUDIO);
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');
  const [prompt, setPrompt] = useState('Cybernetic circuit board glowing with cyan neon traces in obsidian casing');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, artifacts, watermark');
  const [selectedRatio, setSelectedRatio] = useState<string>(project.selectedAspectRatio);
  const [selectedModel, setSelectedModel] = useState<string>(project.selectedModelId);
  const [selectedPalette, setSelectedPalette] = useState<string>(project.selectedPalette);
  const [selectedImageId, setSelectedImageId] = useState<string>(project.filmstripGallery[0].id);
  const [showWatermarkModal, setShowWatermarkModal] = useState<boolean>(false);
  const [c2paEnabled, setC2paEnabled] = useState<boolean>(true);
  const [steganographyEnabled, setSteganographyEnabled] = useState<boolean>(true);
  const [brushSize, setBrushSize] = useState<number>(24);
  const [feathering, setFeathering] = useState<number>(4);

  const activeImage = project.filmstripGallery.find((img) => img.id === selectedImageId) || project.filmstripGallery[0];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header & Studio Mode Switch */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Palette size={17} color="#ec4899" />
          <span style={{ fontWeight: 600 }}>Creative Studio: Image & Video Generation Canvas</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#f472b6',
              border: '1px solid #db2777',
            }}
          >
            FLUX.1 DirectML / DALL-E 3
          </span>
        </div>

        {/* Tab switch Image vs Video */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', backgroundColor: '#1e293b', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setActiveTab('image')}
              style={{
                backgroundColor: activeTab === 'image' ? '#ec4899' : 'transparent',
                color: activeTab === 'image' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Image Studio
            </button>
            <button
              onClick={() => setActiveTab('video')}
              style={{
                backgroundColor: activeTab === 'video' ? '#ec4899' : 'transparent',
                color: activeTab === 'video' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Video Studio & Enhancer
            </button>
          </div>

          <button
            onClick={() => setShowWatermarkModal(true)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Shield size={13} color="#06b6d4" /> Watermark & C2PA
          </button>
        </div>
      </div>

      {/* Main Studio Viewport */}
      {activeTab === 'image' ? (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Canvas & Controls */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#090d16',
              padding: '16px',
              gap: '14px',
              overflowY: 'auto',
            }}
          >
            {/* Prompt Composer Deck */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Generation Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    fontSize: '13px',
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Negative Prompt
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    padding: '6px 10px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Aspect Ratio, Model, and Color Palette Row */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Aspect Ratio
                  </label>
                  <select
                    value={selectedRatio}
                    onChange={(e) => setSelectedRatio(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090d16',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  >
                    {project.aspectRatios.map((ar) => (
                      <option key={ar} value={ar}>{ar}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Engine: Local FLUX vs Cloud
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090d16',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  >
                    {project.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.vramRequiredGb ? `(${m.vramRequiredGb}GB VRAM)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Color Palette
                  </label>
                  <select
                    value={selectedPalette}
                    onChange={(e) => setSelectedPalette(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090d16',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                  >
                    {project.colorPalettes.map((cp) => (
                      <option key={cp.name} value={cp.name}>{cp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Inpainting Shelf & Mask Tools */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                  Inpainting Shelf:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                  <span>Brush Size ({brushSize}px):</span>
                  <input
                    type="range"
                    min="4"
                    max="64"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#cbd5e1' }}>
                  <span>Feathering ({feathering}px):</span>
                  <input
                    type="range"
                    min="0"
                    max="16"
                    value={feathering}
                    onChange={(e) => setFeathering(Number(e.target.value))}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              </div>

              <button
                style={{
                  backgroundColor: '#ec4899',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Sparkles size={14} /> Generate High-Res
              </button>
            </div>

            {/* High-Res Viewport Canvas */}
            <div
              style={{
                flex: 1,
                minHeight: '280px',
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <img
                src={activeImage.thumbnailUrl}
                alt={activeImage.prompt}
                style={{
                  width: '85%',
                  maxHeight: '260px',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(15,23,42,0.85)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#94a3b8',
                }}
              >
                Seed: {activeImage.seed} • {activeImage.resolution}
              </div>
            </div>
          </div>

          {/* Right Filmstrip Gallery */}
          <div
            style={{
              width: '280px',
              borderLeft: '1px solid #1e293b',
              backgroundColor: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '16px',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Filmstrip Gallery ({project.filmstripGallery.length})
            </div>

            {project.filmstripGallery.map((img) => {
              const isSelected = img.id === selectedImageId;

              return (
                <div
                  key={img.id}
                  onClick={() => setSelectedImageId(img.id)}
                  style={{
                    backgroundColor: isSelected ? '#1e293b' : '#111827',
                    border: isSelected ? '1px solid #ec4899' : '1px solid #1f2937',
                    borderRadius: '8px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <img
                    src={img.thumbnailUrl}
                    alt={img.prompt}
                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: '1.3', maxHeight: '30px', overflow: 'hidden' }}>
                    {img.prompt}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Seed: {img.seed}</span>
                    <span>{img.resolution}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Video Studio & Enhancer View */
        <div style={{ flex: 1, display: 'flex', backgroundColor: '#090d16', padding: '20px', gap: '20px', overflowY: 'auto' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                <Video size={17} color="#ec4899" />
                <span>{project.activeVideo.title}</span>
              </div>

              {/* Simulated Video Player */}
              <div
                style={{
                  height: '280px',
                  backgroundColor: '#020617',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <Play size={48} color="#ec4899" style={{ cursor: 'pointer', opacity: 0.85 }} />
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                    {project.activeVideo.resolution} • {project.activeVideo.fps} FPS ({project.activeVideo.durationSeconds}s)
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt Enhancer Deck */}
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={15} color="#8b5cf6" />
                <span>AI Prompt Enhancer (SuperAgent Co-Director)</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Original Raw Prompt:</div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', padding: '6px 10px', backgroundColor: '#090d16', borderRadius: '4px', marginTop: '4px' }}>
                    "{project.activeVideo.originalPrompt}"
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#a855f7', fontWeight: 600 }}>Enhanced Kinetic Prompt:</div>
                  <div style={{ fontSize: '12px', color: '#e0e7ff', padding: '8px 12px', backgroundColor: '#1e1b4b', border: '1px solid #4338ca', borderRadius: '6px', marginTop: '4px', lineHeight: '1.4' }}>
                    {project.activeVideo.enhancedPrompt}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Watermark & C2PA Modal */}
      {showWatermarkModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '20px',
              width: '460px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} color="#06b6d4" />
                <span>Watermark & Provenance Governance</span>
              </div>
              <button
                onClick={() => setShowWatermarkModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1' }}>
                <span>C2PA Cryptographic Content Credentials Manifest</span>
                <input
                  type="checkbox"
                  checked={c2paEnabled}
                  onChange={(e) => setC2paEnabled(e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1' }}>
                <span>Invisible Steganographic Watermark (Robust to transforms)</span>
                <input
                  type="checkbox"
                  checked={steganographyEnabled}
                  onChange={(e) => setSteganographyEnabled(e.target.checked)}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                onClick={() => setShowWatermarkModal(false)}
                style={{
                  backgroundColor: '#1f6feb',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save Policies
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
