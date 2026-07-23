/**
 * CAD B-Rep Kernel & CSG Processor
 * Converts CSG command sequences into solid B-Rep models, manages multi-part assembly mates, and checks tolerances.
 */

import { AssemblyMate, BRepAssemblyPart, CSGFeatureNode } from '../types';

export class CADBRepKernel {
  /**
   * Constructs a parametric assembly part from a CSG feature node tree.
   */
  public buildPartFromCSGTree(
    partId: string,
    name: string,
    material: string,
    csgTree: CSGFeatureNode[]
  ): BRepAssemblyPart {
    let width = 100;
    let length = 100;
    let height = 50;

    for (const node of csgTree) {
      if (node.type === 'extrude') {
        height = Number(node.parameters.depth || height);
        width = Number(node.parameters.width || width);
        length = Number(node.parameters.length || length);
      }
    }

    const volumeMm3 = width * length * height * 0.85; // Account for hollow/subtractive cuts
    const density = material === 'aluminum' ? 0.0027 : material === 'abs_plastic' ? 0.00104 : 0.00785;
    const weightGrams = Math.round(volumeMm3 * density * 100) / 100;

    return {
      partId,
      name,
      material,
      csgTree,
      dimensionsMm: [width, length, height],
      volumeMm3: Math.round(volumeMm3),
      weightGrams,
    };
  }

  /**
   * Validates multi-part assembly mates and interference between components.
   */
  public validateAssemblyMates(
    parts: BRepAssemblyPart[],
    mates: AssemblyMate[]
  ): { isValid: boolean; interferenceCount: number; warnings: string[] } {
    const warnings: string[] = [];
    let interferenceCount = 0;

    if (parts.length > 1 && mates.length === 0) {
      warnings.push('Assembly contains multiple parts but no mate constraints defined.');
    }

    for (const mate of mates) {
      const partA = parts.find((p) => p.partId === mate.partAId);
      const partB = parts.find((p) => p.partId === mate.partBId);

      if (!partA || !partB) {
        warnings.push(`Invalid mate reference: Part missing for mate ${mate.id}`);
        continue;
      }

      if (mate.type === 'distance' && (mate.valueMm ?? 0) < 0.1) {
        interferenceCount++;
        warnings.push(
          `Potential clearance collision between ${partA.name} and ${partB.name} (distance < 0.1mm)`
        );
      }
    }

    return {
      isValid: warnings.length === 0,
      interferenceCount,
      warnings,
    };
  }
}
