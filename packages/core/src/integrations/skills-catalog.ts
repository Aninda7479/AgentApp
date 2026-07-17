/**
 * Skill catalog surfaced in Settings → Skills. These are curated/marketplace
 * skills shown as inactive and flagged "Under Development". They are exposed to
 * the renderer through a dedicated `skills-catalog` IPC channel and are kept
 * SEPARATE from the runtime `skills-list` discovery (which feeds the Composer's
 * slash-command autocomplete) so under-development skills never leak into the
 * live command surface.
 */

/** Readiness status surfaced in the Settings UI. */
export type SkillStatus = 'active' | 'under-development' | 'incomplete';

/** Whether the skill was discovered on disk or comes from the curated catalog. */
export type SkillSource = 'discovered' | 'catalog';

/** A single skill entry for the Settings → Skills panel. */
export interface SkillCatalogEntry {
  /** Stable skill id (matches the slash-command name, e.g. `skill-creator`). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Readiness status. Catalog items default to `under-development`. */
  status: SkillStatus;
  /** Origin of the skill. */
  source: SkillSource;
  /** Optional full instructions (only present for discovered skills). */
  instructions?: string;
}

/** The curated skill catalog (all under development for now). */
export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description:
      'Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill\'s description for better triggering accuracy.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'morning',
    name: 'Morning Brief',
    description:
      'Render the user\'s morning brief as a styled HTML artifact, or set it up as a recurring weekday task. Use only when the user explicitly asks to run, see, or set up their morning brief, or if they invoke /morning by name. A question about their day, schedule, or calendar is not by itself a request for the brief; answer it directly instead.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'canvas-design',
    name: 'Canvas Design',
    description:
      'Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Create original visual designs, never copying existing artists\' work to avoid copyright violations.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'web-artifacts-builder',
    name: 'Web Artifacts Builder',
    description:
      'Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'mcp-builder',
    name: 'MCP Builder',
    description:
      'Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'theme-factory',
    name: 'Theme Factory',
    description:
      'Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that you can apply to any artifact that has been creating, or can generate a new theme on-the-fly.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'brand-guidelines',
    name: 'Brand Guidelines',
    description:
      'Applies Anthropic\'s official brand colors and typography to any sort of artifact that may benefit from having Anthropic\'s look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'doc-coauthoring',
    name: 'Doc Co-authoring',
    description:
      'Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'learn',
    name: 'Learn',
    description:
      'Use this skill when the user wants intellectual understanding — learning how or why something works, not getting a task done or soliciting Claude\'s judgment. Trigger for explicit learning requests (teach, explain, ELI5, walk me through, quiz me, flashcards), terse concept names, confusion signals, and learning-path questions. Don\'t trigger for tasks, personal troubleshooting, or evaluative verdicts.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'internal-comms',
    name: 'Internal Comms',
    description:
      'A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'algorithmic-art',
    name: 'Algorithmic Art',
    description:
      'Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code, generative art, algorithmic art, flow fields, or particle systems. Create original algorithmic art rather than copying existing artists\' work to avoid copyright violations.',
    status: 'under-development',
    source: 'catalog'
  },
  {
    id: 'slack-gif-creator',
    name: 'Slack GIF Creator',
    description:
      'Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constraints, validation tools, and animation concepts. Use when users request animated GIFs for Slack.',
    status: 'under-development',
    source: 'catalog'
  }
];
