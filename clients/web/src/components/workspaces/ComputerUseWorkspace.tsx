import React, { useState } from 'react';
import {
  Monitor,
  Crosshair,
  Layers,
  Activity,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  CheckCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  DEMO_WINDOWS,
  DEMO_ACCESSIBILITY_TREE,
  DEMO_MOUSE_TRAJECTORY,
  WindowCard,
  AccessibilityNode,
} from '../../demoData';

export const ComputerUseWorkspace: React.FC = () => {
  const [windows, setWindows] = useState<WindowCard[]>(DEMO_WINDOWS);
  const [selectedPid, setSelectedPid] = useState<number>(14208);
  const [expandedA11yNodes, setExpandedA11yNodes] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    5: true,
    9: true,
  });
  const [selectedA11yIndex, setSelectedA11yIndex] = useState<number>(10);
  const [settlingRemainingMs, setSettlingRemainingMs] = useState<number>(38);

  const selectedWindow = windows.find((w) => w.pid === selectedPid) || windows[0];

  const toggleA11yNode = (idx: number) => {
    setExpandedA11yNodes((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSimulateSettling = () => {
    setSettlingRemainingMs(250);
    const interval = setInterval(() => {
      setSettlingRemainingMs((prev) => {
        if (prev <= 25) {
          clearInterval(interval);
          return 0;
        }
        return prev - 25;
      });
    }, 25);
  };

  const renderA11yNode = (node: AccessibilityNode, depth = 0): React.ReactNode => {
    const isExpanded = !!expandedA11yNodes[node.element_index];
    const isSelected = selectedA11yIndex === node.element_index;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.element_index} style={{ marginLeft: `${depth * 14}px`, marginTop: '3px' }}>
        <div
          onClick={() => setSelectedA11yIndex(node.element_index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '4px',
            backgroundColor: isSelected ? '#1e293b' : 'transparent',
            border: isSelected ? '1px solid #06b6d4' : '1px solid transparent',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {hasChildren ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleA11yNode(node.element_index);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', color: '#94a3b8' }}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          ) : (
            <span style={{ width: '13px' }} />
          )}

          <span
            style={{
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: '#0f172a',
              color: '#06b6d4',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            idx:{node.element_index}
          </span>

          <span style={{ color: '#8b5cf6', fontWeight: 600 }}>{node.role}</span>
          <span style={{ color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{node.name}"
          </span>

          <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>
            [{node.bounds.x},{node.bounds.y} {node.bounds.width}x{node.bounds.height}]
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderA11yNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
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
      {/* Top Header & Settling Telemetry Bar */}
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
          <Monitor size={17} color="#06b6d4" />
          <span style={{ fontWeight: 600 }}>Computer Use Automation Studio</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#06b6d4',
              border: '1px solid #0891b2',
            }}
          >
            Direct3D11 WGC Active
          </span>
        </div>

        {/* Adaptive Settling Countdown Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: settlingRemainingMs > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${settlingRemainingMs > 0 ? '#f59e0b' : '#10b981'}`,
              fontSize: '12px',
            }}
          >
            <Clock size={13} color={settlingRemainingMs > 0 ? '#f59e0b' : '#10b981'} />
            <span style={{ color: settlingRemainingMs > 0 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
              {settlingRemainingMs > 0
                ? `Settling UI: ${settlingRemainingMs}ms remaining`
                : 'Settled & Stable (Delta < 0.1%)'}
            </span>
          </div>

          <button
            onClick={handleSimulateSettling}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            <RefreshCw size={12} /> Retrigger Settling Probe
          </button>
        </div>
      </div>

      {/* Main 3-Column Studio Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Window Picker Cards */}
        <div
          style={{
            width: '320px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
            Available HWND Targets ({windows.length})
          </div>

          {windows.map((win) => {
            const isSelected = win.pid === selectedPid;

            return (
              <div
                key={win.pid}
                onClick={() => setSelectedPid(win.pid)}
                style={{
                  backgroundColor: isSelected ? '#1e293b' : '#111827',
                  border: isSelected ? '1px solid #06b6d4' : '1px solid #1f2937',
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: isSelected ? '#38bdf8' : '#f8fafc' }}>
                    {win.processName}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: win.isOccluded ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                      color: win.isOccluded ? '#ef4444' : '#10b981',
                      border: `1px solid ${win.isOccluded ? '#ef4444' : '#10b981'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {win.isOccluded ? <ShieldAlert size={10} /> : <Eye size={10} />}
                    {win.isOccluded ? 'Occluded (WGC)' : 'Visible Top'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {win.title}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                  <span>PID: {win.pid}</span>
                  <span>HWND: {win.hwnd}</span>
                  <span>{win.geometry.width}x{win.geometry.height}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center Column: WGC Occluded Capture Canvas & Trajectory Visualizer */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#090d16',
            padding: '16px',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* Simulated WGC Occluded Capture Viewport */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Crosshair size={15} color="#06b6d4" />
                <span>WGC Occluded Capture Canvas — {selectedWindow.title}</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                Active Target: {selectedWindow.hwnd} (60 FPS Stream)
              </span>
            </div>

            {/* Virtual Screen Viewport SVG */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '320px',
                backgroundColor: '#020617',
                border: '1px solid #334155',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 800 450" preserveAspectRatio="none">
                {/* Background grid */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="800" height="450" fill="url(#grid)" />

                {/* Window Frame Mockup */}
                <rect x="60" y="40" width="680" height="370" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" rx="6" opacity="0.9" />
                <rect x="60" y="40" width="680" height="32" fill="#1e293b" />
                <circle cx="80" cy="56" r="5" fill="#ef4444" />
                <circle cx="96" cy="56" r="5" fill="#f59e0b" />
                <circle cx="112" cy="56" r="5" fill="#10b981" />
                <text x="130" y="60" fill="#94a3b8" fontSize="12" fontFamily="sans-serif">
                  {selectedWindow.title}
                </text>

                {/* Targeted UI Element Bounding Box (element_index: 10) */}
                <rect x="280" y="160" width="160" height="120" fill="rgba(6, 182, 212, 0.15)" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4 2" />
                <text x="286" y="180" fill="#06b6d4" fontSize="11" fontWeight="bold">
                  element_index: 10 [U1 Microcontroller]
                </text>

                {/* Humanized Bézier Curve trajectory overlay */}
                <path
                  d="M 120 90 C 200 60, 240 220, 360 220"
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="3"
                />

                {/* Control Points & Waypoints */}
                <circle cx="120" cy="90" r="5" fill="#10b981" />
                <circle cx="200" cy="60" r="3" fill="#ec4899" opacity="0.6" />
                <circle cx="240" cy="220" r="3" fill="#ec4899" opacity="0.6" />
                <circle cx="360" cy="220" r="6" fill="#f59e0b" />

                {/* Cursor target icon */}
                <polygon points="360,220 372,238 366,238 370,248 365,250 361,240 354,244" fill="#ffffff" stroke="#000000" strokeWidth="1" />
              </svg>

              {/* Occlusion Warning Pill if occluded */}
              {selectedWindow.isOccluded && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    backgroundColor: 'rgba(239,68,68,0.9)',
                    color: '#ffffff',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
                  Window is behind other apps (WGC Occluded Capture active)
                </div>
              )}
            </div>
          </div>

          {/* Mouse Trajectory Bézier Velocity Visualizer */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Activity size={15} color="#ec4899" />
                <span>Mouse Trajectory Bézier Velocity Profile</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Total Duration: {DEMO_MOUSE_TRAJECTORY.totalDurationMs}ms (Fitts Law Compliant)
              </span>
            </div>

            {/* Velocity Waveform Bars */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: '70px',
                gap: '8px',
                backgroundColor: '#090d16',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
              }}
            >
              {DEMO_MOUSE_TRAJECTORY.samples.map((pt, idx) => {
                const maxVel = 1200;
                const heightPercent = Math.max(10, Math.min(100, (pt.velocityPxPerSec / maxVel) * 100));

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        backgroundColor: '#ec4899',
                        borderRadius: '3px 3px 0 0',
                        opacity: 0.85,
                      }}
                      title={`t=${pt.t}: ${pt.velocityPxPerSec} px/sec`}
                    />
                    <span style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>
                      {pt.velocityPxPerSec}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Accessibility Tree Inspector */}
        <div
          style={{
            width: '380px',
            borderLeft: '1px solid #1e293b',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Live Accessibility Tree
            </div>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
              }}
            >
              Selected Index: {selectedA11yIndex}
            </span>
          </div>

          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '10px',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {renderA11yNode(DEMO_ACCESSIBILITY_TREE)}
          </div>
        </div>
      </div>
    </div>
  );
};
