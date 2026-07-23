import React, { useState, useEffect } from 'react';
import { Box, Eye, Smile, ShieldCheck, Sparkles, Printer, Factory, Gamepad2, Wand2 } from 'lucide-react';
import type { PartnerController } from '../../logic/agentStream';
import { getIpc } from '../../lib/electron';

import { StageNavigation } from './components/StageNavigation';
import { ActionPanel } from './components/ActionPanel';
import { ThreeDViewport } from './components/ThreeDViewport';
import { RightSidebar } from './components/RightSidebar';
import { GeneratedModel, SavedModel, TransformState } from './components/types';

interface ThreeDStudioProps {
  partners: PartnerController;
  triggerToast: (message: string, type?: 'info' | 'error') => void;
}

export const ThreeDStudio: React.FC<ThreeDStudioProps> = ({ partners, triggerToast }) => {
  // Dual-Persona UX Mode: Kid vs Pro
  const [studioMode, setStudioMode] = useState<'kid' | 'pro'>('kid');
  const [targetOutput, setTargetOutput] = useState<'game_animation' | '3d_printing' | 'factory_manufacturing'>('game_animation');

  // Navigation & Active States
  const [activeStage, setActiveStage] = useState(1);
  const [name, setName] = useState('Luna');
  const [prompt, setPrompt] = useState('A cute chibi-style superhero kid with a cape.');
  const [conceptImage, setConceptImage] = useState<string | null>(null);
  const [conceptPreview, setConceptPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedModel | null>(null);

  // Tab selections
  const [conceptTab, setConceptTab] = useState<'text' | 'image'>('text');
  const [rightSidebarTab, setRightSidebarTab] = useState<'library' | 'scene' | 'transform' | 'material'>('library');
  const [selectedPresetId, setSelectedPresetId] = useState('preset-1');

  // Input states
  const [stylization, setStylization] = useState('Chibi');
  const [aPose, setAPose] = useState(true);
  const [geometrySource, setGeometrySource] = useState('Concept Design');
  const [uploadMode, setUploadMode] = useState<'single' | 'multiple'>('single');
  const [modelType, setModelType] = useState('3D Generation - V3.1');
  const [faceCount, setFaceCount] = useState<'1.5M' | '1M' | '500k' | '50k'>('500k');

  // Viewport states
  const [shadingMode, setShadingMode] = useState<'clay' | 'flat' | 'textured'>('flat');
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [animationPreset, setAnimationPreset] = useState<'idle' | 'walk' | 'wave' | 'dance'>('idle');
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Model management list
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);

  // Scene Hierarchy visible items
  const [visibleNodes, setVisibleNodes] = useState<Record<string, boolean>>({
    head_mesh: true,
    torso_mesh: true,
    skirt_mesh: true,
    hair_clumps: true,
    arm_joints_L: true,
    arm_joints_R: true,
    leg_joints_L: true,
    leg_joints_R: true
  });

  // Transform states
  const [modelPosition, setModelPosition] = useState<TransformState>({ x: 0, y: 0, z: 0 });
  const [modelRotation, setModelRotation] = useState<TransformState>({ x: 0, y: 0, z: 0 });
  const [modelScale, setModelScale] = useState<TransformState>({ x: 1, y: 1, z: 1 });

  // Material Editor states
  const [materialColor, setMaterialColor] = useState('#f1c40f');
  const [materialRoughness, setMaterialRoughness] = useState(0.5);
  const [materialMetalness, setMaterialMetalness] = useState(0.1);

  const ipc = getIpc();

  // Load settings & check active config & list models
  useEffect(() => {
    loadSavedModels();

    if (ipc) {
      ipc.invoke('settings-read').then((cfg: any) => {
        const threeD = cfg?.threeD || {};
        if (threeD.studioPersona) {
          setStudioMode(threeD.studioPersona === 'pro' ? 'pro' : 'kid');
        }
        if (threeD.enabled && threeD.provider) {
          triggerToast(`3D Studio Engine active: ${threeD.provider}`, 'info');
        }
      }).catch(() => {});
    }
  }, [ipc]);

  const loadSavedModels = async () => {
    if (ipc) {
      try {
        const list = await ipc.invoke('three-d-list-models');
        setSavedModels(list || []);
      } catch (err) {
        console.error('Failed to load saved models', err);
      }
    } else {
      setSavedModels([
        { name: 'mock-chibi-princess', path: 'mock/path/princess.glb', format: 'glb', size: 1048576, modified: Date.now() - 3600000 },
        { name: 'mock-cyberpunk-runner', path: 'mock/path/runner.glb', format: 'glb', size: 2048576, modified: Date.now() - 86400000 }
      ]);
    }
  };

  const handlePickImage = async () => {
    if (!ipc) {
      triggerToast('Image picker is only available in the desktop app.', 'error');
      return;
    }
    try {
      const res = (await ipc.invoke('pick-image-file')) as { path?: string | null };
      if (res?.path) {
        setConceptImage(res.path);
        setConceptPreview(`file:///${res.path.replace(/\\/g, '/')}`);
        triggerToast('Concept image loaded successfully.');
      }
    } catch {
      triggerToast('Could not open image picker.', 'error');
    }
  };

  const handleGenerate = async () => {
    if (!ipc) {
      setGenerating(true);
      setTimeout(() => {
        setGenerating(false);
        const demoResult = {
          ok: true,
          path: 'offline_mock_gltf.gltf',
          format: 'gltf',
          provider: 'local',
          message: 'Preview model ready (web mode).'
        };
        setResult(demoResult);
        triggerToast('Preview model ready (web mode).', 'info');
        setActiveStage(8);
        loadSavedModels();
      }, 2000);
      return;
    }
    if (!name.trim()) {
      triggerToast('Please provide an asset name.', 'error');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = (await ipc.invoke('three-d-generate', {
        name: name.trim(),
        prompt: prompt.trim() || undefined,
        imagePath: conceptImage || undefined,
        targetOutput,
        studioMode
      })) as GeneratedModel;

      setResult(res);

      if (res.disabled) {
        triggerToast('3D Model Gen is disabled in Settings.', 'info');
        setActiveStage(1);
      } else if (res.ok && res.path) {
        triggerToast('3D asset successfully generated & ready!', 'info');
        setActiveStage(8);
        loadSavedModels();
      } else if (res.message) {
        triggerToast(res.message, 'info');
      }
    } catch (e: any) {
      triggerToast(`3D generation failed: ${e?.message ?? e}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleImportToPet = async (modelPath?: string) => {
    const importPath = modelPath || result?.path;
    if (!importPath) {
      triggerToast('Select or generate an asset first.', 'error');
      return;
    }
    const activeId = partners.activeId;
    if (!activeId) {
      triggerToast('No active Partner to attach the model.', 'info');
      return;
    }
    try {
      await partners.importModel(activeId, importPath);
      partners.setActive(activeId);
      await partners.startPet();
      triggerToast(`3D asset imported into pet desktop window!`, 'info');
    } catch {
      triggerToast('Could not attach the model to the active Partner.', 'error');
    }
  };

  const handleDeleteModel = async (modelPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this model?')) return;
    if (ipc) {
      try {
        const res = await ipc.invoke('three-d-delete-model', { filePath: modelPath });
        if (res.ok) {
          triggerToast('Model deleted successfully.');
          loadSavedModels();
          if (result?.path === modelPath) {
            setResult(null);
          }
        } else {
          triggerToast(res.message || 'Failed to delete model.', 'error');
        }
      } catch (err: any) {
        triggerToast(err.message || 'Error occurred during deletion.', 'error');
      }
    } else {
      setSavedModels(savedModels.filter(m => m.path !== modelPath));
      triggerToast('Mock model deleted (web mode).');
    }
  };

  const handleImportExternalModel = async () => {
    if (ipc) {
      try {
        const res = await ipc.invoke('three-d-import-external-model');
        if (res.ok) {
          triggerToast(`Successfully imported: ${res.name}`);
          loadSavedModels();
        } else if (res.path !== null) {
          triggerToast(res.message || 'Failed to import model.', 'error');
        }
      } catch (err: any) {
        triggerToast(err.message || 'Error importing file.', 'error');
      }
    } else {
      triggerToast('Import file is only supported in desktop mode.', 'info');
    }
  };

  const handlePresetSelect = (presetId: string, presetName: string) => {
    setSelectedPresetId(presetId);
    setName(presetName);
    if (presetId === 'preset-1') {
      setStylization('Chibi');
      setMaterialColor('#ec4899');
    } else if (presetId === 'preset-2') {
      setStylization('Steampunk');
      setMaterialColor('#b45309');
    } else if (presetId === 'preset-3') {
      setStylization('Futurism');
      setMaterialColor('#38bdf8');
    } else if (presetId === 'preset-4') {
      setStylization('Pixelation');
      setMaterialColor('#8b5cf6');
    } else {
      setStylization('Low polygon');
      setMaterialColor('#10b981');
    }
    triggerToast(`Loaded ${presetName} preset template.`);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--brand-bg)] text-white select-none relative overflow-hidden font-sans">
      {/* Top Header Navbar */}
      <header className="h-14 w-full flex items-center justify-between border-b border-[var(--brand-border)]/80 px-6 bg-[var(--brand-bg)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Box size={16} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">SuperAgent 3DStudio</span>
            <span className="text-[10px] text-slate-400 font-medium">Asset: {name}</span>
          </div>
        </div>

        {/* Dual Persona Switcher */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => {
              setStudioMode('kid');
              triggerToast('Switched to Kid Magic Studio Persona');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              studioMode === 'kid'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smile size={13} className="text-amber-400" />
            <span>🎈 Kid Studio</span>
          </button>

          <button
            onClick={() => {
              setStudioMode('pro');
              triggerToast('Switched to Professional Studio Persona');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              studioMode === 'pro'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck size={13} className="text-sky-400" />
            <span>🔬 Pro Studio</span>
          </button>
        </div>

        {/* Target Output Format Selector */}
        <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setTargetOutput('game_animation')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
              targetOutput === 'game_animation' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gamepad2 size={12} />
            <span>PC Game</span>
          </button>
          <button
            onClick={() => setTargetOutput('3d_printing')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
              targetOutput === '3d_printing' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer size={12} />
            <span>3D Print</span>
          </button>
          <button
            onClick={() => setTargetOutput('factory_manufacturing')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
              targetOutput === 'factory_manufacturing' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Factory size={12} />
            <span>Factory CAD</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-300 font-medium">SOTA AI Engine Ready</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-all">
            <Eye size={14} className="text-slate-400" />
          </div>
        </div>
      </header>

      {/* Kid Mode Super3D Buddy Assistant Banner */}
      {studioMode === 'kid' && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <Sparkles size={14} className="text-amber-400 animate-bounce" />
            <span className="font-bold">Super3D Buddy:</span>
            <span>"Hi! Speak or type what toy you want to make, then press 'Make 3D Toy'!"</span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20"
          >
            <Wand2 size={13} />
            <span>{generating ? 'Making Magic...' : 'Make 3D Toy Magic!'}</span>
          </button>
        </div>
      )}

      {/* Main Studio Viewport & Sidebar Layout */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        
        {/* Left Step Nav Vertical Timeline */}
        <StageNavigation
          activeStage={activeStage}
          onStageChange={setActiveStage}
          shadingMode={shadingMode}
          onShadingModeChange={setShadingMode}
        />

        {/* Left Floating Action Parameter Editor */}
        <ActionPanel
          activeStage={activeStage}
          onStageChange={setActiveStage}
          name={name}
          onNameChange={setName}
          prompt={prompt}
          onPromptChange={setPrompt}
          conceptTab={conceptTab}
          onConceptTabChange={setConceptTab}
          conceptImage={conceptImage}
          onPickImage={handlePickImage}
          aPose={aPose}
          onAPoseChange={setAPose}
          stylization={stylization}
          onStylizationChange={setStylization}
          geometrySource={geometrySource}
          onGeometrySourceChange={setGeometrySource}
          uploadMode={uploadMode}
          onUploadModeChange={setUploadMode}
          modelType={modelType}
          onModelTypeChange={setModelType}
          faceCount={faceCount}
          onFaceCountChange={setFaceCount}
          generating={generating}
          onGenerate={handleGenerate}
          result={result}
          onImportToPet={() => handleImportToPet()}
          animationPreset={animationPreset}
          onAnimationPresetChange={setAnimationPreset}
          animationSpeed={animationSpeed}
          onAnimationSpeedChange={setAnimationSpeed}
          isAnimating={isAnimating}
          onIsAnimatingChange={setIsAnimating}
          triggerToast={triggerToast}
        />

        {/* Middle Interactive 3D Viewport Canvas View */}
        <ThreeDViewport
          activeStage={activeStage}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          autoRotate={autoRotate}
          onAutoRotateChange={setAutoRotate}
          shadingMode={shadingMode}
          onShadingModeChange={setShadingMode}
          conceptImage={conceptImage}
          stylization={stylization}
          result={result}
          visibleNodes={visibleNodes}
          modelPosition={modelPosition}
          modelRotation={modelRotation}
          modelScale={modelScale}
          materialColor={materialColor}
          materialRoughness={materialRoughness}
          materialMetalness={materialMetalness}
          animationPreset={animationPreset}
          animationSpeed={animationSpeed}
          isAnimating={isAnimating}
          triggerToast={triggerToast}
        />

        {/* Right side Library Scene Transform Material Tab Panels */}
        <RightSidebar
          rightSidebarTab={rightSidebarTab}
          onRightSidebarTabChange={setRightSidebarTab}
          savedModels={savedModels}
          onImportToPet={handleImportToPet}
          onDeleteModel={handleDeleteModel}
          onImportExternalModel={handleImportExternalModel}
          selectedPresetId={selectedPresetId}
          onPresetSelect={handlePresetSelect}
          visibleNodes={visibleNodes}
          onVisibleNodesChange={setVisibleNodes}
          modelPosition={modelPosition}
          onModelPositionChange={setModelPosition}
          modelRotation={modelRotation}
          onModelRotationChange={setModelRotation}
          modelScale={modelScale}
          onModelScaleChange={setModelScale}
          materialColor={materialColor}
          onMaterialColorChange={setMaterialColor}
          materialRoughness={materialRoughness}
          onMaterialRoughnessChange={setMaterialRoughness}
          materialMetalness={materialMetalness}
          onMaterialMetalnessChange={setMaterialMetalness}
          triggerToast={triggerToast}
        />

      </div>
    </div>
  );
};

export default ThreeDStudio;
