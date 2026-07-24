import { useState, useEffect } from 'react'
import Reveal from './Reveal.jsx'

export default function FeatureShowcase() {
  const [activeTab, setActiveTab] = useState('sandbox')
  const [browserStep, setBrowserStep] = useState(0)
  const [sandboxLine, setSandboxLine] = useState(0)
  
  // Interactive sub-states
  const [editorTab, setEditorTab] = useState('test_auth')
  const [mcpNode, setMcpNode] = useState('core')
  const [visionImage, setVisionImage] = useState('dashboard')
  const [artifactTab, setArtifactTab] = useState('preview')

  // Autoplay browser steps
  useEffect(() => {
    if (activeTab !== 'browser') return
    const timer = setInterval(() => {
      setBrowserStep((prev) => (prev + 1) % 4)
    }, 3200)
    return () => clearInterval(timer)
  }, [activeTab])

  // Autoplay terminal log steps
  useEffect(() => {
    if (activeTab !== 'sandbox') return
    const timer = setInterval(() => {
      setSandboxLine((prev) => (prev + 1) % 5)
    }, 2800)
    return () => clearInterval(timer)
  }, [activeTab])

  const renderSandbox = () => {
    const logs = [
      { type: 'cmd', text: 'npx @superagent/cli run test_auth.py' },
      { type: 'err', text: '✖ AssertionError: assert response.status_code == 200 (received 401)' },
      { type: 'agent', text: '💡 [SuperAgent] Detected authorization header missing. Modifying test_auth.py...' },
      { type: 'cmd', text: 'git diff test_auth.py' },
      { type: 'ok', text: '✔ test_auth.py updated. All 5 tests passed successfully!' }
    ]

    return (
      <div className="showcase-content mock-terminal">
        <div className="mock-header">
          <div className="dots">
            <span className="dot-red"></span>
            <span className="dot-yellow"></span>
            <span className="dot-green"></span>
          </div>
          <div className="mock-title">Sandboxed Shell - File Editor & Execution</div>
        </div>
        <div className="mock-body">
          <div className="code-editor-header">
            <button 
              className={`file-tab ${editorTab === 'test_auth' ? 'active' : ''}`}
              onClick={() => setEditorTab('test_auth')}
            >
              📄 test_auth.py
            </button>
            <button 
              className={`file-tab ${editorTab === 'auth_service' ? 'active' : ''}`}
              onClick={() => setEditorTab('auth_service')}
            >
              📄 auth_service.py
            </button>
            <button 
              className={`file-tab ${editorTab === 'config' ? 'active' : ''}`}
              onClick={() => setEditorTab('config')}
            >
              ⚙ config.json
            </button>
          </div>
          <div className="editor-lines">
            {editorTab === 'test_auth' && (
              <>
                <div className="editor-line"><span className="ln">1</span><code><span className="keyword">def</span> <span className="fn">test_login_success</span>(client):</code></div>
                <div className="editor-line"><span className="ln">2</span><code>    response = client.post(<span className="str">"/api/login"</span>, json=<span className="str">{"{}"}</span>)</code></div>
                <div className="editor-line highlighted-edit"><span className="ln">3</span><code><span className="diff-add">+   headers = {"{"}<span className="str">"Authorization"</span>: <span className="str">"Bearer test-token"</span>{"}"}</span></code></div>
                <div className="editor-line"><span className="ln">4</span><code>    response = client.get(<span className="str">"/api/dashboard"</span>, headers=headers)</code></div>
              </>
            )}
            {editorTab === 'auth_service' && (
              <>
                <div className="editor-line"><span className="ln">1</span><code><span className="keyword">class</span> <span className="fn">AuthService</span>:</code></div>
                <div className="editor-line"><span className="ln">2</span><code>    <span className="keyword">def</span> <span className="fn">validate_token</span>(self, token: str):</code></div>
                <div className="editor-line"><span className="ln">3</span><code>        <span className="keyword">return</span> token == <span className="str">"test-token"</span></code></div>
              </>
            )}
            {editorTab === 'config' && (
              <>
                <div className="editor-line"><span className="ln">1</span><code>{"{"}</code></div>
                <div className="editor-line"><span className="ln">2</span><code>  <span className="str">"sandbox"</span>: <span className="keyword">true</span>,</code></div>
                <div className="editor-line"><span className="ln">3</span><code>  <span className="str">"allow_commands"</span>: [<span className="str">"pytest"</span>, <span className="str">"git"</span>, <span className="str">"python"</span>]</code></div>
                <div className="editor-line"><span className="ln">4</span><code>{"}"}</code></div>
              </>
            )}
          </div>
          <div className="terminal-panel">
            <div className="terminal-header">Terminal Console Output</div>
            <div className="terminal-content">
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={`terminal-log ${l.type} ${i <= sandboxLine ? 'visible' : 'hidden'}`}
                >
                  {l.type === 'cmd' && <span className="term-prompt">superagent $ </span>}
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderBrowser = () => {
    const steps = [
      { action: 'Navigate to page', url: 'https://news.ycombinator.com', status: 'Loading news list...' },
      { action: 'Locate query selector', url: 'https://news.ycombinator.com', status: 'Targeting article headings...' },
      { action: 'Filter text matches', url: 'https://news.ycombinator.com', status: 'Filtering results containing "Agent" (2 found)...' },
      { action: 'Capture page screenshot', url: 'https://news.ycombinator.com', status: 'Saving screenshot.png...' }
    ]

    return (
      <div className="showcase-content mock-browser">
        <div className="mock-header">
          <div className="dots">
            <span className="dot-red"></span>
            <span className="dot-yellow"></span>
            <span className="dot-green"></span>
          </div>
          <div className="browser-address-bar">
            <span className="lock-icon">🔒</span>
            <input type="text" readOnly value={steps[browserStep].url} />
            <span className="refresh-icon">🔄</span>
          </div>
        </div>
        <div className="browser-viewport">
          <div className="browser-banner">
            <strong>Browser Driver Active</strong> - Controlled by SuperAgent Autopilot
          </div>
          <div className="browser-inner-content">
            <div className="hn-header">
              <span className="hn-logo">Y</span>
              <span className="hn-title">Hacker News</span>
            </div>
            <div className="hn-list">
              <div className={`hn-item ${browserStep >= 2 ? 'highlighted-match' : ''}`}>
                <span className="hn-num">1.</span>
                <div>
                  <span className="hn-link-text">SuperAgent: Open-source autonomous developer agent for coding</span>
                  <span className="hn-site"> (github.com/superagent)</span>
                </div>
              </div>
              <div className="hn-item">
                <span className="hn-num">2.</span>
                <div>
                  <span className="hn-link-text">Model Context Protocol (MCP) release details</span>
                  <span className="hn-site"> (mcp.org)</span>
                </div>
              </div>
              <div className={`hn-item ${browserStep >= 2 ? 'highlighted-match' : ''}`}>
                <span className="hn-num">3.</span>
                <div>
                  <span className="hn-link-text">Why agentic frameworks are replacing standard workflows</span>
                  <span className="hn-site"> (techcrunch.com)</span>
                </div>
              </div>
            </div>

            {/* Simulating actions visually */}
            {browserStep === 1 && (
              <div className="browser-action-overlay clicking" style={{ top: '100px', left: '180px' }}>
                <div className="cursor-pointer"></div>
                <div className="tooltip">Selecting list items...</div>
              </div>
            )}
            {browserStep === 2 && (
              <div className="browser-action-overlay filtering" style={{ top: '54px', left: '30px' }}>
                <div className="tooltip">Pattern filtering active</div>
              </div>
            )}
          </div>
        </div>
        <div className="browser-control-panel">
          <div className="control-step">
            <span className="step-num">Step {browserStep + 1}/4:</span>
            <span className="step-action">{steps[browserStep].action}</span>
          </div>
          <div className="control-status">
            <span className="pulse-indicator"></span>
            <span>{steps[browserStep].status}</span>
          </div>
        </div>
      </div>
    )
  }

  const renderMCP = () => {
    const nodeDetails = {
      core: {
        title: 'SuperAgent Core Engine',
        desc: 'The central brain coordinates planning, memory, and LLM communication. Sends tool execution tasks via JSON-RPC over stdin/stdout or SSE.'
      },
      postgres: {
        title: 'mcp-server-postgres',
        desc: 'Connects to a PostgreSQL database. Exposes tools like list_tables, describe_table, and run_query directly to the agent.'
      },
      github: {
        title: 'mcp-server-github',
        desc: 'Connects to GitHub API. Exposes tools to read files, create pull requests, view issues, and search code.'
      },
      brave: {
        title: 'mcp-server-brave',
        desc: 'Connects to Brave Search API. Allows the agent to query the public web for real-time documentation and facts.'
      }
    }

    return (
      <div className="showcase-content mock-mcp">
        <div className="mcp-diagram">
          <button 
            className={`mcp-node central ${mcpNode === 'core' ? 'selected' : ''}`}
            onClick={() => setMcpNode('core')}
          >
            <div className="node-icon">🤖</div>
            <div className="node-label">SuperAgent Core</div>
            <span className="pulse-ring"></span>
          </button>
          
          <div className="mcp-connections">
            <div className={`connection-line line-1 ${mcpNode === 'postgres' ? 'active' : ''}`}>
              <span className="data-packet"></span>
            </div>
            <div className={`connection-line line-2 ${mcpNode === 'github' ? 'active' : ''}`}>
              <span className="data-packet"></span>
            </div>
            <div className={`connection-line line-3 ${mcpNode === 'brave' ? 'active' : ''}`}>
              <span className="data-packet"></span>
            </div>
          </div>
          
          <div className="mcp-satellites">
            <button 
              className={`mcp-node satellite ${mcpNode === 'postgres' ? 'selected' : ''}`}
              onClick={() => setMcpNode('postgres')}
            >
              <div className="node-icon">💾</div>
              <div className="node-label">PostgreSQL</div>
              <span className="status-badge connected">Connected</span>
            </button>
            <button 
              className={`mcp-node satellite ${mcpNode === 'github' ? 'selected' : ''}`}
              onClick={() => setMcpNode('github')}
            >
              <div className="node-icon">🐙</div>
              <div className="node-label">GitHub API</div>
              <span className="status-badge connected">Connected</span>
            </button>
            <button 
              className={`mcp-node satellite ${mcpNode === 'brave' ? 'selected' : ''}`}
              onClick={() => setMcpNode('brave')}
            >
              <div className="node-icon">🌐</div>
              <div className="node-label">Brave Search</div>
              <span className="status-badge connected">Connected</span>
            </button>
          </div>
        </div>
        
        <div className="mcp-info">
          <div className="mcp-node-details">
            <h3>{nodeDetails[mcpNode].title}</h3>
            <p>{nodeDetails[mcpNode].desc}</p>
          </div>
          <div className="mcp-interactive-prompt">
            💡 <em>Click any node in the diagram to inspect its connection properties.</em>
          </div>
        </div>
      </div>
    )
  }

  const renderMultimodal = () => {
    const visionOutputs = {
      dashboard: {
        text: 'The screenshot displays a SaaS Analytics Dashboard. It includes three metric cards (Total Sales: $45.2K, Users: 12.8K, Conversion: 2.4%) and a primary sales volume line chart. I will write code to parse these charts into a JSON table.',
        boxTag: 'Dashboard Layout Grid (96%)',
        boxStyle: { top: '15%', left: '10%', width: '80%', height: '70%' },
        bgGradient: 'radial-gradient(circle at center, #1b263b 0%, #0d131f 100%)'
      },
      invoice: {
        text: 'This image is a billing invoice from Amazon Web Services. I detected the billing ID AWS-8849-01, bill date 2026-07-01, and total amount due of $1,284.50. I will map this invoice data into your database.',
        boxTag: 'Total Amount: $1,284.50 (99%)',
        boxStyle: { top: '65%', left: '40%', width: '50%', height: '20%' },
        bgGradient: 'radial-gradient(circle at center, #32291e 0%, #15110a 100%)'
      },
      flowchart: {
        text: 'The flowchart describes a server deployment pipeline. It starts with Code Push -> runs CI Tests -> builds Docker Image -> and deploys to Kubernetes. I will create a GitHub Actions workflow matching this pipeline.',
        boxTag: 'Build Stage Node (91%)',
        boxStyle: { top: '35%', left: '30%', width: '40%', height: '30%' },
        bgGradient: 'radial-gradient(circle at center, #182d24 0%, #0a1410 100%)'
      }
    }

    return (
      <div className="showcase-content mock-multimodal">
        <div className="multimodal-left">
          <div className="multimodal-img-selector">
            <button 
              className={`img-thumb-btn ${visionImage === 'dashboard' ? 'active' : ''}`}
              onClick={() => setVisionImage('dashboard')}
            >
              📊 Dashboard
            </button>
            <button 
              className={`img-thumb-btn ${visionImage === 'invoice' ? 'active' : ''}`}
              onClick={() => setVisionImage('invoice')}
            >
              🧾 Invoice
            </button>
            <button 
              className={`img-thumb-btn ${visionImage === 'flowchart' ? 'active' : ''}`}
              onClick={() => setVisionImage('flowchart')}
            >
              📐 Flowchart
            </button>
          </div>
          <div className="image-analyzer-frame">
            <div className="analyzed-image" style={{ background: visionOutputs[visionImage].bgGradient }}>
              <div className="scan-line"></div>
              <div className="bounding-box" style={visionOutputs[visionImage].boxStyle}>
                <span className="box-tag">{visionOutputs[visionImage].boxTag}</span>
                <span className="box-corner tl"></span>
                <span className="box-corner tr"></span>
                <span className="box-corner bl"></span>
                <span className="box-corner br"></span>
              </div>
            </div>
          </div>
        </div>
        <div className="multimodal-right">
          <div className="chat-bubble agent-speech">
            <div className="bubble-header">SuperAgent Multimodal Vision</div>
            <div className="bubble-text">
              {visionOutputs[visionImage].text}
            </div>
          </div>
          <div className="transcription-wave">
            <div className="audio-wave">
              <span className="bar"></span>
              <span className="bar tall"></span>
              <span className="bar"></span>
              <span className="bar tall"></span>
              <span className="bar extra-tall"></span>
              <span className="bar tall"></span>
              <span className="bar"></span>
            </div>
            <span className="transcription-text">"Export the extracted properties directly to CSV"</span>
            <span className="transcription-badge">Voice Input Auto-Transcribed</span>
          </div>
        </div>
      </div>
    )
  }

  const renderArtifacts = () => {
    return (
      <div className="showcase-content mock-artifacts">
        <div className="artifacts-chat">
          <div className="chat-bubble user-speech">
            <div className="bubble-header">User</div>
            <div className="bubble-text">
              Generate a vector logo design for an AI app named Antigravity. Keep it sleek and futuristic.
            </div>
          </div>
          <div className="chat-bubble agent-speech">
            <div className="bubble-header">SuperAgent Core</div>
            <div className="bubble-text">
              I have created the vector logo SVG inside the Artifact panel. You can check the preview and grab the code on the right.
            </div>
          </div>
        </div>

        <div className="artifacts-panel">
          <div className="artifact-header">
            <div className="artifact-meta">
              <span className="art-icon">📄</span>
              <span className="art-filename">antigravity_logo.svg</span>
            </div>
            <div className="artifact-toggle-btns">
              <button 
                className={`art-toggle-btn ${artifactTab === 'preview' ? 'active' : ''}`}
                onClick={() => setArtifactTab('preview')}
              >
                Preview
              </button>
              <button 
                className={`art-toggle-btn ${artifactTab === 'code' ? 'active' : ''}`}
                onClick={() => setArtifactTab('code')}
              >
                Code
              </button>
            </div>
          </div>
          <div className="artifact-body">
            {artifactTab === 'preview' ? (
              <div className="artifact-preview-canvas">
                <svg viewBox="0 0 200 200" width="120" height="120">
                  <defs>
                    <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(255,178,62,0.3)" />
                      <stop offset="100%" stopColor="rgba(140,123,255,0)" />
                    </radialGradient>
                    <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffb23e" />
                      <stop offset="100%" stopColor="#8c7bff" />
                    </linearGradient>
                  </defs>
                  
                  {/* Outer glowing rings */}
                  <circle cx="100" cy="100" r="80" fill="url(#ringGlow)" />
                  <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                  
                  {/* Floating particle planets */}
                  <circle cx="100" cy="100" r="50" fill="none" stroke="url(#orbitGrad)" strokeWidth="1.5" />
                  <circle cx="150" cy="100" r="5" fill="#ffb23e" />
                  <circle cx="50" cy="100" r="3" fill="#8c7bff" />
                  
                  {/* Center core */}
                  <circle cx="100" cy="100" r="18" fill="url(#orbitGrad)" />
                  <circle cx="100" cy="100" r="18" fill="none" stroke="#fff" strokeWidth="0.8" strokeOpacity="0.4" />
                </svg>
                <div className="canvas-badge">Interactive SVG Render</div>
              </div>
            ) : (
              <div className="artifact-code-view">
                <pre>
                  <code>
{`<svg viewBox="0 0 200 200">
  <defs>
    <radialGradient id="ringGlow">
      <stop offset="0%" stop-color="#ffb23e" />
    </radialGradient>
  </defs>
  <circle cx="100" cy="100" r="80" />
  <circle cx="100" cy="100" r="50" fill="none" />
</svg>`}
                  </code>
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Reveal className="showcase-section">
      <div className="showcase-header text-center">
        <p className="eyebrow">Interactive Demo</p>
        <h2 className="h-section">See SuperAgent in action</h2>
        <p className="lead mx-auto">
          Toggle the tabs below to explore how the agent performs multi-step workflows, runs browser sessions, handles MCP servers, and processes multimodal inputs.
        </p>
      </div>

      <div className="showcase-tabs">
        <button
          className={`showcase-tab-btn ${activeTab === 'sandbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('sandbox')}
        >
          <span className="tab-icon">💻</span>
          <span className="tab-text">Terminal Sandbox</span>
        </button>
        <button
          className={`showcase-tab-btn ${activeTab === 'browser' ? 'active' : ''}`}
          onClick={() => setActiveTab('browser')}
        >
          <span className="tab-icon">🌐</span>
          <span className="tab-text">Browser Autopilot</span>
        </button>
        <button
          className={`showcase-tab-btn ${activeTab === 'mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcp')}
        >
          <span className="tab-icon">🔌</span>
          <span className="tab-text">MCP Plugin Hub</span>
        </button>
        <button
          className={`showcase-tab-btn ${activeTab === 'multimodal' ? 'active' : ''}`}
          onClick={() => setActiveTab('multimodal')}
        >
          <span className="tab-icon">📸</span>
          <span className="tab-text">Multimodal Engine</span>
        </button>
        <button
          className={`showcase-tab-btn ${activeTab === 'artifacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('artifacts')}
        >
          <span className="tab-icon">📄</span>
          <span className="tab-text">Interactive Artifacts</span>
        </button>
      </div>

      <div className="showcase-display">
        {activeTab === 'sandbox' && renderSandbox()}
        {activeTab === 'browser' && renderBrowser()}
        {activeTab === 'mcp' && renderMCP()}
        {activeTab === 'multimodal' && renderMultimodal()}
        {activeTab === 'artifacts' && renderArtifacts()}
      </div>
    </Reveal>
  )
}
