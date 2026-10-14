import React, { useState } from 'react';
import {
  Sparkles,
  Camera,
  Volume2,
  Smile,
  Radio,
  Sliders,
  Maximize2,
  Check,
  RefreshCw,
  Heart,
  Eye,
} from 'lucide-react';
import { DEMO_COMPANION_STATE, CompanionState } from '../../demoData';

export const CompanionWorkspace: React.FC = () => {
  const [companion, setCompanion] = useState<CompanionState>(DEMO_COMPANION_STATE);
  const [selectedPhotoPreset, setSelectedPhotoPreset] = useState<string>('Portrait Bokeh');
  const [isCapturingPhoto, setIsCapturingPhoto] = useState<boolean>(false);

  const moodList: CompanionState['activeMood'][] = ['Joy', 'Thinking', 'Error', 'Welcoming', 'Sleeping'];

  const handleSelectMood = (mood: CompanionState['activeMood']) => {
    setCompanion((prev) => ({ ...prev, activeMood: mood }));
  };

  const handleTogglePetSetting = (key: keyof CompanionState['desktopPetSettings']) => {
    setCompanion((prev) => ({
      ...prev,
      desktopPetSettings: {
        ...prev.desktopPetSettings,
        [key]: !prev.desktopPetSettings[key],
      },
    }));
  };

  const handleTriggerPhoto = () => {
    setIsCapturingPhoto(true);
    setTimeout(() => setIsCapturingPhoto(false), 800);
  };

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
      {/* Top Header & VRM Studio Bar */}
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
          <Sparkles size={17} color="#d29922" />
          <span style={{ fontWeight: 600 }}>3D VRM Companion & Live Presence Studio</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#d29922',
              border: '1px solid #bb8009',
            }}
          >
            {companion.avatarName}
          </span>
        </div>

        {/* Emotion Mood Chips Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', marginRight: '4px' }}>Active Emotion:</span>
          {moodList.map((mood) => {
            const isActive = companion.activeMood === mood;

            return (
              <button
                key={mood}
                onClick={() => handleSelectMood(mood)}
                style={{
                  backgroundColor: isActive ? '#d29922' : '#1e293b',
                  color: isActive ? '#000000' : '#c9d1d9',
                  border: isActive ? '1px solid #d29922' : '1px solid #334155',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {mood}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 2-Column Stage Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: 3D Avatar Viewport */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#020617',
            padding: '20px',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Simulated 3D Avatar Rendering Stage */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '12px',
              border: '1px solid #1e293b',
              position: 'relative',
              background: 'radial-gradient(circle at center, #1e1b4b 0%, #020617 70%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
            }}
          >
            {/* 3D Holographic Model Mockup Silhouette */}
            <svg width="280" height="380" viewBox="0 0 280 380" fill="none">
              <defs>
                <linearGradient id="avatarGlow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
                </linearGradient>
                <filter id="bloom">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Head & Hair */}
              <circle cx="140" cy="110" r="48" fill="#1e1b4b" stroke="url(#avatarGlow)" strokeWidth="3" filter="url(#bloom)" />
              <path d="M 100 95 Q 140 60 180 95 Q 140 80 100 95 Z" fill="#c084fc" />

              {/* Eyes & Viseme Lips */}
              <circle cx="125" cy="108" r="4" fill="#38bdf8" />
              <circle cx="155" cy="108" r="4" fill="#38bdf8" />
              <ellipse cx="140" cy="130" rx={8 * (1 + companion.visemeValues.O * 2)} ry={4 * (1 + companion.visemeValues.A * 2)} fill="#ec4899" />

              {/* Torso & Cybernetic Accents */}
              <path d="M 100 160 L 180 160 L 195 270 L 85 270 Z" fill="#0f172a" stroke="#818cf8" strokeWidth="2" />
              <line x1="140" y1="160" x2="140" y2="270" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />

              {/* Arms */}
              <path d="M 98 165 L 60 250" stroke="#818cf8" strokeWidth="6" strokeLinecap="round" />
              <path d="M 182 165 L 220 250" stroke="#818cf8" strokeWidth="6" strokeLinecap="round" />
            </svg>

            {/* Flash Overlay when taking photo */}
            {isCapturingPhoto && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: '#ffffff',
                  opacity: 0.8,
                  transition: 'opacity 0.4s ease-out',
                }}
              />
            )}

            {/* Stage Camera Controls overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                padding: '8px 16px',
                borderRadius: '30px',
                border: '1px solid #334155',
                backdropFilter: 'blur(8px)',
              }}
            >
              <button
                onClick={handleTriggerPhoto}
                style={{
                  backgroundColor: '#ec4899',
                  border: 'none',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <Camera size={14} /> Snap Photo
              </button>

              <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                Preset: <strong>{selectedPhotoPreset}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Viseme Audio Lip-Sync Gauge & Desktop Pet Controls */}
        <div
          style={{
            width: '360px',
            borderLeft: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '18px',
          }}
        >
          {/* Audio Viseme Lip-Sync Gauge */}
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                <Volume2 size={14} color="#818cf8" />
                <span>Audio Viseme Lip-Sync Gauge</span>
              </div>
              <span style={{ fontSize: '10px', color: '#10b981' }}>Live STT Stream</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(Object.keys(companion.visemeValues) as (keyof CompanionState['visemeValues'])[]).map((vKey) => {
                const val = companion.visemeValues[vKey];
                const percent = Math.round(val * 100);

                return (
                  <div key={vKey} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '24px', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: '#c084fc' }}>
                      [{vKey}]
                    </span>
                    <div style={{ flex: 1, height: '6px', backgroundColor: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${percent}%`,
                          height: '100%',
                          backgroundColor: '#ec4899',
                          transition: 'width 0.1s linear',
                        }}
                      />
                    </div>
                    <span style={{ width: '32px', textAlign: 'right', fontSize: '10px', color: '#94a3b8' }}>
                      {percent}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Photo Mode Presets */}
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={14} color="#ec4899" />
              <span>Photo Mode Presets</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {companion.photoPresets.map((preset) => {
                const isSelected = selectedPhotoPreset === preset;

                return (
                  <button
                    key={preset}
                    onClick={() => setSelectedPhotoPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: isSelected ? 'rgba(236,72,153,0.15)' : '#161b22',
                      border: isSelected ? '1px solid #ec4899' : '1px solid #21262d',
                      borderRadius: '6px',
                      color: isSelected ? '#f472b6' : '#cbd5e1',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{preset}</span>
                    {isSelected && <Check size={14} color="#ec4899" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Floating Desktop Pet Controls */}
          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Heart size={14} color="#ef4444" />
              <span>Floating Desktop Pet Overlays</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { key: 'alwaysOnTop', label: 'Always on Top (OS Pin)' },
                { key: 'dockToTray', label: 'Dock to System Tray' },
                { key: 'wanderingEnabled', label: 'Autonomous Screen Wandering' },
                { key: 'clickThrough', label: 'Click-Through Transparent Window' },
              ].map(({ key, label }) => {
                const k = key as keyof CompanionState['desktopPetSettings'];
                const isChecked = companion.desktopPetSettings[k];

                return (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTogglePetSetting(k)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
