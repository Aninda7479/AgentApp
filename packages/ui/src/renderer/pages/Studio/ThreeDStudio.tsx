import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Cpu,
  Settings,
  ArrowLeft,
  Sparkles,
  FolderOpen,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import type { PartnerController } from '../../logic/agentStream';
import { getIpc } from '../../lib/ipc';

import {
  ThreeDModelInfo,
  ThreeDModality,
  ThreeDOutputFormat,
  ThreeDHardwareProfile,
  ThreeDEngineStatus,
  ThreeDGenerationRecord,
  ThreeDProgressEvent,
  getThreeDHardwareProfile,
  getThreeDEngineStatus,
  listThreeDModels,
  generateThreeDStream,
  listThreeDGenerations,
  deleteThreeDGeneration,
  getThreeDModelFileUrl,
} from '../../services/threeDService';

import { StudioComposer } from './components/StudioComposer';
import { ThreeDViewport } from './components/ThreeDViewport';
import { SceneInspector } from './components/SceneInspector';
import { StudioFilmstrip } from './components/StudioFilmstrip';
import {
  CameraMode,
  EnvironmentPreset,
  MeshStats,
  SceneNodeInfo,
  ShadingMode,
  TransformState,
} from './components/types';

export interface ThreeDStudioProps {
  partners?: PartnerController;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

export const ThreeDStudio: React.FC<ThreeDStudioProps> = ({
  partners,
  triggerToast,
  onBack,
  onOpenSettings,
}) => {
  const notify = (msg: string, type: 'info' | 'error' = 'info') => {
    if (triggerToast) triggerToast(msg, type);
  };

  // ── Generation & Composer State ──
  const [prompt, setPrompt] = useState('Cyberpunk neon city street with high-tech towers and road grid');
  const [modality, setModality] = useState<ThreeDModality>('world_gen');
  const [selectedModel, setSelectedModel] = useState<string>('procedural-world-v1');
  const [outputFormat, setOutputFormat] = useState<ThreeDOutputFormat>('glb');
  const [conceptImage, setConceptImage] = useState<string | null>(null);

  // ── System & Catalog State ──
  const [models, setModels] = useState<ThreeDModelInfo[]>([]);
  const [hardware, setHardware] = useState<ThreeDHardwareProfile | null>(null);
  const [engineStatus, setEngineStatus] = useState<ThreeDEngineStatus | null>(null);

  // ── Execution State ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ThreeDProgressEvent | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── History & Viewport State ──
  const [generations, setGenerations] = useState<ThreeDGenerationRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<ThreeDGenerationRecord | null>(null);
  const [activeModelUrl, setActiveModelUrl] = useState<string | null>(null);

  // ── Viewport Controls ──
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [shadingMode, setShadingMode] = useState<ShadingMode>('textured');
  const [environmentPreset, setEnvironmentPreset] = useState<EnvironmentPreset>('cyberpunk');
  const [showGrid, setShowGrid] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  // ── Transforms & Scene Inspector ──
  const [modelPosition, setModelPosition] = useState<TransformState>({ x: 0, y: 0, z: 0 });
  const [modelRotation, setModelRotation] = useState<TransformState>({ x: 0, y: 0, z: 0 });
  const [modelScale, setModelScale] = useState<TransformState>({ x: 1, y: 1, z: 1 });
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [sceneNodes, setSceneNodes] = useState<SceneNodeInfo[]>([]);

  const ipc = getIpc();

  // ── Load Catalog, System, and History ──
  const loadData = useCallback(async () => {
    try {
      const [modelsList, hw, status, recs] = await Promise.all([
        listThreeDModels(),
        getThreeDHardwareProfile(),
        getThreeDEngineStatus(),
        listThreeDGenerations(),
      ]);

      setModels(modelsList);
      setHardware(hw);
      setEngineStatus(status);
      setGenerations(recs);

      if (modelsList.length > 0 && !selectedModel) {
        setSelectedModel(modelsList[0].id);
      }

      if (recs.length > 0 && !activeModelUrl) {
        setActiveRecord(recs[0]);
        setActiveModelUrl(getThreeDModelFileUrl(recs[0].id));
      }
    } catch (err) {
      console.error('Failed to load 3D workspace data:', err);
    }
  }, [selectedModel, activeModelUrl]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Handle Generation Execution ──
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      notify('Please enter a description or prompt.', 'error');
      return;
    }

    setIsGenerating(true);
    setProgress({
      step: 1,
      total_steps: 4,
      stage: 'init',
      percentage: 15,
      message: 'Initializing 3D spatial generation pipeline...',
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const resp = await generateThreeDStream(
        {
          prompt: prompt.trim(),
          model_id: selectedModel,
          modality,
          output_format: outputFormat,
          init_image: conceptImage || undefined,
        },
        (p) => {
          setProgress(p);
        },
        abortController.signal
      );

      notify('3D spatial scene generated successfully!');
      setActiveModelUrl(resp.model_url);

      // Refresh history
      const updatedRecs = await listThreeDGenerations();
      setGenerations(updatedRecs);
      if (updatedRecs.length > 0) {
        setActiveRecord(updatedRecs[0]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Generation failed: ${msg}`, 'error');
    } finally {
      setIsGenerating(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  // ── Pick Reference Concept Image ──
  const handlePickImage = async () => {
    if (!ipc) {
      notify('Image picker is available in the desktop app.', 'error');
      return;
    }
    try {
      const res = (await ipc.invoke('pick-image-file')) as { path?: string | null };
      if (res?.path) {
        setConceptImage(res.path);
        notify('Reference concept image loaded.');
      }
    } catch {
      notify('Could not open image picker.', 'error');
    }
  };

  // ── Select Previous Generation from Filmstrip ──
  const handleSelectGeneration = (rec: ThreeDGenerationRecord) => {
    setActiveRecord(rec);
    setActiveModelUrl(getThreeDModelFileUrl(rec.id));
    setPrompt(rec.prompt);
    setOutputFormat(rec.format);
    notify(`Loaded "${rec.prompt.slice(0, 30)}..."`);
  };

  // ── Delete Generation Record ──
  const handleDeleteGeneration = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this 3D generation permanently?')) return;
    try {
      await deleteThreeDGeneration(id);
      notify('3D asset deleted.');
      const updated = generations.filter((g) => g.id !== id);
      setGenerations(updated);
      if (activeRecord?.id === id) {
        if (updated.length > 0) {
          handleSelectGeneration(updated[0]);
        } else {
          setActiveRecord(null);
          setActiveModelUrl(null);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(`Failed to delete: ${msg}`, 'error');
    }
  };

  // ── Import into Companion Pet Window ──
  const handleImportToPet = async () => {
    if (!activeModelUrl) {
      notify('Generate or select a 3D model first.', 'error');
      return;
    }
    if (!partners) {
      notify('Companion partner system is unavailable.', 'error');
      return;
    }
    const activeId = partners.activeId;
    if (!activeId) {
      notify('No active Partner companion to attach to.', 'info');
      return;
    }
    try {
      await partners.importModel(activeId, activeModelUrl);
      partners.setActive(activeId);
      await partners.startPet();
      notify('3D model imported into Desktop Companion window!');
    } catch {
      notify('Could not attach the model to active partner.', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--brand-bg)] text-white select-none relative overflow-hidden font-sans">
      {/* ── Top Header Navbar ── */}
      <header className="h-14 w-full flex items-center justify-between border-b border-[var(--brand-border)]/80 px-6 bg-[var(--brand-bg)] shrink-0 z-20">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Box size={16} className="text-white" />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
              SuperAgent 3D & Spatial Studio
            </span>
            <span className="text-[10px] text-slate-400 font-medium truncate max-w-xs">
              {activeRecord?.prompt || 'Procedural Spatial World Kernel'}
            </span>
          </div>
        </div>

        {/* Center Hardware & Engine Status Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-slate-200">
            {hardware?.gpu_name || 'Spatial Engine Ready'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {hardware?.backend ? `[${hardware.backend.toUpperCase()}]` : '[VULKAN]'}
          </span>
        </div>

        {/* Right Settings & Refresh Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={14} />
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings size={13} className="text-sky-400" />
              <span>3D Settings</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Studio Split View (Composer | Viewport | Inspector) ── */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        {/* Left Panel: Spatial Prompt & Parameter Composer */}
        <StudioComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          modality={modality}
          onModalityChange={setModality}
          selectedModel={selectedModel}
          onSelectedModelChange={setSelectedModel}
          models={models}
          outputFormat={outputFormat}
          onOutputFormatChange={setOutputFormat}
          conceptImage={conceptImage}
          onPickImage={handlePickImage}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          progress={progress}
          triggerToast={triggerToast}
        />

        {/* Center: Real Three.js Viewport Stage */}
        <ThreeDViewport
          modelUrl={activeModelUrl}
          modelFormat={activeRecord?.format || outputFormat}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          shadingMode={shadingMode}
          onShadingModeChange={setShadingMode}
          environmentPreset={environmentPreset}
          onEnvironmentPresetChange={setEnvironmentPreset}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          showShadows={showShadows}
          onShowShadowsChange={setShowShadows}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
          modelPosition={modelPosition}
          modelRotation={modelRotation}
          modelScale={modelScale}
          onStatsLoaded={setStats}
          onSceneHierarchyLoaded={setSceneNodes}
          triggerToast={triggerToast}
        />

        {/* Right Panel: Scene Hierarchy & Material Inspector */}
        <SceneInspector
          stats={stats}
          sceneNodes={sceneNodes}
          modelPosition={modelPosition}
          onModelPositionChange={setModelPosition}
          modelRotation={modelRotation}
          onModelRotationChange={setModelRotation}
          modelScale={modelScale}
          onModelScaleChange={setModelScale}
          activeModelUrl={activeModelUrl}
          activeModelName={activeRecord?.prompt || '3D Scene Asset'}
          onImportToPet={handleImportToPet}
          triggerToast={triggerToast}
        />
      </div>

      {/* ── Bottom Filmstrip Gallery ── */}
      <StudioFilmstrip
        generations={generations}
        activeId={activeRecord?.id || null}
        onSelect={handleSelectGeneration}
        onDelete={handleDeleteGeneration}
      />
    </div>
  );
};

export default ThreeDStudio;
