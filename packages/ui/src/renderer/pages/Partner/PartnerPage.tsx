import React, { useState } from 'react';
import {
  Users,
  Plus,
  Bot,
  Sparkles,
  ArrowLeft,
  Search,
  MessageSquare,
  Edit3,
  Trash2,
  Cpu,
  Shield,
  Layers,
  Wrench,
  ChevronRight,
  Heart,
} from 'lucide-react';
import { usePersonas } from '../../hooks/usePersonas';
import { PersonaModal } from './PersonaModal';
import { CompanionPage } from './CompanionPage';
import type { AgentPersona, CapabilityTier } from '../../core/types';

type PartnerTab = 'companion' | 'workforce';

interface PartnerPageProps {
  onBack?: () => void;
  onOpenChatWithPersona?: (personaId: string) => void;
}

const TIER_BADGES: Record<CapabilityTier, { label: string; bg: string; text: string; border: string }> = {
  deep_reasoning: {
    label: 'Tier 1: Reasoning & Code',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/20',
  },
  high_throughput: {
    label: 'Tier 2: Real-Time Radar',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  long_context: {
    label: 'Tier 3: Long Context',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
  local_privacy: {
    label: 'Tier 4: Local Privacy',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  multimodal_media: {
    label: 'Tier 5: Media Diffusion',
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
    border: 'border-pink-500/20',
  },
};

export const PartnerPage: React.FC<PartnerPageProps> = ({ onBack, onOpenChatWithPersona }) => {
  const { personas, loading, savePersona, deletePersona } = usePersonas();
  const [activeTab, setActiveTab] = useState<PartnerTab>('companion');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<AgentPersona | null>(null);

  const filteredPersonas = personas.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.roleTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTier = selectedTier === 'all' || p.capabilityTier === selectedTier;

    return matchesSearch && matchesTier;
  });

  const coordinator = personas.find((p) => p.isCoordinator);

  const handleEdit = (persona: AgentPersona) => {
    setEditingPersona(persona);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setEditingPersona(null);
    setModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the persona "${name}"?`)) {
      await deletePersona(id);
    }
  };

  // ── Tab switcher shell ───────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-950">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-800/60 bg-slate-900/60 flex-shrink-0">
        <button
          onClick={() => setActiveTab('companion')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors cursor-pointer
            ${activeTab === 'companion'
              ? 'border-indigo-500 text-indigo-300 bg-slate-800/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Heart size={13} /> Companion
        </button>
        <button
          onClick={() => setActiveTab('workforce')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors cursor-pointer
            ${activeTab === 'workforce'
              ? 'border-cyan-500 text-cyan-300 bg-slate-800/60'
              : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          <Users size={13} /> Agent Workforce
        </button>
      </div>

      {/* Companion tab — full height */}
      {activeTab === 'companion' && (
        <CompanionPage onBack={onBack} />
      )}

      {/* Workforce tab — existing persona grid */}
      {activeTab === 'workforce' && (
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950/20 overflow-y-auto p-6 md:p-8 select-none">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Go Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">
              <Users size={14} />
              <span>Digital Workforce</span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/40" />
              <span className="text-slate-400 font-normal">{personas.length} Active Personas</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-100 tracking-tight">
              Agent Workforce Studio
            </h1>
          </div>
        </div>

        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus size={16} />
          <span>New Agent Persona</span>
        </button>
      </div>

      {/* Chief of Staff Highlight Banner */}
      {coordinator && (
        <div className="mb-8 rounded-3xl bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 border border-cyan-500/20 p-6 relative overflow-hidden backdrop-blur-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-cyan-500/10">
                {coordinator.avatarEmoji || '👔'}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-wider">
                    Primary Coordinator
                  </span>
                  <span className="text-xs font-mono text-slate-400">@{coordinator.id}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-100 mb-1">{coordinator.name} ({coordinator.roleTitle})</h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">{coordinator.description}</p>
              </div>
            </div>

            <button
              onClick={() => onOpenChatWithPersona?.(coordinator.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-all shrink-0 cursor-pointer"
            >
              <MessageSquare size={14} className="text-cyan-400" />
              <span>Coordinate Tasks</span>
              <ChevronRight size={14} className="text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search personas by name, role, or @handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-slate-200 text-xs focus:outline-none focus:border-cyan-500/60 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedTier('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              selectedTier === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Roles
          </button>
          {Object.entries(TIER_BADGES).map(([tierKey, badge]) => (
            <button
              key={tierKey}
              onClick={() => setSelectedTier(tierKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedTier === tierKey
                  ? 'bg-slate-800 text-slate-100 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {badge.label.split(':')[1]?.trim() || tierKey}
            </button>
          ))}
        </div>
      </div>

      {/* Personas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPersonas.map((persona) => {
          const tierInfo = TIER_BADGES[persona.capabilityTier] || TIER_BADGES.deep_reasoning;

          return (
            <div
              key={persona.id}
              className="rounded-3xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/90 p-5 flex flex-col justify-between backdrop-blur-xl transition-all hover:shadow-xl group relative overflow-hidden"
            >
              <div>
                {/* Top Row: Avatar + Tier + Actions */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-xl shrink-0 shadow-md">
                      {persona.avatarEmoji || '🤖'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 leading-snug">{persona.name}</h3>
                      <span className="text-[11px] font-mono text-cyan-400 font-medium">@{persona.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(persona)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Edit persona"
                    >
                      <Edit3 size={13} />
                    </button>
                    {!persona.isBuiltin && (
                      <button
                        onClick={() => handleDelete(persona.id, persona.name)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete persona"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Role Title & Tier */}
                <div className="mb-3">
                  <div className="text-xs font-semibold text-slate-300 mb-1.5">{persona.roleTitle}</div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold border ${tierInfo.bg} ${tierInfo.text} ${tierInfo.border}`}
                  >
                    {tierInfo.label}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">
                  {persona.description}
                </p>

                {/* Allowed Tools Pills */}
                {persona.allowedTools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {persona.allowedTools.slice(0, 3).map((tool) => (
                      <span
                        key={tool}
                        className="px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300"
                      >
                        {tool}
                      </span>
                    ))}
                    {persona.allowedTools.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
                        +{persona.allowedTools.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Chat Button */}
              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">
                  {persona.modelConfig.provider}/{persona.modelConfig.model_id}
                </span>
                <button
                  onClick={() => onOpenChatWithPersona?.(persona.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <MessageSquare size={13} />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPersonas.length === 0 && !loading && (
        <div className="text-center py-16 bg-slate-900/20 rounded-3xl border border-slate-800/60 p-8">
          <Bot size={36} className="mx-auto text-slate-500 mb-3" />
          <h3 className="text-sm font-bold text-slate-200 mb-1">No Agent Personas Found</h3>
          <p className="text-xs text-slate-400 mb-4">No personas match your search query or filter.</p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20"
          >
            Create New Persona
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      <PersonaModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPersona(null);
        }}
        onSave={savePersona}
        initialPersona={editingPersona}
      />
    </div>
      )}
    </div>
  );
};

export default PartnerPage;
