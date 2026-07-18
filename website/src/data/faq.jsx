const code = { fontFamily: 'var(--font-mono)' }

export const faqs = [
  {
    q: 'CLI or Desktop app — which should I pick?',
    a: (
      <p>They share the same autonomous core. The CLI (<b>Core + CLI + Web</b>) is for terminals, servers, and automation — it drops a <code style={code}>superagent</code> command and serves the web UI locally. The Desktop app (<b>Core + Desktop + Web</b>) is a native window with the full visual interface and your on-screen Partner. Pick by where you want to work, not by features.</p>
    )
  },
  {
    q: 'What do I need to run it?',
    a: (
      <p><b>CLI (Core + CLI + Web):</b> Paste the install command into your terminal to fetch the portable CLI. On Windows (PowerShell), run <code style={code}>irm https://superagent.ai/install.ps1 | iex</code>; on macOS/Linux (Bash), run <code style={code}>curl -fsSL https://superagent.ai/install.sh | sh</code>. <b>Desktop App (Core + Desktop + Web):</b> Download and launch the native executable installer for Windows, macOS, or Linux. Either way, you’ll add your own API key; SuperAgent is provider-agnostic.</p>
    )
  },
  {
    q: 'Where does my data go?',
    a: (
      <p>Nowhere by default. SuperAgent is local-first: conversations, config, and credentials stay on your machine, scrypt-hashed at <code style={code}>0600</code>. It only reaches out to the model provider you configure. No account, no telemetry, no cloud sync unless you set one up.</p>
    )
  },
  {
    q: 'Is it actually free?',
    a: (
      <p>Yes. It’s dual-licensed GPL-3.0 / AGPL-3.0 — free to use, modify, and share. The one obligation: if you distribute changes or a network service built on it, you publish those changes under the same copyleft terms.</p>
    )
  },
  {
    q: 'How do I update?',
    a: (
      <p><b>CLI:</b> run <code style={code}>superagent update</code>. <b>Desktop:</b> the built-in auto-updater handles it, or re-download from releases. Because it’s local-first, updates never touch your data or config.</p>
    )
  },
  {
    q: 'Do I need the internet?',
    a: (
      <p>Only to talk to your model provider. Everything else — the agent loop, your tools, the Partner, and your history — runs offline on your machine.</p>
    )
  },
  {
    q: 'Can I use my own models and tools?',
    a: (
      <p>Yes. SuperAgent is provider-agnostic: bring any first-party or OpenAI-compatible API key in Settings. Over MCP it can call your own tools, APIs, and databases too.</p>
    )
  },
  {
    q: 'What’s the Partner / Pet?',
    a: (
      <p>A small companion that reacts to what the agent is doing — thinking, working, celebrating, or snoozing. On Desktop it’s a 3D character in an always-on-top window; on Web it’s a 2D companion. It’s fully open: author a <code style={code}>partner.json</code> and share it.</p>
    )
  }
]
