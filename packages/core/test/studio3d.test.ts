import { describe, expect, it } from 'vitest';
import { ThreeDStudioEngine } from '../src/studio/3d/index';

describe('ThreeDStudioEngine', () => {
  const engine = new ThreeDStudioEngine();

  it('should handle Kid Mode 1-click creation for 3D printing a toy car', async () => {
    const result = await engine.create3DAsset('kid', 'Make a cool toy car for my 3D printer');

    expect(result.super3dBuddyMessage).toContain('3D printer');
    expect(result.exportManifest.targetOutput).toBe('3d_printing');
    expect(result.exportManifest.domain).toBe('device');
    expect(result.exportManifest.fileUrls.stl).toBeDefined();
    expect(result.exportManifest.fileUrls.threeMf).toBeDefined();
    expect(result.sessionState.printingReport?.isWatertightManifold).toBe(true);
  });

  it('should handle Pro Mode creation for game/animation character asset', async () => {
    const result = await engine.create3DAsset('pro', {
      prompt: 'Cyberpunk humanoid warrior character',
      domain: 'character',
      targetOutput: 'game_animation',
      selectedModel: 'hunyuan3d',
    });

    expect(result.exportManifest.exportFormat).toBe('gltf_2.0_pbr');
    expect(result.exportManifest.fileUrls.gltf).toBeDefined();
    expect(result.exportManifest.fileUrls.fbx).toBeDefined();
    expect(result.sessionState.skeletonRig?.joints.length).toBeGreaterThan(0);
    expect(result.sessionState.skeletonRig?.blendshapes).toContain('jawOpen');
    expect(result.sessionState.pbrStack.albedoMapUrl).toBeDefined();
  });

  it('should handle Pro Mode factory manufacturing asset with CAD B-Rep CSG tree and DFM report', async () => {
    const result = await engine.create3DAsset('pro', {
      prompt: 'Aluminum electronic device housing enclosure',
      domain: 'device',
      targetOutput: 'factory_manufacturing',
      selectedModel: 'text2cad',
    });

    expect(result.exportManifest.exportFormat).toBe('step_brep_cad');
    expect(result.exportManifest.fileUrls.step).toBeDefined();
    expect(result.exportManifest.fileUrls.iges).toBeDefined();
    expect(result.exportManifest.billOfMaterials).toBeDefined();
    expect(result.sessionState.dfmReport?.isManufacturable).toBe(true);
    expect(result.sessionState.assemblyParts.length).toBe(1);
    expect(result.sessionState.assemblyParts[0].volumeMm3).toBeGreaterThan(0);
  });

  it('should support updating CSG feature node parameters in Pro Mode', async () => {
    const session = engine.proController.createInitialProState('asset_test', {
      prompt: 'Bracket',
      domain: 'device',
      targetOutput: 'factory_manufacturing',
    });

    const updated = engine.proController.updateCSGNodeParameter(
      session,
      'csg_001',
      'depth',
      75
    );

    expect(updated.csgFeatureTree[0].parameters.depth).toBe(75);
  });
});
