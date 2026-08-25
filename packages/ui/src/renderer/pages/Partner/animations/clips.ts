import type { VRMPose, CompanionAction } from './types';

export * from './clipsCore';
export * from './clipsGreetings';
export * from './clipsAffection';
export * from './clipsJoy';
export * from './clipsConversation';
export * from './clipsPlayful';
export * from './clipsNegative';
export * from './clipsInteractive';
export * from './clipsRoutines';

import {
  getIdlePose,
  getIdleRelaxedPose,
  getIdleBehindBackPose,
  getIdleHipsPose,
  getIdleArmsCrossedPose,
  getThinkingPose,
  getIdleWaitingPose,
  getIdleSittingChairPose,
  getIdleSittingFloorPose,
  getIdleStretchingPose,
  getIdleSleepyPose,
  getIdleCuriousPose,
} from './clipsCore';

import {
  getWavePose,
  getWaveEnergeticPose,
  getWaveShyPose,
  getBowPose,
  getNodCasualPose,
  getAirHugPose,
  getKissGreetingPose,
  getGoodMorningPose,
  getGoodbyeWavePose,
  getGoodbyeReluctantPose,
  getKissGoodbyePose,
} from './clipsGreetings';

import {
  getKissSinglePose,
  getKissTwoHandedPose,
  getFingerHeartPose,
  getHeartPose,
  getArmHeartBigPose,
  getAirCuddlesPose,
  getBlushPose,
  getWinkSmilePose,
  getHairFlipPose,
  getLeanInPose,
  getLovingGazePose,
  getLipBitePose,
  getBeckonPose,
  getTraceHeartPose,
  getPeekFingersPose,
  getTwirlHairPose,
  getLovingSighPose,
} from './clipsAffection';

import {
  getClapPose,
  getJumpJoyPose,
  getSpinPose,
  getFistPumpPose,
  getLaughPose,
  getLaughFullPose,
  getDancePose,
  getThumbsUpDoublePose,
  getThumbsUpSinglePose,
  getSparklyEyesPose,
  getHighFivePose,
  getPeacePose,
  getCheerPose,
} from './clipsJoy';

import {
  getTalkNodPose,
  getTalkShakeHeadPose,
  getTalkShrugPose,
  getTalkCountFingersPose,
  getTalkPointScreenPose,
  getTalkPointSelfPose,
  getTalkHandsPose,
  getTalkTiltHeadPose,
  getTalkCupEarPose,
  getTalkHandChestPose,
  getTalkWagFingerPose,
  getTalkEyebrowPose,
  getTalkDeepBreathPose,
  getTalkLookAroundPose,
  getTalkWhisperPose,
  getTalkInterruptionPose,
  getTalkingPose,
} from './clipsConversation';

import {
  getPoutPose,
  getTongueOutPose,
  getEyerollPose,
  getFakeYawnPose,
  getPeekabooPose,
  getWatchingYouPose,
  getPlayfulPunchPose,
  getMicDropPose,
  getDustShouldersPose,
  getLookNailsPose,
  getNekoPose,
} from './clipsPlayful';

import {
  getSadSighPose,
  getCryingPose,
  getSulkingPose,
  getStartledPose,
  getShiveringPose,
  getAngryStompPose,
  getFacepalmPose,
  getAnxiousFidgetPose,
  getPacingPose,
  getPleadingPose,
  getCurlingUpPose,
  getTremblingLipPose,
  getEmbarrassedHidePose,
} from './clipsNegative';

import {
  getReactHeadpatPose,
  getReactPokePose,
  getReactTicklePose,
  getReactTapSurprisePose,
  getReactStrokeHairPose,
  getReactArmTouchPose,
  getReactBoopPose,
  getReactEarPullPose,
  getReactHugPose,
  getReactDizzyPose,
  getReactSwipePose,
} from './clipsInteractive';

import {
  getRoutineYawnPose,
  getRoutineFallAsleepPose,
  getRoutineSleepingPose,
  getRoutinePhonePose,
  getRoutineSelfiePose,
  getRoutineListenMusicPose,
  getRoutineCoffeePose,
  getRoutineBookPose,
  getRoutineAdjustGlassesPose,
  getRoutineCheckWatchPose,
  getRoutineMakeupPose,
  getRoutinePetAnimalPose,
  getRoutineExercisePose,
  getRoutineSnackPose,
  getRoutineCookingPose,
  getRoutineTypingPose,
  getRoutineJacketPose,
  getRoutineSmellFlowersPose,
  getRoutineCatchBugPose,
  getRoutineTieShoesPose,
  getRoutineLookSkyPose,
} from './clipsRoutines';

// Legacy helpers
export function getSalutePose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return {
    ...baseIdle,
    spineRot: [0.01, 0, 0],
    headRot: [0.02, 0.03, 0.02],
    rightUpperArmRot: [0.22, 0.35, -0.45],
    rightLowerArmRot: [0.48, 0.6, -1.75],
    rightHandRot:     [0.1, 0.3, -0.15],
    rightFingers:     'salute',
    leftFingers:      'relaxed',
    expressions: { neutral: 0.7, happy: 0.35 },
  };
}

export function getStretchPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return getIdleStretchingPose(t, actTime, baseIdle);
}

export function getListenPose(t: number, actTime: number, baseIdle: VRMPose): VRMPose {
  return getLeanInPose(t, actTime, baseIdle);
}

/**
 * Master Action Resolver: Returns the target VRMPose for any action among the 125 library actions.
 */
export function resolveActionPose(
  action: CompanionAction,
  t: number,
  actTime: number,
  baseIdle: VRMPose
): VRMPose {
  switch (action) {
    // 1. Core Idles
    case 'idle':                return baseIdle;
    case 'idle_relaxed':        return getIdleRelaxedPose(t, baseIdle);
    case 'idle_behind_back':    return getIdleBehindBackPose(t, baseIdle);
    case 'idle_hips':           return getIdleHipsPose(t, baseIdle);
    case 'idle_arms_crossed':   return getIdleArmsCrossedPose(t, baseIdle);
    case 'thinking':            return getThinkingPose(t, baseIdle);
    case 'idle_waiting':        return getIdleWaitingPose(t, baseIdle);
    case 'idle_sitting_chair':  return getIdleSittingChairPose(t, baseIdle);
    case 'idle_sitting_floor':  return getIdleSittingFloorPose(t, baseIdle);
    case 'idle_stretching':     return getIdleStretchingPose(t, actTime, baseIdle);
    case 'idle_sleepy':         return getIdleSleepyPose(t, baseIdle);
    case 'idle_curious':        return getIdleCuriousPose(t, baseIdle);

    // 2. Greetings & Farewells
    case 'wave':                return getWavePose(t, actTime, baseIdle);
    case 'wave_energetic':      return getWaveEnergeticPose(t, actTime, baseIdle);
    case 'wave_shy':            return getWaveShyPose(t, actTime, baseIdle);
    case 'bow':                 return getBowPose(t, actTime, baseIdle);
    case 'nod_casual':          return getNodCasualPose(t, actTime, baseIdle);
    case 'air_hug':             return getAirHugPose(t, actTime, baseIdle);
    case 'kiss_greeting':       return getKissGreetingPose(t, actTime, baseIdle);
    case 'good_morning':        return getGoodMorningPose(t, actTime, baseIdle);
    case 'goodbye_wave':        return getGoodbyeWavePose(t, actTime, baseIdle);
    case 'goodbye_reluctant':   return getGoodbyeReluctantPose(t, actTime, baseIdle);
    case 'kiss_goodbye':        return getKissGoodbyePose(t, actTime, baseIdle);

    // 3. Affection & Flirting
    case 'kiss_single':         return getKissSinglePose(t, actTime, baseIdle);
    case 'kiss_two_handed':     return getKissTwoHandedPose(t, actTime, baseIdle);
    case 'finger_heart':        return getFingerHeartPose(t, actTime, baseIdle);
    case 'heart':               return getHeartPose(t, actTime, baseIdle);
    case 'arm_heart_big':       return getArmHeartBigPose(t, actTime, baseIdle);
    case 'air_cuddles':         return getAirCuddlesPose(t, actTime, baseIdle);
    case 'blush':               return getBlushPose(t, actTime, baseIdle);
    case 'wink_smile':          return getWinkSmilePose(t, actTime, baseIdle);
    case 'hair_flip':           return getHairFlipPose(t, actTime, baseIdle);
    case 'lean_in':             return getLeanInPose(t, actTime, baseIdle);
    case 'loving_gaze':         return getLovingGazePose(t, actTime, baseIdle);
    case 'lip_bite':            return getLipBitePose(t, actTime, baseIdle);
    case 'beckon':              return getBeckonPose(t, actTime, baseIdle);
    case 'trace_heart':         return getTraceHeartPose(t, actTime, baseIdle);
    case 'peek_fingers':        return getPeekFingersPose(t, actTime, baseIdle);
    case 'twirl_hair':          return getTwirlHairPose(t, actTime, baseIdle);
    case 'loving_sigh':         return getLovingSighPose(t, actTime, baseIdle);

    // 4. Joy & Excitement
    case 'clap':                return getClapPose(t, actTime, baseIdle);
    case 'jump_joy':            return getJumpJoyPose(t, actTime, baseIdle);
    case 'spin':                return getSpinPose(t, actTime, baseIdle);
    case 'fist_pump':           return getFistPumpPose(t, actTime, baseIdle);
    case 'laugh':               return getLaughPose(t, actTime, baseIdle);
    case 'laugh_full':          return getLaughFullPose(t, actTime, baseIdle);
    case 'dance':               return getDancePose(t, actTime, baseIdle);
    case 'thumbs_up_double':    return getThumbsUpDoublePose(t, actTime, baseIdle);
    case 'thumbs_up_single':    return getThumbsUpSinglePose(t, actTime, baseIdle);
    case 'sparkly_eyes':        return getSparklyEyesPose(t, actTime, baseIdle);
    case 'high_five':           return getHighFivePose(t, actTime, baseIdle);
    case 'peace':               return getPeacePose(t, actTime, baseIdle);
    case 'cheer':               return getCheerPose(t, actTime, baseIdle);

    // 5. Conversational Gestures
    case 'talk_nod':            return getTalkNodPose(t, actTime, baseIdle);
    case 'talk_shake_head':     return getTalkShakeHeadPose(t, actTime, baseIdle);
    case 'talk_shrug':          return getTalkShrugPose(t, actTime, baseIdle);
    case 'talk_count_fingers':  return getTalkCountFingersPose(t, actTime, baseIdle);
    case 'talk_point_screen':   return getTalkPointScreenPose(t, actTime, baseIdle);
    case 'talk_point_self':     return getTalkPointSelfPose(t, actTime, baseIdle);
    case 'talk_hands':          return getTalkHandsPose(t, baseIdle);
    case 'talk_tilt_head':      return getTalkTiltHeadPose(t, actTime, baseIdle);
    case 'talk_cup_ear':        return getTalkCupEarPose(t, actTime, baseIdle);
    case 'talk_hand_chest':     return getTalkHandChestPose(t, actTime, baseIdle);
    case 'talk_wag_finger':     return getTalkWagFingerPose(t, actTime, baseIdle);
    case 'talk_eyebrow':        return getTalkEyebrowPose(t, actTime, baseIdle);
    case 'talk_deep_breath':    return getTalkDeepBreathPose(t, actTime, baseIdle);
    case 'talk_look_around':    return getTalkLookAroundPose(t, actTime, baseIdle);
    case 'talk_whisper':        return getTalkWhisperPose(t, actTime, baseIdle);
    case 'talk_interruption':   return getTalkInterruptionPose(t, actTime, baseIdle);

    // 6. Playful & Sassy
    case 'pout':                return getPoutPose(t, actTime, baseIdle);
    case 'tongue_out':          return getTongueOutPose(t, actTime, baseIdle);
    case 'eyeroll':             return getEyerollPose(t, actTime, baseIdle);
    case 'fake_yawn':           return getFakeYawnPose(t, actTime, baseIdle);
    case 'peekaboo':            return getPeekabooPose(t, actTime, baseIdle);
    case 'watching_you':        return getWatchingYouPose(t, actTime, baseIdle);
    case 'playful_punch':       return getPlayfulPunchPose(t, actTime, baseIdle);
    case 'mic_drop':            return getMicDropPose(t, actTime, baseIdle);
    case 'dust_shoulders':      return getDustShouldersPose(t, actTime, baseIdle);
    case 'look_nails':          return getLookNailsPose(t, actTime, baseIdle);
    case 'neko':                return getNekoPose(t, actTime, baseIdle);

    // 7. Negative Emotions
    case 'sad_sigh':            return getSadSighPose(t, actTime, baseIdle);
    case 'crying':              return getCryingPose(t, actTime, baseIdle);
    case 'sulking':             return getSulkingPose(t, actTime, baseIdle);
    case 'startled':            return getStartledPose(t, actTime, baseIdle);
    case 'shivering':           return getShiveringPose(t, actTime, baseIdle);
    case 'angry_stomp':         return getAngryStompPose(t, actTime, baseIdle);
    case 'facepalm':            return getFacepalmPose(t, actTime, baseIdle);
    case 'anxious_fidget':      return getAnxiousFidgetPose(t, actTime, baseIdle);
    case 'pacing':              return getPacingPose(t, actTime, baseIdle);
    case 'pleading':            return getPleadingPose(t, actTime, baseIdle);
    case 'curling_up':          return getCurlingUpPose(t, actTime, baseIdle);
    case 'trembling_lip':       return getTremblingLipPose(t, actTime, baseIdle);
    case 'embarrassed_hide':    return getEmbarrassedHidePose(t, actTime, baseIdle);

    // 8. Interactive Reactions
    case 'react_headpat':       return getReactHeadpatPose(t, actTime, baseIdle);
    case 'react_poke':          return getReactPokePose(t, actTime, baseIdle);
    case 'react_tickle':        return getReactTicklePose(t, actTime, baseIdle);
    case 'react_tap_surprise':  return getReactTapSurprisePose(t, actTime, baseIdle);
    case 'react_stroke_hair':   return getReactStrokeHairPose(t, actTime, baseIdle);
    case 'react_arm_touch':     return getReactArmTouchPose(t, actTime, baseIdle);
    case 'react_boop':          return getReactBoopPose(t, actTime, baseIdle);
    case 'react_ear_pull':      return getReactEarPullPose(t, actTime, baseIdle);
    case 'react_hug':           return getReactHugPose(t, actTime, baseIdle);
    case 'react_dizzy':         return getReactDizzyPose(t, actTime, baseIdle);
    case 'react_swipe':         return getReactSwipePose(t, actTime, baseIdle);

    // 9. Daily Routines
    case 'routine_yawn':            return getRoutineYawnPose(t, actTime, baseIdle);
    case 'routine_fall_asleep':     return getRoutineFallAsleepPose(t, actTime, baseIdle);
    case 'routine_sleeping':        return getRoutineSleepingPose(t, baseIdle);
    case 'routine_phone':           return getRoutinePhonePose(t, actTime, baseIdle);
    case 'routine_selfie':          return getRoutineSelfiePose(t, actTime, baseIdle);
    case 'routine_listen_music':    return getRoutineListenMusicPose(t, actTime, baseIdle);
    case 'routine_coffee':          return getRoutineCoffeePose(t, actTime, baseIdle);
    case 'routine_book':            return getRoutineBookPose(t, actTime, baseIdle);
    case 'routine_adjust_glasses':  return getRoutineAdjustGlassesPose(t, actTime, baseIdle);
    case 'routine_check_watch':     return getRoutineCheckWatchPose(t, actTime, baseIdle);
    case 'routine_makeup':          return getRoutineMakeupPose(t, actTime, baseIdle);
    case 'routine_pet_animal':      return getRoutinePetAnimalPose(t, actTime, baseIdle);
    case 'routine_exercise':        return getRoutineExercisePose(t, actTime, baseIdle);
    case 'routine_snack':           return getRoutineSnackPose(t, actTime, baseIdle);
    case 'routine_cooking':         return getRoutineCookingPose(t, actTime, baseIdle);
    case 'routine_typing':          return getRoutineTypingPose(t, actTime, baseIdle);
    case 'routine_jacket':          return getRoutineJacketPose(t, actTime, baseIdle);
    case 'routine_smell_flowers':   return getRoutineSmellFlowersPose(t, actTime, baseIdle);
    case 'routine_catch_bug':       return getRoutineCatchBugPose(t, actTime, baseIdle);
    case 'routine_tie_shoes':       return getRoutineTieShoesPose(t, actTime, baseIdle);
    case 'routine_look_sky':        return getRoutineLookSkyPose(t, actTime, baseIdle);

    // Backward-compat aliases
    case 'salute':  return getSalutePose(t, actTime, baseIdle);
    case 'stretch': return getStretchPose(t, actTime, baseIdle);
    case 'listen':  return getListenPose(t, actTime, baseIdle);

    default:
      return baseIdle;
  }
}
