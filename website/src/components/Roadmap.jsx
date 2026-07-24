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
          title: 'Multidevice Responsive UI',
          desc: 'Adapts seamlessly from phone to widescreen. Secure VPS login system enables remote hosting.'
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
      progress: '45%',
      progressVal: 45,
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
      progress: '0%',
      progressVal: 0,
      class: 'planned',
      items: [
        {
          title: 'Multi-Agent Teamwork Workflows',
          desc: 'Spawn specialized coordinator, debugger, and researcher subagents to collaborate on complex projects.'
        },
        {
          title: 'Self-Hosting VPS Cloud Templates',
          desc: 'Deploy personal, password-secured instances of SuperAgent web server with one click to Railway or Vercel.'
        },
        {
          title: 'Deep Local LLM Offline Mode',
          desc: 'Full native integration with Ollama and Llama.cpp. 100% offline agentic coding with zero third-party dependencies.'
        }
      ]
    }
  ]

  return (
    <section id="roadmap" style={{ background: 'linear-gradient(180deg, #0d1f1a 0%, #0a0f1f 100%)', width: '100%', overflow: 'hidden' }}>
      <div className="section container">
        <Reveal className="roadmap-section">
          <div className="sec-head text-center mx-auto" style={{ maxWidth: '65ch' }}>
            <p className="eyebrow">Roadmap</p>
            <h2 className="h-section">Future & Coming Features</h2>
            <p className="lead">
              SuperAgent is constantly evolving. Here is a look at what features are stable, what we are actively building, and what is planned next.
            </p>
          </div>

          <div className="roadmap-grid">
            {categories.map((cat, i) => (
              <div className={`roadmap-col ${cat.class}`} key={i}>
                <div className="roadmap-col-header">
                  <div className="header-meta">
                    <div className="phase-title">{cat.phase}</div>
                    <span className={`status-pill ${cat.class}`}>{cat.status}</span>
                  </div>
                  <div className="progress-ring-container">
                    <svg className="progress-ring" width="36" height="36" viewBox="0 0 36 36">
                      <circle className="progress-ring-bg" cx="18" cy="18" r="14" fill="none" strokeWidth="3" />
                      <circle 
                        className={`progress-ring-fill ${cat.class}`} 
                        cx="18" 
                        cy="18" 
                        r="14" 
                        fill="none" 
                        strokeWidth="3" 
                        strokeDasharray="87.96"
                        strokeDashoffset={87.96 - (87.96 * cat.progressVal) / 100}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                      />
                    </svg>
                    <span className="progress-percentage">{cat.progress}</span>
                  </div>
                </div>
                <div className="roadmap-items">
                  {cat.items.map((item, idx) => (
                    <div className="roadmap-item-card" key={idx}>
                      <div className="card-indicator"></div>
                      <h4>{item.title}</h4>
                      <p>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
