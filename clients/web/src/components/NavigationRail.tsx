import React from 'react';
import {
  MessageSquare,
  Monitor,
  Globe,
  Code,
  Shield,
  Sparkles,
  Palette,
  Cpu,
  CheckSquare,
  Settings,
  Lock,
  LucideIcon,
} from 'lucide-react';
import { ConnectionState } from '../client';

export type WorkspaceId =
  | 'chat'
  | 'computer-use'
  | 'browser'
  | 'repl'
  | 'security'
  | 'companion'
  | 'creative'
  | 'hardware'
  | 'tasks'
  | 'settings';

export interface WorkspaceNavItem {
  id: WorkspaceId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  badge?: string;
  accentColor: string;
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: 'chat',
    label: 'Chat & Trajectory',
    shortLabel: 'Chat',
    icon: MessageSquare,
    accentColor: '#1f6feb',
  },
  {
    id: 'computer-use',
    label: 'Computer Use & Automation',
    shortLabel: 'Computer',
    icon: Monitor,
    badge: 'WGC',
    accentColor: '#06b6d4',
  },
  {
    id: 'browser',
    label: 'Browser Leasing & WebMCP',
    shortLabel: 'Browser',
    icon: Globe,
    badge: 'CDP',
    accentColor: '#3fb950',
  },
  {
    id: 'repl',
    label: 'Execution REPL Console',
    shortLabel: 'REPL',
    icon: Code,
    badge: '25k',
    accentColor: '#8b5cf6',
  },
  {
    id: 'security',
    label: '4-Tier Security Guardian',
    shortLabel: 'Security',
    icon: Shield,
    badge: 'zo-16',
    accentColor: '#f85149',
  },
  {
    id: 'companion',
    label: '3D VRM Companion Studio',
    shortLabel: 'Companion',
    icon: Sparkles,
    accentColor: '#d29922',
  },
  {
    id: 'creative',
    label: 'Creative Studio Canvas',
    shortLabel: 'Creative',
    icon: Palette,
    badge: 'FLUX',
    accentColor: '#ec4899',
  },
  {
    id: 'hardware',
    label: 'PCB & Hardware ECAD',
    shortLabel: 'Hardware',
    icon: Cpu,
    badge: 'KiCad',
    accentColor: '#10b981',
  },
  {
    id: 'tasks',
    label: 'Tasks & Scheduled Routines',
    shortLabel: 'Tasks',
    icon: CheckSquare,
    badge: '4 Col',
    accentColor: '#58a6ff',
  },
  {
    id: 'settings',
    label: '24-Module Settings Matrix',
    shortLabel: 'Settings',
    icon: Settings,
    accentColor: '#8b949e',
  },
];

interface NavigationRailProps {
  activeWorkspace: WorkspaceId;
  onSelectWorkspace: (id: WorkspaceId) => void;
  connState: ConnectionState;
  onOpenLockScreen?: () => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  connState,
  onOpenLockScreen,
}) => {
  return (
    <nav
      style={{
        width: '72px',
        backgroundColor: '#090d16',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0 16px',
        gap: '6px',
        userSelect: 'none',
        zIndex: 20,
      }}
      aria-label="SuperAgent Workspace Navigation"
    >
      {/* Brand Icon */}
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #1f6feb 0%, #8b5cf6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '16px',
          color: '#ffffff',
          marginBottom: '8px',
          boxShadow: '0 4px 12px rgba(31, 111, 235, 0.3)',
          cursor: 'pointer',
        }}
        onClick={() => onSelectWorkspace('chat')}
        title="SuperAgent Monorepo Core"
      >
        SA
      </div>

      {/* Workspace Icons List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flex: 1,
          width: '100%',
          alignItems: 'center',
        }}
      >
        {WORKSPACE_NAV_ITEMS.map((item) => {
          const isActive = activeWorkspace === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectWorkspace(item.id)}
              title={item.label}
              style={{
                position: 'relative',
                width: '52px',
                height: '46px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? '#1e293b' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                color: isActive ? '#f8fafc' : '#94a3b8',
                transition: 'all 0.15s ease-in-out',
                outline: 'none',
              }}
            >
              {/* Left active glowing indicator bar */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: '-10px',
                    top: '8px',
                    bottom: '8px',
                    width: '3px',
                    borderRadius: '0 4px 4px 0',
                    backgroundColor: item.accentColor,
                    boxShadow: `0 0 8px ${item.accentColor}`,
                  }}
                />
              )}

              <Icon size={19} color={isActive ? item.accentColor : '#94a3b8'} />
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: isActive ? 600 : 500,
                  marginTop: '3px',
                  letterSpacing: '0.02em',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  maxWidth: '52px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.shortLabel}
              </span>

              {/* Mini Badge if present */}
              {item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '3px',
                    fontSize: '8px',
                    lineHeight: '10px',
                    padding: '1px 3px',
                    borderRadius: '4px',
                    backgroundColor: isActive ? item.accentColor : '#334155',
                    color: '#ffffff',
                    fontWeight: 700,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom controls: Lock Screen and Connection Status */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          paddingTop: '8px',
          borderTop: '1px solid #1e293b',
          width: '100%',
        }}
      >
        <button
          onClick={onOpenLockScreen}
          title="CUALockScreenGuardian (Lock OS Controls)"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '6px',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Lock size={16} />
        </button>

        {/* Live Network Ping Dot */}
        <div
          title={`Core Daemon: ${connState}`}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor:
              connState === 'connected'
                ? '#10b981'
                : connState === 'connecting'
                ? '#f59e0b'
                : '#ef4444',
            boxShadow:
              connState === 'connected'
                ? '0 0 6px #10b981'
                : 'none',
          }}
        />

        <span style={{ fontSize: '9px', color: '#64748b' }}>v0.44</span>
      </div>
    </nav>
  );
};
