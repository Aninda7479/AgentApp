/**
 * 3DStudio Types & Interfaces for SuperAgent
 */

export type AssetDomain = 'character' | 'building' | 'device';

export type TargetOutputFormat = 'game_animation' | '3d_printing' | 'factory_manufacturing';

export type StudioUXMode = 'kid' | 'pro';

export type AIModelID =
  | 'hunyuan3d'
  | 'tripo3d'
  | 'trellis2'
  | 'seed3d'
  | 'sf3d'
  | 'deepcad'
  | 'text2cad'
  | 'printmaker_ai';

export interface GenerationPromptOptions {
  prompt: string;
  domain: AssetDomain;
  targetOutput: TargetOutputFormat;
  selectedModel?: AIModelID;
  stylePreset?: string;
  referenceImages?: string[];
}

export interface PBRMaterialStack {
  albedoMapUrl?: string;
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metallicMapUrl?: string;
  heightMapUrl?: string;
  ambientOcclusionMapUrl?: string;
}

export interface QuadRetopoOptions {
  targetPolyCount: number;
  preserveHardEdges: boolean;
  edgeFlowSymmetry: boolean;
}

export interface UVUnwrapOptions {
  margin: number;
  packTextureResolution: number;
  lightmapChannel: boolean;
}

export interface SkeletalJoint {
  id: string;
  name: string;
  parentJointId?: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
}

export interface SkeletonRig {
  joints: SkeletalJoint[];
  skinningWeightsCalculated: boolean;
  blendshapes: string[];
}

export interface CSGFeatureNode {
  id: string;
  type: 'extrude' | 'revolve' | 'boolean_union' | 'boolean_difference' | 'fillet' | 'chamfer';
  parameters: Record<string, number | string | boolean>;
  sketchPath?: string;
}

export interface BRepAssemblyPart {
  partId: string;
  name: string;
  material: string;
  csgTree: CSGFeatureNode[];
  dimensionsMm: [number, number, number];
  volumeMm3: number;
  weightGrams: number;
}

export interface AssemblyMate {
  id: string;
  type: 'concentric' | 'coincident' | 'distance' | 'angle';
  partAId: string;
  partBId: string;
  valueMm?: number;
}

export interface DFMAnalysisResult {
  isManufacturable: boolean;
  minWallThicknessMm: number;
  hasSufficientDraftAngles: boolean;
  undercutDetected: boolean;
  interferenceCollisionCount: number;
  warnings: string[];
}

export interface PrintingValidationResult {
  isWatertightManifold: boolean;
  hasInvertedNormals: boolean;
  overhangCount: number;
  minWallThicknessMm: number;
  estimatedPrintTimeMinutes: number;
  filamentGramWeight: number;
}

export interface ExportManifest {
  assetId: string;
  domain: AssetDomain;
  targetOutput: TargetOutputFormat;
  exportFormat: string;
  fileUrls: Record<string, string>;
  billOfMaterials?: Record<string, number | string>;
  dfmReport?: DFMAnalysisResult;
  printingReport?: PrintingValidationResult;
}
