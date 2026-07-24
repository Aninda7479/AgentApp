export const featureCategories = [
  {
    id: 'orchestration',
    name: '🤖 AI Core & Orchestration',
    desc: 'The central brains and reasoning loops that power autonomous operations.',
    features: [
      {
        title: 'Autonomous workflows',
        body: 'Multi-step reasoning, execution, and self-correction. Set a goal, and the agent plans, acts, and fixes its own mistakes.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" />
          </svg>
        )
      },
      {
        title: 'Multi-Provider BYOK',
        body: 'Bring Your Own Key for OpenAI, Anthropic, Gemini, or custom servers. Automatically switches models dynamically based on cost and capability.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )
      },
      {
        title: 'Best-of-N & Task Classifier',
        body: 'Classifies task difficulty, routes queries to the optimal model pool, and samples multiple outputs to deliver the highest quality code.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><polygon points="2 17 12 22 22 17" /><polygon points="2 12 12 17 22 12" />
          </svg>
        )
      },
      {
        title: 'Self-Correction Loop',
        body: 'Encountered a compile error, broken unit test, or shell pipeline failure? The agent reads the trace, adjusts its plan, and retries.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        )
      }
    ]
  },
  {
    id: 'integration',
    name: '🔌 Integrations & Tools',
    desc: 'Connecting your local systems, databases, APIs, and browsers directly to the AI.',
    features: [
      {
        title: 'Model Context Protocol (MCP)',
        body: 'Connect databases, APIs, or custom servers via standard stdio, SSE, or HTTP. The agent reaches beyond chat into your live tools.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7H6a3 3 0 0 0 0 6h3M15 17h3a3 3 0 0 0 0-6h-3M8 12h8" />
          </svg>
        )
      },
      {
        title: 'Browser Automation',
        body: 'Drives standard browser sessions — clicks elements, fills forms, scrapes data, and takes screenshots — as steps inside a task.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
        )
      },
      {
        title: 'Interactive Artifacts',
        body: 'Create, edit, and preview standalone markdown documents, interactive React UIs, SVGs, or diagram blueprints directly inside sandbox visual panels.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        )
      },
      {
        title: 'Sandbox Workspaces',
        body: 'Runs terminal commands and modifies workspace files within secure, isolated directories, keeping your main machine safe.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M21 12H3M12 3v18" />
          </svg>
        )
      }
    ]
  },
  {
    id: 'memory',
    name: '🧠 Memory & Search',
    desc: 'Local-first indexers and token compactor pipelines for deep file parsing.',
    features: [
      {
        title: 'Vector Database Retrieval',
        body: 'Embeds and searches local workspace directories using highly optimized, light embeddings, bringing relevant context fast.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )
      },
      {
        title: 'Long-Term Skill Learning',
        body: 'Saves user preferences, profile details, and learns new shell commands automatically from successful past executions.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z" />
          </svg>
        )
      },
      {
        title: 'Token context compactor',
        body: 'Automatically summarizes long chat histories and filters redundant stack traces to save token costs and prevent context overflow.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        )
      },
      {
        title: 'Local Privacy Vault',
        body: 'Saves keys and credentials in encrypted configs on disk. Runs completely off-network when local models are active.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        )
      }
    ]
  },
  {
    id: 'media',
    name: '🎨 Multimodal & Media',
    desc: 'Processing images, voice feeds, slides, and videos natively within the agent.',
    features: [
      {
        title: 'Image Vision Processor',
        body: 'Locates buttons, fields, and chart components on pages, drawing OCR bounding boxes for visual verification.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L5 21" />
          </svg>
        )
      },
      {
        title: 'AI PDF & PPT Compilers',
        body: 'Outlines, compiles, and designs polished presentation slides and multi-page reports natively.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
          </svg>
        )
      },
      {
        title: 'Speech-to-Text / TTS',
        body: 'Converts audio tracks to transcriptions and responds in high-quality spoken voice alerts, ideal for remote alerts.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
          </svg>
        )
      },
      {
        title: 'Video Frame Generator',
        body: 'Generates clips and outlines sequences, saving outputs into local cache galleries for visual logs.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
          </svg>
        )
      },
      {
        title: '3D Interactive companion',
        body: 'Integrates an optional 3D floating character companion window reacting to tool calls, successes, and errors.',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" /><line x1="12" y1="22" x2="12" y2="12" /><line x1="12" y1="12" x2="22" y2="8.5" /><line x1="12" y1="12" x2="2" y2="8.5" /><polyline points="22 8.5 12 12 2 8.5" /><polyline points="2 15.5 12 12 22 15.5" />
          </svg>
        )
      }
    ]
  }
]
