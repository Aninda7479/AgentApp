/**
 * Professional CAD & Game Engine Studio Mode Controller
 * Provides node graph pipeline, parametric CSG command sequence editor, precise dimensioning, PBR stack, and DFM inspection.
 */

import {
  AIModelID,
  AssemblyMate,
  BRepAssemblyPart,
  CSGFeatureNode,
  DFMAnalysisResult,
  GenerationPromptOptions,
  PBRMaterialStack,
  PrintingValidationResult,
  QuadRetopoOptions,
  SkeletonRig,
  UVUnwrapOptions,
} from '../types';

export interface ProStudioSessionState {
  assetId: string;
  selectedModel: AIModelID;
  unitSystem: 'mm' | 'inches' | 'meters';
  csgFeatureTree: CSGFeatureNode[];
  assemblyParts: BRepAssemblyPart[];
  assemblyMates: AssemblyMate[];
  retopoSettings: QuadRetopoOptions;
  uvSettings: UVUnwrapOptions;
  pbrStack: PBRMaterialStack;
  skeletonRig?: SkeletonRig;
  dfmReport?: DFMAnalysisResult;
  printingReport?: PrintingValidationResult;
}

export class ProModeController {
  public createInitialProState(
    assetId: string,
    options: GenerationPromptOptions
  ): ProStudioSessionState {
    return {
      assetId,
      selectedModel: options.selectedModel || 'hunyuan3d',
      unitSystem: 'mm',
      csgFeatureTree: [
        {
          id: 'csg_001',
          type: 'extrude',
          parameters: { width: 100, length: 80, depth: 40 },
        },
      ],
      assemblyParts: [],
      assemblyMates: [],
      retopoSettings: {
        targetPolyCount: 20000,
        preserveHardEdges: true,
        edgeFlowSymmetry: true,
      },
      uvSettings: {
        margin: 0.002,
        packTextureResolution: 4096,
        lightmapChannel: true,
      },
      pbrStack: {},
    };
  }

  public updateCSGNodeParameter(
    state: ProStudioSessionState,
    nodeId: string,
    paramKey: string,
    paramValue: number | string | boolean
  ): ProStudioSessionState {
    const updatedNodes = state.csgFeatureTree.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          parameters: {
            ...node.parameters,
            [paramKey]: paramValue,
          },
        };
      }
      return node;
    });

    return {
      ...state,
      csgFeatureTree: updatedNodes,
    };
  }
}
