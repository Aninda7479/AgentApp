import React, { useState, useEffect } from 'react';
import { Box, Eye } from 'lucide-react';
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
  // Navigation & Active States
  const [activeStage, setActiveStage] = useState(1);
  const [name, setName] = useState('Luna');
  const [prompt, setPrompt] = useState('A cute chibi-style schoolgirl in A-pose, white shirt, black hair, and pink skirt.');
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
        if (threeD.enabled) {
          if (threeD.provider) {
            triggerToast(`Ready: 3D generation provider is set to ${threeD.provider}.`, 'info');
          }
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
      // Mock data in browser
      setSavedModels([
        { name: 'mock-chibi-princess', path: 'mock/path/princess.glb', format: 'glb', size: 1048576, modified: Date.now() - 3600000 },
        { name: 'mock-cyberpunk-runner', path: 'mock/path/runner.glb', format: 'glb', size: 2048576, modified: Date.now() - 86400000 }
      ]);
    }
  };

  // Handle Pick Image
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

  // Handle Generate IPC
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
          message: 'Preview character generated locally (web mode).'
        };
        setResult(demoResult);
        triggerToast('Preview model ready (web mode).', 'info');
        setActiveStage(8);
        loadSavedModels();
      }, 2000);
      return;
    }
    if (!name.trim()) {
      triggerToast('Please provide a character name.', 'error');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = (await ipc.invoke('three-d-generate', {
        name: name.trim(),
        prompt: prompt.trim() || undefined,
        imagePath: conceptImage || undefined
      })) as GeneratedModel;

      setResult(res);

      if (res.disabled) {
        triggerToast('3D Model Gen is disabled in Settings.', 'info');
        setActiveStage(1);
      } else if (res.ok && res.path) {
        triggerToast('3D Model successfully generated! View step 8 to import it.', 'info');
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

  // Import model into active partner
  const handleImportToPet = async (modelPath?: string) => {
    const importPath = modelPath || result?.path;
    if (!importPath) {
      triggerToast('Select or generate a character first.', 'error');
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
      const label = modelPath ? 'model database' : (result?.provider === 'local' ? 'local offline placeholder' : result?.provider || 'cloud');
      triggerToast(`3D character imported (${label}) — showing in desktop pet window!`, 'info');
    } catch {
      triggerToast('Could not attach the model to the active Partner.', 'error');
    }
  };

  // Delete model
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

  // Import external model file
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

  // Preset configuration loaders
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
      {/* Navbar Header */}
      <header className="h-14 w-full flex items-center justify-between border-b border-[var(--brand-border)]/80 px-6 bg-[var(--brand-bg)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Box size={16} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400">3D Modeling Studio</span>
            <span className="text-[10px] text-slate-500 font-medium">Model: {name}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-[10px] text-slate-300 font-medium">27 credits remaining</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-all">
            <Eye size={14} className="text-slate-400" />
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        
        {/* Left Step nav vertical timeline */}
        <StageNavigation
          activeStage={activeStage}
          onStageChange={setActiveStage}
          shadingMode={shadingMode}
          onShadingModeChange={setShadingMode}
        />

        {/* Left floating action parameter editor card */}
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

        {/* Middle interactive 3D Viewport canvas view */}
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

        {/* Right side library scene transform material tab panels */}
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
