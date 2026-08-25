import type { CompanionAction } from './types';

/**
 * Standard durations (in seconds) for finite non-looping companion actions.
 * Looping postures/idles omit a duration or resolve to undefined.
 */
export const ACTION_DURATIONS: Partial<Record<CompanionAction, number>> = {
  // 1. Core Idles (finite variants)
  idle_stretching: 5.0,

  // 2. Greetings & Farewells
  wave: 4.5,
  wave_energetic: 4.5,
  wave_shy: 4.0,
  bow: 3.2,
  nod_casual: 2.5,
  air_hug: 4.5,
  kiss_greeting: 3.8,
  good_morning: 4.5,
  goodbye_wave: 5.0,
  goodbye_reluctant: 4.5,
  kiss_goodbye: 3.8,

  // 3. Affection, Romance & Flirting
  kiss_single: 3.6,
  kiss_two_handed: 4.0,
  finger_heart: 5.0,
  heart: 5.0,
  arm_heart_big: 5.0,
  air_cuddles: 4.5,
  blush: 4.5,
  wink_smile: 3.5,
  hair_flip: 4.0,
  lean_in: 5.0,
  loving_gaze: 6.0,
  lip_bite: 3.5,
  beckon: 4.0,
  trace_heart: 4.5,
  peek_fingers: 4.5,
  twirl_hair: 4.5,
  loving_sigh: 4.5,

  // 4. Joy, Praise & Excitement
  clap: 4.0,
  jump_joy: 4.0,
  spin: 3.5,
  fist_pump: 3.5,
  laugh: 4.0,
  laugh_full: 4.5,
  thumbs_up_double: 4.0,
  thumbs_up_single: 3.5,
  sparkly_eyes: 4.5,
  high_five: 3.0,
  peace: 4.5,
  cheer: 4.5,

  // 5. Conversational Gestures
  talk_nod: 3.5,
  talk_shake_head: 3.5,
  talk_shrug: 3.2,
  talk_count_fingers: 4.5,
  talk_point_screen: 3.5,
  talk_point_self: 3.5,
  talk_tilt_head: 3.5,
  talk_cup_ear: 4.5,
  talk_hand_chest: 4.0,
  talk_wag_finger: 4.0,
  talk_eyebrow: 3.0,
  talk_deep_breath: 4.0,
  talk_look_around: 4.0,
  talk_whisper: 4.5,
  talk_interruption: 3.5,

  // 6. Playful, Teasing & Sassy
  pout: 4.5,
  tongue_out: 3.5,
  eyeroll: 3.5,
  fake_yawn: 4.0,
  peekaboo: 3.5,
  watching_you: 3.8,
  playful_punch: 3.0,
  mic_drop: 3.6,
  dust_shoulders: 4.0,
  look_nails: 4.5,
  neko: 5.0,

  // 7. Negative Emotions & Vulnerability
  sad_sigh: 4.5,
  crying: 5.0,
  sulking: 5.0,
  startled: 2.5,
  shivering: 5.0,
  angry_stomp: 3.5,
  facepalm: 4.0,
  anxious_fidget: 5.0,
  pacing: 6.0,
  pleading: 4.5,
  curling_up: 5.0,
  trembling_lip: 4.5,
  embarrassed_hide: 4.5,

  // 8. Interactive & Touch Reactions
  react_headpat: 4.5,
  react_poke: 2.5,
  react_tickle: 4.0,
  react_tap_surprise: 2.0,
  react_stroke_hair: 4.5,
  react_arm_touch: 3.0,
  react_boop: 2.5,
  react_ear_pull: 3.5,
  react_hug: 4.5,
  react_dizzy: 4.5,
  react_swipe: 3.5,

  // 9. Daily Routines, Props & Activities
  routine_yawn: 5.0,
  routine_fall_asleep: 4.5,
  routine_phone: 6.0,
  routine_selfie: 4.5,
  routine_listen_music: 6.0,
  routine_coffee: 4.8,
  routine_book: 6.0,
  routine_adjust_glasses: 3.5,
  routine_check_watch: 4.0,
  routine_makeup: 5.0,
  routine_pet_animal: 5.0,
  routine_snack: 4.5,
  routine_cooking: 5.0,
  routine_jacket: 4.5,
  routine_smell_flowers: 4.0,
  routine_catch_bug: 4.0,
  routine_tie_shoes: 4.5,
  routine_look_sky: 4.5,

  // Legacy aliases
  salute: 4.0,
  stretch: 6.0,
  listen: 5.0,
};
