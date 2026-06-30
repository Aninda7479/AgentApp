import React, { useState } from 'react';

export interface PluginsViewProps {
  onInstallPlugin: (pluginId: string) => void;
  onTryPlugin: (pluginId: string) => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}

interface PluginCard {
  id: string;
  icon: string;
  iconBg?: string;
  title: string;
  description: string;
  status: 'available' | 'installed';
}

interface SkillCard {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: string;
  iconBg: string;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  onInstallPlugin,
  onTryPlugin,
  onToggleSkill
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'plugins' | 'skills'>('plugins');
  const [pluginSearchQuery, setPluginSearchQuery] = useState('');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'openai' | 'workspace' | 'personal'>('openai');
  const [activeSkillFilter, setActiveSkillFilter] = useState<'GlacierPharma' | 'System' | 'Recommended'>('GlacierPharma');

  const plugins: PluginCard[] = [
    {
      id: 'p1',
      icon: '🌌',
      title: 'Computer Use',
      description: 'Control Windows apps from Codex',
      status: 'available'
    },
    {
      id: 'p2',
      icon: '🌐',
      title: 'Chrome',
      description: 'Control Chrome with Codex',
      status: 'available'
    },
    {
      id: 'p3',
      icon: '📊',
      title: 'Spreadsheets',
      description: 'Create and edit sheets directly in your workspace.',
      status: 'installed'
    },
    {
      id: 'p4',
      icon: '📽️',
      title: 'Presentations',
      description: 'Create and edit slides with generative agent voice.',
      status: 'installed'
    }
  ];

  // Dynamic stateful skills grid matching Image 1
  const [skillsList, setSkillsList] = useState<SkillCard[]>([
    {
      id: 's1',
      name: 'Graphify',
      description: 'Use for any question about a codebase, index file hierarchies, and trace dependency maps.',
      enabled: true,
      icon: '📦',
      iconBg: '#2d1f3d'
    },
    {
      id: 's2',
      name: 'Image Gen',
      description: 'Generate or edit images for websites, mockups, design patterns, and visual assets.',
      enabled: true,
      icon: '🖼️',
      iconBg: '#1f2e3d'
    },
    {
      id: 's3',
      name: 'OpenAI Docs',
      description: 'Reference OpenAI docs, Codex self-documentation, and API references.',
      enabled: true,
      icon: '📖',
      iconBg: '#1f3d2e'
    },
    {
      id: 's4',
      name: 'Plugin Creator',
      description: 'Scaffold plugins and marketplace entries for various integration protocols.',
      enabled: true,
      icon: '✏️',
      iconBg: '#3f1f1d'
    },
    {
      id: 's5',
      name: 'Skill Creator',
      description: 'Create or update a skill, writing new manifests and command pipelines.',
      enabled: true,
      icon: '🛠️',
      iconBg: '#3d341f'
    },
    {
      id: 's6',
      name: 'Skill Installer',
      description: 'Install curated skills from openai/skills repository or remote hosts.',
      enabled: true,
      icon: '🧩',
      iconBg: '#1f3d3d'
    }
  ]);

  const handleToggleSkill = (id: string) => {
    setSkillsList(prev => prev.map(s => {
      if (s.id === id) {
        const nextState = !s.enabled;
        onToggleSkill(id, nextState);
        return { ...s, enabled: nextState };
      }
      return s;
    }));
  };

  const filteredPlugins = plugins.filter(p =>
    p.title.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(pluginSearchQuery.toLowerCase())
  );

  const filteredSkills = skillsList.filter(s =>
    s.name.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(skillSearchQuery.toLowerCase())
  );

  return (
    <div
      data-testid="plugins-container"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#141110',
        color: '#ececec',
        overflow: 'hidden',
        height: '100%',
        width: '100%',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}
    >
      {/* Top Header Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #231c1a'
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            data-testid="subtab-plugins"
            onClick={() => setActiveSubTab('plugins')}
            style={{
              backgroundColor: activeSubTab === 'plugins' ? '#2e2220' : 'transparent',
              border: 'none',
              color: activeSubTab === 'plugins' ? '#ffffff' : '#8a8a8a',
              padding: '6px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500
            }}
          >
            Plugins
          </button>
          <button
            data-testid="subtab-skills"
            onClick={() => setActiveSubTab('skills')}
            style={{
              backgroundColor: activeSubTab === 'skills' ? '#2e2220' : 'transparent',
              border: 'none',
              color: activeSubTab === 'skills' ? '#ffffff' : '#8a8a8a',
              padding: '6px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500
            }}
          >
            Skills
          </button>
        </div>

        {/* Right side header icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '1.1rem' }}>🔄</button>
          <button style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '1.1rem' }}>⚙️</button>
          <button
            style={{
              backgroundColor: '#2e2220',
              border: '1px solid #3d302e',
              color: '#ececec',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            + <span style={{ fontSize: '0.7rem' }}>▼</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}>
        {activeSubTab === 'plugins' ? (
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '2.2rem', fontFamily: "'Outfit', sans-serif", fontWeight: 600, marginBottom: '8px' }}>
              Plugins
            </h1>
            <p style={{ color: '#8a8a8a', fontSize: '0.95rem', marginBottom: '24px' }}>
              Work with Codex across your favorite tools
            </p>

            {/* Plugin Search Bar */}
            <div
              style={{
                backgroundColor: '#1e1816',
                border: '1px solid #2e2220',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                marginBottom: '24px'
              }}
            >
              <span style={{ color: '#8a8a8a', marginRight: '8px' }}>🔍</span>
              <input
                data-testid="plugin-search-input"
                type="text"
                placeholder="Search plugins"
                value={pluginSearchQuery}
                onChange={(e) => setPluginSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  flex: 1
                }}
              />
            </div>

            {/* Installed Plugins Icon Row */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ececec' }}>Installed</span>
                <span style={{ fontSize: '0.85rem', color: '#8a8a8a', cursor: 'pointer' }}>⚙️</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
                {/* Simulated App Icons */}
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📄</div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📕</div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📊</div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📽️</div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>💿</div>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🖱️</div>
              </div>

              {/* Filter Chips Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #231c1a', paddingTop: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedFilter('openai')}
                    style={{
                      backgroundColor: selectedFilter === 'openai' ? '#2e2220' : '#1b1412',
                      border: '1px solid #2e2220',
                      color: selectedFilter === 'openai' ? '#ffffff' : '#8a8a8a',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    By OpenAI
                  </button>
                  <button
                    onClick={() => setSelectedFilter('workspace')}
                    style={{
                      backgroundColor: selectedFilter === 'workspace' ? '#2e2220' : '#1b1412',
                      border: '1px solid #2e2220',
                      color: selectedFilter === 'workspace' ? '#ffffff' : '#8a8a8a',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    By your workspace
                  </button>
                  <button
                    onClick={() => setSelectedFilter('personal')}
                    style={{
                      backgroundColor: selectedFilter === 'personal' ? '#2e2220' : '#1b1412',
                      border: '1px solid #2e2220',
                      color: selectedFilter === 'personal' ? '#ffffff' : '#8a8a8a',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Personal
                  </button>
                </div>
                <button style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '0.9rem' }}>☰</button>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ececec', marginBottom: '16px' }}>
              Featured
            </h3>

            {/* Featured Plugin Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
              {filteredPlugins.map(p => (
                <div
                  key={p.id}
                  data-testid={`plugin-card-${p.id}`}
                  style={{
                    backgroundColor: '#1b1412',
                    border: '1px solid #2e2220',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      backgroundColor: '#261c1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.8rem',
                      flexShrink: 0
                    }}
                  >
                    {p.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#ffffff' }}>{p.title}</span>
                      {p.status === 'installed' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            data-testid={`btn-try-${p.id}`}
                            onClick={() => onTryPlugin(p.id)}
                            style={{
                              backgroundColor: '#2e2220',
                              border: '1px solid #3d302e',
                              color: '#ffffff',
                              padding: '4px 12px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            Try in chat
                          </button>
                          <button style={{ background: 'none', border: 'none', color: '#8a8a8a', cursor: 'pointer', fontSize: '0.85rem' }}>···</button>
                        </div>
                      ) : (
                        <button
                          data-testid={`btn-install-${p.id}`}
                          onClick={() => onInstallPlugin(p.id)}
                          style={{
                            backgroundColor: '#2e2220',
                            border: '1px solid #3d302e',
                            color: '#ffffff',
                            padding: '4px 16px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                          }}
                        >
                          Install
                        </button>
                      )}
                    </div>
                    <p style={{ color: '#8a8a8a', fontSize: '0.85rem', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '2.2rem', fontFamily: "'Outfit', sans-serif", fontWeight: 600, marginBottom: '8px' }}>
              Skills
            </h1>
            <p style={{ color: '#8a8a8a', fontSize: '0.95rem', marginBottom: '24px' }}>
              Extend Codex's capabilities with task-specific skills
            </p>

            {/* Skills Search bar */}
            <div
              style={{
                backgroundColor: '#1e1816',
                border: '1px solid #2e2220',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                marginBottom: '24px'
              }}
            >
              <span style={{ color: '#8a8a8a', marginRight: '8px' }}>🔍</span>
              <input
                data-testid="skill-search-input"
                type="text"
                placeholder="Search skills"
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  flex: 1
                }}
              />
            </div>

            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ececec', marginBottom: '14px' }}>Installed</div>

            {/* Grid of skills matching Image 1 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                gap: '16px',
                marginBottom: '32px'
              }}
            >
              {filteredSkills.map(s => (
                <div
                  key={s.id}
                  data-testid={`skill-card-${s.id}`}
                  onClick={() => handleToggleSkill(s.id)}
                  style={{
                    backgroundColor: '#1b1412',
                    border: s.enabled ? '1px solid #3b82f6' : '1px solid #2e2220',
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    {/* Skill Icon */}
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: s.iconBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.4rem',
                        flexShrink: 0
                      }}
                    >
                      {s.icon}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#ffffff', marginBottom: '4px' }}>
                        {s.name}
                      </div>
                      <div
                        style={{
                          color: '#8a8a8a',
                          fontSize: '0.82rem',
                          lineHeight: '1.4',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {s.description}
                      </div>
                    </div>
                  </div>

                  {/* Stateful checkmark on the right */}
                  <div style={{ paddingLeft: '12px' }}>
                    <span
                      data-testid={`skill-check-${s.id}`}
                      style={{
                        fontSize: '1.1rem',
                        color: s.enabled ? '#3b82f6' : '#2e2220',
                        fontWeight: 'bold',
                        transition: 'color 0.15s ease'
                      }}
                    >
                      ✓
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Filter Tags matching Image 1 */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                borderTop: '1px solid #231c1a',
                paddingTop: '20px'
              }}
            >
              {(['GlacierPharma', 'System', 'Recommended'] as const).map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveSkillFilter(tag)}
                  style={{
                    backgroundColor: activeSkillFilter === tag ? '#2e2220' : '#1b1412',
                    border: '1px solid #2e2220',
                    color: activeSkillFilter === tag ? '#ffffff' : '#8a8a8a',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: activeSkillFilter === tag ? 500 : 400
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
