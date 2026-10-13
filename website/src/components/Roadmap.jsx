import Reveal from './Reveal.jsx'

export default function Roadmap() {
  const categories = [
    {
      phase: 'Phase 1: Stable & Released',
      status: 'Stable',
      progress: '100%',
      progressVal: 100,
      class: 'stable',
      items: [
        {
          title: 'Autonomous Core Reasoning',
          desc: 'Set goals and watch the agent plan, execute terminal commands, edit files, and self-correct errors.'
        },
        {
          title: 'Pure Rust Daemon Engine',
          desc: 'High-performance core_v2 daemon with scrypt authentication, session cookies, and Axum WebSocket IPC.'
        },
        {
          title: 'Model Context Protocol (MCP)',
          desc: 'Connect databases, APIs, and file systems. SuperAgent works directly inside your live codebase.'
        }
      ]
    },
    {
      phase: 'Phase 2: Active Development',
      status: 'In Progress',
      progress: '55%',
      progressVal: 55,
      class: 'progress',
      items: [
        {
          title: 'Synced Core Memory & Settings',
          desc: 'Sync settings, model keys, and user profile memories seamlessly between CLI, Web, and Desktop apps.'
        },
        {
          title: 'Voice & Real-Time Audio Mode',
          desc: 'Support speech input and high-quality voice replies, enabling hands-free agent code generation.'
        },
        {
          title: 'One-Click MCP Registry Explorer',
          desc: 'Discover, install, and configure community-built MCP servers directly inside the desktop dashboard.'
        }
      ]
    },
    {
      phase: 'Phase 3: On the Horizon',
      status: 'Planned',
      progress: '15%',
      progressVal: 15,
      class: 'planned',
      items: [
        {
          title: 'Multi-Agent Teamwork Workflows',
          desc: 'Spawn specialized coordinator, debugger, and researcher subagents to collaborate on complex projects.'
        },
        {
          title: 'Deep Local LLM Offline Mode',
          desc: 'Full native integration with Ollama and Llama.cpp. 100% offline agentic coding with zero cloud dependencies.'
        },
        {
          title: 'Self-Hosting VPS Cloud Templates',
          desc: 'Deploy personal, password-secured instances of SuperAgent web server with one click to Railway or VPS.'
        }
      ]
    }
  ]

  return (
    <div className="roadmap-grid">
      {categories.map((cat, i) => (
        <div className="roadmap-card" key={i}>
          <div className="roadmap-header">
            <span className="roadmap-phase">{cat.phase}</span>
            <span className={`roadmap-badge ${cat.class}`}>{cat.status} · {cat.progress}</span>
          </div>

          <div className="roadmap-items">
            {cat.items.map((item, idx) => (
              <div className="roadmap-item" key={idx}>
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
