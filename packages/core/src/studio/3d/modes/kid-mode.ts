/**
 * Kid Magic Studio Mode Controller
 * Simplifies 3D generation into 1-click magic cards, natural voice/chat prompts, and friendly AI assistant guidance.
 */

import { AssetDomain, GenerationPromptOptions, TargetOutputFormat } from '../types';

export interface KidStudioAction {
  actionId: 'toyify' | 'dance_party' | 'print_my_toy';
  label: string;
  icon: string;
  description: string;
}

export class KidModeController {
  public getAvailableMagicActions(): KidStudioAction[] {
    return [
      {
        actionId: 'toyify',
        label: '🎨 Cartoonify & Paint',
        icon: 'palette',
        description: 'Paints your model in bright, colorful superhero & cartoon colors!',
      },
      {
        actionId: 'dance_party',
        label: '🕺 Make It Dance',
        icon: 'music',
        description: 'Puts your character on stage with fun dance moves!',
      },
      {
        actionId: 'print_my_toy',
        label: '🖨️ Make Print-Ready Toy',
        icon: 'printer',
        description: 'Prepares a sturdy, smooth toy ready to print on your 3D printer!',
      },
    ];
  }

  /**
   * Translates kid natural prompts into structured technical options.
   */
  public parseKidPrompt(userText: string): GenerationPromptOptions {
    const lower = userText.toLowerCase();
    let domain: AssetDomain = 'character';
    let targetOutput: TargetOutputFormat = 'game_animation';

    if (lower.includes('house') || lower.includes('building') || lower.includes('castle')) {
      domain = 'building';
    } else if (lower.includes('car') || lower.includes('robot') || lower.includes('gadget') || lower.includes('toy')) {
      domain = 'device';
    }

    if (lower.includes('print') || lower.includes('toy')) {
      targetOutput = '3d_printing';
    }

    return {
      prompt: userText,
      domain,
      targetOutput,
      stylePreset: 'vibrant_stylized',
    };
  }

  /**
   * Generates friendly assistant response from "Super3D Buddy".
   */
  public getSuper3DBuddyMessage(assetName: string, targetOutput: TargetOutputFormat): string {
    if (targetOutput === '3d_printing') {
      return `🎉 Yay! I've made your super cool ${assetName}! It's nice and sturdy with no sharp edges, perfectly ready for your 3D printer!`;
    }
    return `✨ Wow! Look at your awesome ${assetName}! You can press "Make It Dance" to see it jump around!`;
  }
}
