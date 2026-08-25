import type { VRMExpressionPresetName } from '@pixiv/three-vrm';

export type CompanionMood =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'celebrate'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'flirty'
  | 'sleepy';

export type AnimationCategory =
  | 'Core Idles'
  | 'Greetings'
  | 'Affection'
  | 'Joy & Praise'
  | 'Conversational'
  | 'Playful & Sassy'
  | 'Negative & Vulnerable'
  | 'Interactive Touch'
  | 'Daily Routines';

export type CompanionAction =
  // 1. Core Idles & Postures (1-12)
  | 'idle'
  | 'idle_relaxed'
  | 'idle_behind_back'
  | 'idle_hips'
  | 'idle_arms_crossed'
  | 'thinking'
  | 'idle_waiting'
  | 'idle_sitting_chair'
  | 'idle_sitting_floor'
  | 'idle_stretching'
  | 'idle_sleepy'
  | 'idle_curious'

  // 2. Greetings & Farewells (13-23)
  | 'wave'
  | 'wave_energetic'
  | 'wave_shy'
  | 'bow'
  | 'nod_casual'
  | 'air_hug'
  | 'kiss_greeting'
  | 'good_morning'
  | 'goodbye_wave'
  | 'goodbye_reluctant'
  | 'kiss_goodbye'

  // 3. Affection, Romance & Flirting (24-40)
  | 'kiss_single'
  | 'kiss_two_handed'
  | 'finger_heart'
  | 'heart'
  | 'arm_heart_big'
  | 'air_cuddles'
  | 'blush'
  | 'wink_smile'
  | 'hair_flip'
  | 'lean_in'
  | 'loving_gaze'
  | 'lip_bite'
  | 'beckon'
  | 'trace_heart'
  | 'peek_fingers'
  | 'twirl_hair'
  | 'loving_sigh'

  // 4. Joy, Praise & Excitement (41-53)
  | 'clap'
  | 'jump_joy'
  | 'spin'
  | 'fist_pump'
  | 'laugh'
  | 'laugh_full'
  | 'dance'
  | 'thumbs_up_double'
  | 'thumbs_up_single'
  | 'sparkly_eyes'
  | 'high_five'
  | 'peace'
  | 'cheer'

  // 5. Conversational Gestures (54-69)
  | 'talk_nod'
  | 'talk_shake_head'
  | 'talk_shrug'
  | 'talk_count_fingers'
  | 'talk_point_screen'
  | 'talk_point_self'
  | 'talk_hands'
  | 'talk_tilt_head'
  | 'talk_cup_ear'
  | 'talk_hand_chest'
  | 'talk_wag_finger'
  | 'talk_eyebrow'
  | 'talk_deep_breath'
  | 'talk_look_around'
  | 'talk_whisper'
  | 'talk_interruption'

  // 6. Playful, Teasing & Sassy (70-80)
  | 'pout'
  | 'tongue_out'
  | 'eyeroll'
  | 'fake_yawn'
  | 'peekaboo'
  | 'watching_you'
  | 'playful_punch'
  | 'mic_drop'
  | 'dust_shoulders'
  | 'look_nails'
  | 'neko'

  // 7. Negative Emotions & Vulnerability (81-93)
  | 'sad_sigh'
  | 'crying'
  | 'sulking'
  | 'startled'
  | 'shivering'
  | 'angry_stomp'
  | 'facepalm'
  | 'anxious_fidget'
  | 'pacing'
  | 'pleading'
  | 'curling_up'
  | 'trembling_lip'
  | 'embarrassed_hide'

  // 8. Interactive & Touch Reactions (94-104)
  | 'react_headpat'
  | 'react_poke'
  | 'react_tickle'
  | 'react_tap_surprise'
  | 'react_stroke_hair'
  | 'react_arm_touch'
  | 'react_boop'
  | 'react_ear_pull'
  | 'react_hug'
  | 'react_dizzy'
  | 'react_swipe'

  // 9. Daily Routines, Props & Activities (105-125)
  | 'routine_yawn'
  | 'routine_fall_asleep'
  | 'routine_sleeping'
  | 'routine_phone'
  | 'routine_selfie'
  | 'routine_listen_music'
  | 'routine_coffee'
  | 'routine_book'
  | 'routine_adjust_glasses'
  | 'routine_check_watch'
  | 'routine_makeup'
  | 'routine_pet_animal'
  | 'routine_exercise'
  | 'routine_snack'
  | 'routine_cooking'
  | 'routine_typing'
  | 'routine_jacket'
  | 'routine_smell_flowers'
  | 'routine_catch_bug'
  | 'routine_tie_shoes'
  | 'routine_look_sky'
  
  // Legacy aliases for backwards compatibility
  | 'salute'
  | 'stretch'
  | 'listen';

export type FingerPreset =
  | 'relaxed'
  | 'open'
  | 'fist'
  | 'peace'
  | 'heart'
  | 'finger_heart'
  | 'arm_heart'
  | 'salute'
  | 'cat'
  | 'pointing'
  | 'thumbs_up'
  | 'pinch'
  | 'cup'
  | 'phone'
  | 'book'
  | 'writing'
  | 'shield_eyes'
  | 'clasped';

export interface VRMPose {
  // Torso & Core
  hipsPos?: [number, number, number];
  hipsRot?: [number, number, number];
  spineRot?: [number, number, number];
  chestRot?: [number, number, number];
  upperChestRot?: [number, number, number];
  neckRot?: [number, number, number];
  headRot?: [number, number, number];

  // Left Arm Chain
  leftShoulderRot?: [number, number, number];
  leftUpperArmRot?: [number, number, number];
  leftLowerArmRot?: [number, number, number];
  leftHandRot?: [number, number, number];
  leftFingers?: FingerPreset;

  // Right Arm Chain
  rightShoulderRot?: [number, number, number];
  rightUpperArmRot?: [number, number, number];
  rightLowerArmRot?: [number, number, number];
  rightHandRot?: [number, number, number];
  rightFingers?: FingerPreset;

  // Lower Limbs (Legs, Knees, Feet)
  leftUpperLegRot?: [number, number, number];
  rightUpperLegRot?: [number, number, number];
  leftLowerLegRot?: [number, number, number];
  rightLowerLegRot?: [number, number, number];
  leftFootRot?: [number, number, number];
  rightFootRot?: [number, number, number];

  // Expression Overrides
  expressions?: Partial<Record<VRMExpressionPresetName, number>>;
}

export interface VRMViewerHandle {
  setMood: (mood: CompanionMood) => void;
  playAction: (action: CompanionAction) => void;
  startLipSync: () => void;
  stopLipSync: () => void;
}
