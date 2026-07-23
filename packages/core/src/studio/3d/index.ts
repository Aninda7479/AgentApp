/**
 * 3DStudio Engine Entry Point for SuperAgent
 * Provides unified dual-mode (Kid/Pro) access to SOTA 3D AI modeling, retopology, auto-rigging, CAD B-Rep, and factory DFM export.
 */

import { CADBRepKernel } from './engine/cad-brep-kernel';
import { GenerativeOrchestrator } from './engine/generative-orchestrator';
import { MeshRetopoUVEngine } from './engine/mesh-retopo-uv';
import { RigAnimatorEngine } from './engine/rig-animator';
import { SlicerDFMCheckerEngine } from './engine/slicer-dfm-checker';
import { ExporterHubEngine } from './export/exporter-hub';
import { KidModeController } from './modes/kid-mode';
import { ProModeController, ProStudioSessionState } from './modes/pro-mode';
import {
  ExportManifest,
  GenerationPromptOptions,
  StudioUXMode,
} from './types';

export class ThreeDStudioEngine {
  private generativeOrchestrator = new GenerativeOrchestrator();
  private cadKernel = new CADBRepKernel();
  private retopoUVEngine = new MeshRetopoUVEngine();
  private rigAnimator = new RigAnimatorEngine();
  private slicerDFMChecker = new SlicerDFMCheckerEngine();
  private exporterHub = new ExporterHubEngine();

  public kidController = new KidModeController();
  public proController = new ProModeController();

  /**
   * Primary entry point to process a 3D creation request under Kid or Pro UX mode.
   */
  public async create3DAsset(
    mode: StudioUXMode,
    promptOrOptions: string | GenerationPromptOptions
  ): Promise<{
    sessionState: ProStudioSessionState;
    super3dBuddyMessage?: string;
    exportManifest: ExportManifest;
  }> {
    let options: GenerationPromptOptions;

    if (typeof promptOrOptions === 'string') {
      options = this.kidController.parseKidPrompt(promptOrOptions);
    } else {
      options = promptOrOptions;
    }

    // 1. Generate Base Geometry via SOTA AI Orchestrator
    const initMesh = await this.generativeOrchestrator.generateInitial3D(options);

    // 2. Initialize Pro Session State
    let sessionState = this.proController.createInitialProState(initMesh.assetId, options);

    // 3. Process Pipeline according to target output format
    if (options.targetOutput === 'game_animation') {
      const retopo = this.retopoUVEngine.unwrapUVsAndBuildPBR(
        initMesh.assetId,
        sessionState.retopoSettings,
        sessionState.uvSettings
      );
      sessionState.pbrStack = retopo.pbrMaterials;

      if (options.domain === 'character') {
        sessionState.skeletonRig = this.rigAnimator.generateSkeleton(options.domain);
      }
    } else if (options.targetOutput === '3d_printing') {
      sessionState.printingReport = this.slicerDFMChecker.validateFor3DPrinting();
    } else if (options.targetOutput === 'factory_manufacturing') {
      const mainPart = this.cadKernel.buildPartFromCSGTree(
        'part_01',
        'Main Chassis',
        'aluminum',
        sessionState.csgFeatureTree
      );
      sessionState.assemblyParts = [mainPart];
      sessionState.dfmReport = this.slicerDFMChecker.analyzeDFMForFactory();
    }

    // 4. Generate Export Manifest
    const exportManifest = this.exporterHub.exportAsset(
      initMesh.assetId,
      options.domain,
      options.targetOutput,
      sessionState.printingReport,
      sessionState.dfmReport
    );

    const super3dBuddyMessage =
      mode === 'kid'
        ? this.kidController.getSuper3DBuddyMessage(options.domain, options.targetOutput)
        : undefined;

    return {
      sessionState,
      super3dBuddyMessage,
      exportManifest,
    };
  }
}

export * from './types';
