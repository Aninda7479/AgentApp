import React, { useState } from 'react';
import { Sparkles, StopCircle, Play, Flame, Search, CheckCircle2 } from 'lucide-react';
import type { CompanionAction, AnimationCategory } from './animations';
import { usePartnerMemory } from '../../stores/partnerMemory';

interface AnimationsPanelProps {
  currentAction: CompanionAction;
  onTriggerAction: (action: CompanionAction) => void;
}

interface AnimationCardDef {
  id: CompanionAction;
  label: string;
  emoji: string;
  category: AnimationCategory;
  duration: string;
  desc: string;
  triggerPrompt: string;
}

export const ALL_ANIMATION_OPTIONS: AnimationCardDef[] = [
  // ── 1. Core Idles & Postures (1-12) ──────────────────────────────────────────
  { id: 'idle',                 label: 'Standard Standing Idle',  emoji: '🧍', category: 'Core Idles', duration: 'Looping', desc: 'Breathing naturally with slight shoulder movement and eye gaze tracking.', triggerPrompt: 'Relax and stand naturally' },
  { id: 'idle_relaxed',         label: 'Relaxed Standing',        emoji: '🧘', category: 'Core Idles', duration: 'Looping', desc: 'Weight shifted onto one leg in casual contrapposto.', triggerPrompt: 'Stand relaxed' },
  { id: 'idle_behind_back',     label: 'Hands Behind Back Idle',  emoji: '🎀', category: 'Core Idles', duration: 'Looping', desc: 'Cute, attentive resting pose with arms folded behind waist.', triggerPrompt: 'Rest your hands behind back' },
  { id: 'idle_hips',            label: 'Hands on Hips Idle',      emoji: '🤠', category: 'Core Idles', duration: 'Looping', desc: 'Confident resting posture with hands firmly on hips.', triggerPrompt: 'Put your hands on your hips' },
  { id: 'idle_arms_crossed',    label: 'Arms Crossed Idle',       emoji: '🙅', category: 'Core Idles', duration: 'Looping', desc: 'Closed off or waiting posture with arms folded across chest.', triggerPrompt: 'Cross your arms' },
  { id: 'thinking',             label: 'Thinking Idle',           emoji: '🤔', category: 'Core Idles', duration: 'Looping', desc: 'Hand resting on chin, looking slightly upward thoughtfully.', triggerPrompt: 'Let me think about this...' },
  { id: 'idle_waiting',         label: 'Waiting Impatiently',     emoji: '⏳', category: 'Core Idles', duration: 'Looping', desc: 'Tapping a foot rhythmically and glancing around.', triggerPrompt: 'Waiting patiently' },
  { id: 'idle_sitting_chair',   label: 'Sitting Idle (Chair)',    emoji: '🪑', category: 'Core Idles', duration: 'Looping', desc: 'Seated posture with legs crossed and hands in lap.', triggerPrompt: 'Sit down on a chair' },
  { id: 'idle_sitting_floor',   label: 'Sitting Idle (Floor)',    emoji: '🧘‍♀️', category: 'Core Idles', duration: 'Looping', desc: 'Cross-legged seated pose relaxed on the floor.', triggerPrompt: 'Sit on the floor' },
  { id: 'idle_stretching',      label: 'Stretching Idle',         emoji: '🤸', category: 'Core Idles', duration: '5.0s',    desc: 'Rolling shoulders back and stretching arms loose.', triggerPrompt: 'Do a quick stretch' },
  { id: 'idle_sleepy',          label: 'Sleepy Idle',             emoji: '🥱', category: 'Core Idles', duration: 'Looping', desc: 'Swaying slightly with heavy eyelids and nodding head.', triggerPrompt: 'Feeling sleepy' },
  { id: 'idle_curious',         label: 'Curious Idle',            emoji: '🧐', category: 'Core Idles', duration: 'Looping', desc: 'Leaning forward slightly, looking closely at the screen.', triggerPrompt: 'Take a closer look' },

  // ── 2. Greetings & Farewells (13-23) ─────────────────────────────────────────
  { id: 'wave',                 label: 'Standard Wave',           emoji: '👋', category: 'Greetings', duration: '4.5s',    desc: 'Casual friendly hand wave with warm smiling gaze.', triggerPrompt: 'Hi Kai! Wave at me!' },
  { id: 'wave_energetic',       label: 'Energetic Wave',          emoji: '🌟', category: 'Greetings', duration: '4.5s',    desc: 'Two-handed waving with joyful jumping hops.', triggerPrompt: 'Give me an energetic wave!' },
  { id: 'wave_shy',             label: 'Shy Wave',                emoji: '🙈', category: 'Greetings', duration: '4.0s',    desc: 'Small, low wave near chest with bashful head tilt.', triggerPrompt: 'Give me a shy wave' },
  { id: 'bow',                  label: 'Formal Bow',              emoji: '🙇', category: 'Greetings', duration: '3.2s',    desc: 'Polite respectful greeting bending gracefully at the hips.', triggerPrompt: 'Thank you so much!' },
  { id: 'nod_casual',           label: 'Casual Nod',              emoji: '😎', category: 'Greetings', duration: '2.5s',    desc: 'Quick "What is up" head tilt with confident grin.', triggerPrompt: "What's up Kai?" },
  { id: 'air_hug',              label: 'Air Hug Greeting',        emoji: '🤗', category: 'Greetings', duration: '4.5s',    desc: 'Reaching both arms wide out toward the camera.', triggerPrompt: 'Give me an air hug!' },
  { id: 'kiss_greeting',        label: 'Blowing a Kiss Hello',    emoji: '💋', category: 'Greetings', duration: '3.8s',    desc: 'Welcoming, flirty hello blown from fingers.', triggerPrompt: 'Blow me a kiss!' },
  { id: 'good_morning',         label: 'Sleepy Good Morning',     emoji: '🌅', category: 'Greetings', duration: '4.5s',    desc: 'Rubbing eyes and stretching into a new morning.', triggerPrompt: 'Good morning Kai!' },
  { id: 'goodbye_wave',         label: 'Standard Goodbye Wave',   emoji: '🙋', category: 'Greetings', duration: '5.0s',    desc: 'Slower continuous fond waving goodbye.', triggerPrompt: 'Goodbye Kai!' },
  { id: 'goodbye_reluctant',    label: 'Reluctant Goodbye',       emoji: '🥺', category: 'Greetings', duration: '4.5s',    desc: 'Turning to leave but looking back over shoulder.', triggerPrompt: 'I have to go now...' },
  { id: 'kiss_goodbye',         label: 'Blowing a Kiss Goodbye',  emoji: '😘', category: 'Greetings', duration: '3.8s',    desc: 'Sweet farewell kiss blown outward from palm.', triggerPrompt: 'Blow a goodbye kiss' },

  // ── 3. Affection, Romance & Flirting (24-40) ──────────────────────────────────
  { id: 'kiss_single',          label: 'Single Flying Kiss',      emoji: '💋', category: 'Affection', duration: '3.6s',    desc: 'Kissing two fingers and tossing them forward.', triggerPrompt: 'Send me a kiss!' },
  { id: 'kiss_two_handed',      label: 'Two-Handed Flying Kiss',  emoji: '💕', category: 'Affection', duration: '4.0s',    desc: 'Pushing a flying kiss forward with both palms.', triggerPrompt: 'Send a big kiss with both hands!' },
  { id: 'finger_heart',         label: 'Finger Heart (K-Heart)',  emoji: '🫰', category: 'Affection', duration: '5.0s',    desc: 'Classic Korean crossed-finger heart gesture.', triggerPrompt: 'Show me a finger heart!' },
  { id: 'heart',                label: 'Hand Heart (Small)',      emoji: '💖', category: 'Affection', duration: '5.0s',    desc: 'Creating a cute heart with both hands over the chest.', triggerPrompt: 'Make a heart with your hands!' },
  { id: 'arm_heart_big',        label: 'Arm Heart (Big)',         emoji: '🙆', category: 'Affection', duration: '5.0s',    desc: 'Creating a large heart by curving arms over head.', triggerPrompt: 'Make a big arm heart!' },
  { id: 'air_cuddles',          label: 'Air Cuddles',             emoji: '🫂', category: 'Affection', duration: '4.5s',    desc: 'Wrapping arms around herself and squeezing warmly.', triggerPrompt: 'Air cuddles!' },
  { id: 'blush',                label: 'Shy Blush',               emoji: '😳', category: 'Affection', duration: '4.5s',    desc: 'Looking down, rubbing arm, and smiling bashfully.', triggerPrompt: "You're so cute!" },
  { id: 'wink_smile',           label: 'Eye Wink & Smile',        emoji: '😉', category: 'Affection', duration: '3.5s',    desc: 'Quick confident wink with a playful head tilt.', triggerPrompt: 'Wink at me!' },
  { id: 'hair_flip',            label: 'Seductive Hair Flip',     emoji: '💁‍♀️', category: 'Affection', duration: '4.0s',    desc: 'Brushing hair back gracefully behind the ear.', triggerPrompt: 'Flip your hair!' },
  { id: 'lean_in',              label: 'Leaning In',              emoji: '👂', category: 'Affection', duration: '5.0s',    desc: 'Bringing face closer to the camera to listen attentively.', triggerPrompt: 'Come closer' },
  { id: 'loving_gaze',          label: 'Gazing Lovingly',         emoji: '🥰', category: 'Affection', duration: '6.0s',    desc: 'Soft sustained eye contact with a gentle sway.', triggerPrompt: 'Look at me lovingly' },
  { id: 'lip_bite',             label: 'Lip Bite',                emoji: '🫦', category: 'Affection', duration: '3.5s',    desc: 'Biting the lower lip playfully with a smirk.', triggerPrompt: 'Playful smirk' },
  { id: 'beckon',               label: 'Beckoning',               emoji: '👉', category: 'Affection', duration: '4.0s',    desc: 'Flirty "come here" curl of the index finger.', triggerPrompt: 'Come here!' },
  { id: 'trace_heart',          label: 'Tracing a Heart',         emoji: '✍️', category: 'Affection', duration: '4.5s',    desc: 'Drawing a glowing heart shape in the air with a finger.', triggerPrompt: 'Draw a heart in the air' },
  { id: 'peek_fingers',         label: 'Peeking Through Fingers', emoji: '🫣', category: 'Affection', duration: '4.5s',    desc: 'Covering face but peeking playfully through gaps.', triggerPrompt: 'Peek through your fingers' },
  { id: 'twirl_hair',           label: 'Twirling Hair',           emoji: '💇‍♀️', category: 'Affection', duration: '4.5s',    desc: 'Endlessly twirling a strand of hair around a finger.', triggerPrompt: 'Twirl your hair' },
  { id: 'loving_sigh',          label: 'Deep Loving Sigh',        emoji: '😌', category: 'Affection', duration: '4.5s',    desc: 'Shoulders rise and fall with a contented warm smile.', triggerPrompt: 'Take a happy sigh' },

  // ── 4. Joy, Praise & Excitement (41-53) ──────────────────────────────────────
  { id: 'clap',                 label: 'Happy Clapping',          emoji: '👏', category: 'Joy & Praise', duration: '4.0s', desc: 'Fast excited applause at chest level.', triggerPrompt: 'Give a round of applause!' },
  { id: 'jump_joy',             label: 'Jumping for Joy',         emoji: '🦘', category: 'Joy & Praise', duration: '4.0s', desc: 'Small rapid hops in place with energetic arms.', triggerPrompt: 'Jump for joy!' },
  { id: 'spin',                 label: 'Excited Spin',            emoji: '💫', category: 'Joy & Praise', duration: '3.5s', desc: 'Graceful 360° pirouette spin in place.', triggerPrompt: 'Do a spin!' },
  { id: 'fist_pump',            label: 'Fist Pump',               emoji: '✊', category: 'Joy & Praise', duration: '3.5s', desc: 'Quick "Yes!" victory punch with bent elbow.', triggerPrompt: 'Yes! We did it!' },
  { id: 'laugh',                label: 'Giggle',                  emoji: '🤭', category: 'Joy & Praise', duration: '4.0s', desc: 'Covering mouth with one hand while laughing.', triggerPrompt: 'Tell me a funny joke!' },
  { id: 'laugh_full',           label: 'Full Laugh',              emoji: '🤣', category: 'Joy & Praise', duration: '4.5s', desc: 'Throwing head back with hands on stomach in hearty laughter.', triggerPrompt: 'Burst out laughing!' },
  { id: 'dance',                label: 'Happy Little Dance',      emoji: '💃', category: 'Joy & Praise', duration: 'Looping', desc: 'Rhythmic step-touch groove with hip sway and fluid arms.', triggerPrompt: 'Show me a dance!' },
  { id: 'thumbs_up_double',     label: 'Two Thumbs Up',           emoji: '👍👍', category: 'Joy & Praise', duration: '4.0s', desc: 'Enthusiastic double thumbs-up approval.', triggerPrompt: 'Double thumbs up!' },
  { id: 'thumbs_up_single',     label: 'Single Thumb Up',         emoji: '👍', category: 'Joy & Praise', duration: '3.5s', desc: 'Casual friendly single thumb up approval.', triggerPrompt: 'Thumbs up!' },
  { id: 'sparkly_eyes',         label: 'Sparkly Eyes Reaction',   emoji: '✨', category: 'Joy & Praise', duration: '4.5s', desc: 'Hands clasped under chin in sheer amazement.', triggerPrompt: 'Are you amazed?' },
  { id: 'high_five',            label: 'High Five',               emoji: '✋', category: 'Joy & Praise', duration: '3.0s', desc: 'Slapping palm forward against the camera screen.', triggerPrompt: 'High five!' },
  { id: 'peace',                label: 'Peace Sign Pose',         emoji: '✌️', category: 'Joy & Praise', duration: '4.5s', desc: 'Tilting head and throwing up a V-sign.', triggerPrompt: 'Peace sign pose!' },
  { id: 'cheer',                label: 'Cheering',                emoji: '🎉', category: 'Joy & Praise', duration: '4.5s', desc: 'Raising both hands in the air rapidly in celebration.', triggerPrompt: 'We deployed to production!' },

  // ── 5. Conversational Gestures (54-69) ───────────────────────────────────────
  { id: 'talk_nod',             label: 'Nodding Slowly',          emoji: '😌', category: 'Conversational', duration: '3.5s', desc: 'Active listening and affirmative agreement.', triggerPrompt: 'I agree with you' },
  { id: 'talk_shake_head',      label: 'Shaking Head',            emoji: '🙅', category: 'Conversational', duration: '3.5s', desc: 'Gentle disagreement or saying no.', triggerPrompt: 'No way!' },
  { id: 'talk_shrug',           label: 'Shrugging',               emoji: '🤷', category: 'Conversational', duration: '3.2s', desc: 'Raising shoulders with palms up ("I do not know").', triggerPrompt: "I don't know" },
  { id: 'talk_count_fingers',   label: 'Counting on Fingers',     emoji: '🔢', category: 'Conversational', duration: '4.5s', desc: 'Emphasizing points 1, 2, 3 during an explanation.', triggerPrompt: 'Count on your fingers' },
  { id: 'talk_point_screen',    label: 'Pointing at Screen',      emoji: '🫵', category: 'Conversational', duration: '3.5s', desc: 'Referencing the user directly with index finger.', triggerPrompt: 'You are the best!' },
  { id: 'talk_point_self',      label: 'Pointing at Self',        emoji: '🙋', category: 'Conversational', duration: '3.5s', desc: 'Referencing herself ("Who, me?").', triggerPrompt: 'Are you talking to me?' },
  { id: 'talk_hands',           label: 'Talking with Hands',      emoji: '🗣️', category: 'Conversational', duration: 'Looping', desc: 'Fluid open-palm oratorical speech gestures.', triggerPrompt: 'Explain something to me' },
  { id: 'talk_tilt_head',       label: 'Tilting Head',            emoji: '🤨', category: 'Conversational', duration: '3.5s', desc: 'Looking curious or processing information.', triggerPrompt: 'What do you think?' },
  { id: 'talk_cup_ear',         label: 'Cupping Ear',             emoji: '👂', category: 'Conversational', duration: '4.5s', desc: 'Cupping hand behind ear ("Can you speak louder?").', triggerPrompt: "I can't hear you" },
  { id: 'talk_hand_chest',      label: 'Hand to Chest',           emoji: '🫀', category: 'Conversational', duration: '4.0s', desc: 'Speaking with heartfelt sincerity and emotion.', triggerPrompt: 'From the bottom of my heart' },
  { id: 'talk_wag_finger',      label: 'Wagging Finger',          emoji: '☝️', category: 'Conversational', duration: '4.0s', desc: 'Playful scolding "no, no, no" finger wag.', triggerPrompt: 'No, no, no!' },
  { id: 'talk_eyebrow',         label: 'Raising One Eyebrow',     emoji: '🤨', category: 'Conversational', duration: '3.0s', desc: 'Skeptical or unconvinced quizzical expression.', triggerPrompt: 'Really now?' },
  { id: 'talk_deep_breath',     label: 'Deep Breath In & Out',    emoji: '🌬️', category: 'Conversational', duration: '4.0s', desc: 'Calming down or preparing to speak.', triggerPrompt: 'Take a deep breath' },
  { id: 'talk_look_around',     label: 'Looking Around',          emoji: '👀', category: 'Conversational', duration: '4.0s', desc: 'Distracted or checking the environment.', triggerPrompt: 'Look around the room' },
  { id: 'talk_whisper',         label: 'Whisper Pose',            emoji: '🤫', category: 'Conversational', duration: '4.5s', desc: 'Shielding mouth with hand to share a secret.', triggerPrompt: "It's a secret..." },
  { id: 'talk_interruption',    label: 'Polite Interruption',     emoji: '✋', category: 'Conversational', duration: '3.5s', desc: 'Raising one hand slightly with a brief inhale.', triggerPrompt: 'Excuse me a second' },

  // ── 6. Playful, Teasing & Sassy (70-80) ──────────────────────────────────────
  { id: 'pout',                 label: 'Playful Pout',            emoji: '😾', category: 'Playful & Sassy', duration: '4.5s', desc: 'Crossing arms and pushing out lower lip.', triggerPrompt: "Don't ignore me!" },
  { id: 'tongue_out',           label: 'Sticking Tongue Out',     emoji: '😛', category: 'Playful & Sassy', duration: '3.5s', desc: 'Quick "blep" tease with a wink.', triggerPrompt: 'Blep!' },
  { id: 'eyeroll',              label: 'Eyeroll & Smirk',         emoji: '🙄', category: 'Playful & Sassy', duration: '3.5s', desc: 'Sassy dismissal of a joke with half-smirk.', triggerPrompt: 'Oh please!' },
  { id: 'fake_yawn',            label: 'Fake Yawn',               emoji: '🥱', category: 'Playful & Sassy', duration: '4.0s', desc: 'Pretending to be dramatically bored.', triggerPrompt: 'So boring...' },
  { id: 'peekaboo',             label: 'Peek-a-boo',              emoji: '🙈', category: 'Playful & Sassy', duration: '3.5s', desc: 'Covering and uncovering face with joy.', triggerPrompt: 'Peek-a-boo!' },
  { id: 'watching_you',         label: '"I\'m Watching You"',     emoji: '👁️', category: 'Playful & Sassy', duration: '3.8s', desc: 'Pointing two fingers at eyes, then at camera.', triggerPrompt: "I'm watching you!" },
  { id: 'playful_punch',        label: 'Playful Punch',           emoji: '👊', category: 'Playful & Sassy', duration: '3.0s', desc: 'Throwing a soft slow-motion punch at the screen.', triggerPrompt: 'Take that!' },
  { id: 'mic_drop',             label: 'Pretend Mic Drop',        emoji: '🎤', category: 'Playful & Sassy', duration: '3.6s', desc: 'Dropping an invisible microphone after clever remark.', triggerPrompt: 'Mic drop!' },
  { id: 'dust_shoulders',       label: 'Dusting Shoulders',       emoji: '🧥', category: 'Playful & Sassy', duration: '4.0s', desc: 'Brushing imaginary dust off jacket shoulders.', triggerPrompt: 'Too easy!' },
  { id: 'look_nails',           label: 'Looking at Nails',        emoji: '💅', category: 'Playful & Sassy', duration: '4.5s', desc: 'Feigning disinterest or acting aloof.', triggerPrompt: 'Whatever...' },
  { id: 'neko',                 label: 'Cat Paws Pose',           emoji: '🐱', category: 'Playful & Sassy', duration: '5.0s', desc: 'Holding hands up like kitty paws with "Nya!".', triggerPrompt: 'Meow like a cat!' },

  // ── 7. Negative Emotions & Vulnerability (81-93) ─────────────────────────────
  { id: 'sad_sigh',             label: 'Sad Sigh',                emoji: '😞', category: 'Negative & Vulnerable', duration: '4.5s', desc: 'Slumping shoulders and looking down dejectedly.', triggerPrompt: 'I feel sad' },
  { id: 'crying',               label: 'Crying',                  emoji: '😭', category: 'Negative & Vulnerable', duration: '5.0s', desc: 'Wiping tears away from eyes with trembling hands.', triggerPrompt: "Don't cry Kai" },
  { id: 'sulking',              label: 'Sulking',                 emoji: '🙍‍♀️', category: 'Negative & Vulnerable', duration: '5.0s', desc: 'Turning 45° away from camera and pouting.', triggerPrompt: "I'm not talking to you" },
  { id: 'startled',             label: 'Startled',                emoji: '😱', category: 'Negative & Vulnerable', duration: '2.5s', desc: 'Jumping back with hands up in surprise/shock.', triggerPrompt: 'Boo!' },
  { id: 'shivering',            label: 'Shivering',               emoji: '🥶', category: 'Negative & Vulnerable', duration: '5.0s', desc: 'Wrapping arms around self as if cold or scared.', triggerPrompt: "It's so cold..." },
  { id: 'angry_stomp',          label: 'Angry Stomp',             emoji: '😤', category: 'Negative & Vulnerable', duration: '3.5s', desc: 'Crossing arms and stomping foot in frustration.', triggerPrompt: 'So annoying!' },
  { id: 'facepalm',             label: 'Facepalm',                emoji: '🤦‍♀️', category: 'Negative & Vulnerable', duration: '4.0s', desc: 'Dropping head into hand in disappointment.', triggerPrompt: 'Facepalm...' },
  { id: 'anxious_fidget',       label: 'Anxious Fidgeting',       emoji: '😰', category: 'Negative & Vulnerable', duration: '5.0s', desc: 'Wringing hands together nervously.', triggerPrompt: "I'm nervous..." },
  { id: 'pacing',               label: 'Pacing',                  emoji: '🚶‍♀️', category: 'Negative & Vulnerable', duration: '6.0s', desc: 'Walking two steps left and two steps right restlessly.', triggerPrompt: 'Pacing around' },
  { id: 'pleading',             label: 'Pleading',                emoji: '🥺', category: 'Negative & Vulnerable', duration: '4.5s', desc: 'Clasping hands together begging earnestly.', triggerPrompt: 'Please please please!' },
  { id: 'curling_up',           label: 'Curling Up',              emoji: '🧎‍♀️', category: 'Negative & Vulnerable', duration: '5.0s', desc: 'Huddling into a ball on the floor.', triggerPrompt: 'Curl up into a ball' },
  { id: 'trembling_lip',        label: 'Trembling Lip',           emoji: '😢', category: 'Negative & Vulnerable', duration: '4.5s', desc: 'Looking up with glassy eyes holding back tears.', triggerPrompt: 'Holding back tears' },
  { id: 'embarrassed_hide',     label: 'Embarrassed Hide',        emoji: '🙈', category: 'Negative & Vulnerable', duration: '4.5s', desc: 'Covering entire blushing face with both hands.', triggerPrompt: "I'm so embarrassed!" },

  // ── 8. Interactive & Touch Reactions (94-104) ─────────────────────────────────
  { id: 'react_headpat',        label: 'Head Pat Reaction',       emoji: '🥰', category: 'Interactive Touch', duration: '4.5s', desc: 'Closing eyes, smiling, and leaning into touch.', triggerPrompt: 'Pat on the head' },
  { id: 'react_poke',           label: 'Cheek Poke Reaction',     emoji: '😳', category: 'Interactive Touch', duration: '2.5s', desc: 'Surprised blink, pulling head back slightly.', triggerPrompt: 'Poke cheek' },
  { id: 'react_tickle',         label: 'Tickle Reaction',         emoji: '😆', category: 'Interactive Touch', duration: '4.0s', desc: 'Squirming, protecting ribs, and laughing.', triggerPrompt: 'Tickle tickle!' },
  { id: 'react_tap_surprise',   label: 'Screen Tap Surprise',     emoji: '😯', category: 'Interactive Touch', duration: '2.0s', desc: 'Blinking fast and flinching slightly on screen tap.', triggerPrompt: 'Screen tap' },
  { id: 'react_stroke_hair',    label: 'Stroking Hair Reaction',  emoji: '😌', category: 'Interactive Touch', duration: '4.5s', desc: 'Relaxing shoulders with a soft contented smile.', triggerPrompt: 'Stroke hair' },
  { id: 'react_arm_touch',      label: 'Arm Touch Reaction',      emoji: '😮', category: 'Interactive Touch', duration: '3.0s', desc: 'Turning head quickly to look at the tapped arm.', triggerPrompt: 'Touch arm' },
  { id: 'react_boop',           label: 'Nose Boop Reaction',      emoji: '🤪', category: 'Interactive Touch', duration: '2.5s', desc: 'Crossed eyes looking at nose, then giggles.', triggerPrompt: 'Boop the nose!' },
  { id: 'react_ear_pull',       label: 'Ear Pull Reaction',       emoji: '😣', category: 'Interactive Touch', duration: '3.5s', desc: 'Flinching, saying "ouch," and rubbing ear.', triggerPrompt: 'Pull ear' },
  { id: 'react_hug',            label: 'Hug Squeeze Reaction',    emoji: '🤗', category: 'Interactive Touch', duration: '4.5s', desc: 'Hugging back tightly with happy expression.', triggerPrompt: 'Give me a tight hug!' },
  { id: 'react_dizzy',          label: 'Device Shake / Dizziness',emoji: '😵', category: 'Interactive Touch', duration: '4.5s', desc: 'Swaying unsteadily with spiral eyes from shake.', triggerPrompt: 'Getting dizzy' },
  { id: 'react_swipe',          label: 'Screen Swipe Reaction',   emoji: '👀', category: 'Interactive Touch', duration: '3.5s', desc: 'Following user finger smoothly with eyes/head.', triggerPrompt: 'Swipe across screen' },

  // ── 9. Daily Routines, Props & Activities (105-125) ──────────────────────────
  { id: 'routine_yawn',           label: 'Yawning',               emoji: '🥱', category: 'Daily Routines', duration: '5.0s', desc: 'Covering mouth and stretching arms wide.', triggerPrompt: 'Big yawn' },
  { id: 'routine_fall_asleep',    label: 'Falling Asleep',        emoji: '😪', category: 'Daily Routines', duration: '4.5s', desc: 'Head slowly drops, then snaps back up awake.', triggerPrompt: 'Doze off' },
  { id: 'routine_sleeping',       label: 'Sleeping',              emoji: '😴', category: 'Daily Routines', duration: 'Looping', desc: 'Deep rhythmic breathing loop with eyes closed.', triggerPrompt: 'Go to sleep' },
  { id: 'routine_phone',          label: 'Holding Phone',         emoji: '📱', category: 'Daily Routines', duration: '6.0s', desc: 'Scrolling with thumb, occasionally smiling.', triggerPrompt: 'Check your phone' },
  { id: 'routine_selfie',         label: 'Taking a Selfie',       emoji: '🤳', category: 'Daily Routines', duration: '4.5s', desc: 'Extending arm posing with camera flash effect.', triggerPrompt: 'Take a selfie!' },
  { id: 'routine_listen_music',   label: 'Listening to Music',    emoji: '🎧', category: 'Daily Routines', duration: '6.0s', desc: 'Bobbing head rhythmically to imaginary headphones.', triggerPrompt: 'Listen to music' },
  { id: 'routine_coffee',         label: 'Drinking Coffee/Tea',   emoji: '☕', category: 'Daily Routines', duration: '4.8s', desc: 'Blowing on cup, taking a sip, and "Ah" breath.', triggerPrompt: 'Drink some coffee' },
  { id: 'routine_book',           label: 'Reading a Book',        emoji: '📖', category: 'Daily Routines', duration: '6.0s', desc: 'Looking down and turning an invisible page.', triggerPrompt: 'Read a book' },
  { id: 'routine_adjust_glasses', label: 'Adjusting Glasses/Hair',emoji: '👓', category: 'Daily Routines', duration: '3.5s', desc: 'Pushing up glasses bridge or fixing hair.', triggerPrompt: 'Adjust your glasses' },
  { id: 'routine_check_watch',    label: 'Checking Watch',        emoji: '⌚', category: 'Daily Routines', duration: '4.0s', desc: 'Looking at wrist and tapping foot checking time.', triggerPrompt: 'What time is it?' },
  { id: 'routine_makeup',         label: 'Applying Makeup',       emoji: '💄', category: 'Daily Routines', duration: '5.0s', desc: 'Holding compact mirror and applying lipstick.', triggerPrompt: 'Put on some makeup' },
  { id: 'routine_pet_animal',     label: 'Petting an Animal',     emoji: '🐾', category: 'Daily Routines', duration: '5.0s', desc: 'Crouching down to pet an invisible pet.', triggerPrompt: 'Pet the cat' },
  { id: 'routine_exercise',       label: 'Exercising / Yoga',     emoji: '🧘', category: 'Daily Routines', duration: 'Looping', desc: 'Dynamic balance yoga stretch pose.', triggerPrompt: 'Do some yoga' },
  { id: 'routine_snack',          label: 'Eating a Snack',        emoji: '🍪', category: 'Daily Routines', duration: '4.5s', desc: 'Taking a bite of imaginary food and chewing.', triggerPrompt: 'Have a snack' },
  { id: 'routine_cooking',        label: 'Cooking / Stirring',    emoji: '🍳', category: 'Daily Routines', duration: '5.0s', desc: 'Miming stirring a pot or bowl.', triggerPrompt: 'Cook something delicious' },
  { id: 'routine_typing',         label: 'Writing / Typing',      emoji: '💻', category: 'Daily Routines', duration: 'Looping', desc: 'Tapping fast on invisible keyboard.', triggerPrompt: 'Type on keyboard' },
  { id: 'routine_jacket',         label: 'Putting on a Jacket',   emoji: '🧥', category: 'Daily Routines', duration: '4.5s', desc: 'Slipping arms into imaginary sleeves and zipping.', triggerPrompt: 'Put on your jacket' },
  { id: 'routine_smell_flowers',  label: 'Smelling Flowers',      emoji: '🌸', category: 'Daily Routines', duration: '4.0s', desc: 'Leaning down, taking deep inhale, and smiling.', triggerPrompt: 'Smell the flowers' },
  { id: 'routine_catch_bug',      label: 'Catching a Bug',        emoji: '🦋', category: 'Daily Routines', duration: '4.0s', desc: 'Clapping hands together to catch, peeking inside.', triggerPrompt: 'Catch a butterfly' },
  { id: 'routine_tie_shoes',      label: 'Tying Shoes',           emoji: '👟', category: 'Daily Routines', duration: '4.5s', desc: 'Bending down fumbling with laces, standing up.', triggerPrompt: 'Tie your shoes' },
  { id: 'routine_look_sky',       label: 'Looking at the Sky',    emoji: '🌤️', category: 'Daily Routines', duration: '4.5s', desc: 'Shielding eyes from sun and looking upward.', triggerPrompt: 'Look at the sky' },
];

const CATEGORIES: ('All' | AnimationCategory)[] = [
  'All',
  'Core Idles',
  'Greetings',
  'Affection',
  'Joy & Praise',
  'Conversational',
  'Playful & Sassy',
  'Negative & Vulnerable',
  'Interactive Touch',
  'Daily Routines',
];

export const AnimationsPanel: React.FC<AnimationsPanelProps> = ({ currentAction, onTriggerAction }) => {
  const memory = usePartnerMemory();
  const [selectedCategory, setSelectedCategory] = useState<'All' | AnimationCategory>('All');
  const [search, setSearch] = useState('');

  const filtered = ALL_ANIMATION_OPTIONS.filter(anim => {
    const matchCat = selectedCategory === 'All' || anim.category === selectedCategory;
    const matchSearch =
      anim.label.toLowerCase().includes(search.toLowerCase()) ||
      anim.desc.toLowerCase().includes(search.toLowerCase()) ||
      anim.category.toLowerCase().includes(search.toLowerCase()) ||
      anim.triggerPrompt.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 text-slate-100 select-none scrollbar-none">
      {/* Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-950/50 via-purple-900/30 to-slate-900/60 border border-indigo-500/30 p-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold text-slate-100">Motion & Animation Catalog ({ALL_ANIMATION_OPTIONS.length})</h2>
          </div>
          {currentAction !== 'idle' && (
            <button
              onClick={() => onTriggerAction('idle')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-[11px] font-bold transition-all cursor-pointer"
            >
              <StopCircle size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-300 leading-snug">
          Trigger live 3D animation routines for {memory.companionName}, click the avatar on stage, or type keywords in chat!
        </p>

        {/* Search Input */}
        <div className="relative mt-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search 125 animations (dance, wave, heart, selfie, pet, yawn...)"
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map(cat => {
          const count = cat === 'All'
            ? ALL_ANIMATION_OPTIONS.length
            : ALL_ANIMATION_OPTIONS.filter(a => a.category === cat).length;

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5
                ${selectedCategory === cat
                  ? 'bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'}`}
            >
              <span>{cat}</span>
              <span className={`text-[9px] px-1 rounded-full ${selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Animation Cards Grid */}
      <div className="space-y-2">
        {filtered.map(anim => {
          const isActive = currentAction === anim.id;

          return (
            <div
              key={anim.id}
              className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 group
                ${isActive
                  ? 'bg-indigo-950/60 border-pink-500/60 ring-1 ring-pink-400/50 shadow-lg'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/80 hover:bg-slate-900/70'}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-2xl shrink-0 mt-0.5">{anim.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-xs font-bold text-slate-100">{anim.label}</h3>
                    <span className="px-1.5 py-0.2 rounded-md bg-slate-800/80 border border-slate-700 text-[9px] font-mono text-slate-300">
                      {anim.duration}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-pink-400 animate-pulse">
                        <Flame size={10} /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{anim.desc}</p>
                  <div className="mt-1.5 text-[10px] text-indigo-300/80 font-mono">
                    Chat trigger: <em>"{anim.triggerPrompt}"</em>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onTriggerAction(anim.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 cursor-pointer
                  ${isActive
                    ? 'bg-pink-600 text-white shadow-md'
                    : 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white'}`}
              >
                {isActive ? (
                  <>
                    <CheckCircle2 size={12} />
                    <span>Playing</span>
                  </>
                ) : (
                  <>
                    <Play size={11} />
                    <span>Play</span>
                  </>
                )}
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-center py-6 text-xs text-slate-500 italic">
            No animations found matching "{search}".
          </p>
        )}
      </div>
    </div>
  );
};
