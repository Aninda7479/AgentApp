# 07 — Settings Governance & System Doctor UI Specification

## Executive Summary
This document provides the canonical architectural and behavioral specification for the **Settings Governance & System Doctor** subsystem in SuperAgent. Expanding upon the initial 18 modules outlined in `docs/UI_SPECIFICATION.md`, this specification establishes a unified **24-Module Settings Matrix**. It provides comprehensive controls for next-generation agent capabilities—including Computer Use (WGC/BitBlt), Browser Tab Leasing, 4-Tier Security Guardian, 3D VRM Companions, and Hardware Diagnostics.

---

## 1. Architectural Overview & Security Model

### 1.1 Navigation & Presentation Hierarchy
The Settings view (`SettingsView`) is accessible via the primary navigation sidebar, the global shortcut (`Cmd+,` / `Ctrl+,`), or via command palette invocation (`Preferences: Open Settings`).

```
+-------------------------------------------------------------------------------------------------------------+
| Settings & Governance                                                           [Search Settings... (Ctrl+F)]|
+--------------------------------------+----------------------------------------------------------------------+
| CATEGORIES                           | MODULE SETTINGS CARD: [Module Title]                                 |
|                                      | Description of the current panel's capabilities and policies.        |
| Core & Identity                      +----------------------------------------------------------------------+
|  1. General                          | [Section 1: Primary Parameters]                                      |
|  2. Providers & Keys                 | (Field / Toggle / Dropdown / Slider)                                 |
|  3. Local LLM Models                 |                                                                      |
|                                      | [Section 2: Advanced & Hardware Allocations]                         |
| Autonomous & Computer Use            | (Field / Secure Input / Custom Base URL)                             |
|  4. Computer Use (CUA / WGC)         |                                                                      |
|  5. Browser Tab Leasing              | [Section 3: Security & Operational Boundaries]                       |
|  6. Security Guardian                | (Policy selector / Origin whitelist)                                 |
|                                      |                                                                      |
| Media & Generative Engines           +----------------------------------------------------------------------+
|  7. Local Image Models (SD/Flux)     | [ Test Connection / Run Diagnostic ]           [ Reset ] [ Save ]    |
|  8. Local Video Models (Wan/Hunyuan) +----------------------------------------------------------------------+
|  9. 3D Studio Graphics               | Real-Time Status Pill: [ ● Engine Ready | 14ms latency ]             |
| 10. 3D Companion & VRM               +----------------------------------------------------------------------+
| 11. Voice & Speech Studio            |
|                                      |
| Developer & Integrations             |
| 12. MCP Server Catalog               |
| 13. Telegram Bot Bridge              |
| 14. Hardware ECAD Settings           |
| 15. Artifacts Runtime                |
| 16. Web App Hosting (:1469)          |
|                                      |
| System, Privacy & Diagnostics        |
| 17. Memory & Context Engine          |
| 18. Usage & Cost Ledger              |
| 19. Storage & Data Management        |
| 20. Notification Rules               |
| 21. Keybindings & Shortcuts          |
| 22. Telemetry & Privacy              |
| 23. Software Updates                 |
| 24. System Doctor Diagnostics        |
+--------------------------------------+----------------------------------------------------------------------+
```

### 1.2 Storage, Cryptography & Secret Encryption
1. **Zero Plaintext Storage**: All API provider keys, bot tokens, and user credentials are encrypted before landing on disk (`~/.superagent/settings.json` or OS keychain).
2. **Encryption Standard**:
   - Keys are encrypted using **AES-256-GCM** with a machine-bound hardware key derived via **Argon2id** (memory: 64MB, iterations: 3, parallelism: 4).
   - In native desktop clients (Windows, macOS, Linux), the encryption key is secured via platform credential vaults:
     * **Windows**: DPAPI (`CryptProtectData`) / Windows Credential Manager.
     * **macOS**: Apple Keychain Services (`SecItemAdd` / `kSecClassGenericPassword`).
     * **Linux**: FreeDesktop Secret Service API (`libsecret` / GNOME Keyring / KWallet).
   - Headless / VPS deployments utilize a salted machine-ID secret combined with `SUPERAGENT_PASSWORD`.
3. **Memory Scrubbing**: Decrypted secret strings are encapsulated in zeroizing byte wrappers (`secrecy::SecretString` in Rust). When destroyed, heap memory is zeroed out using `zeroize`.
4. **Wire Masking**: The Core WebSocket gateway never transmits unmasked API keys to clients. Payloads return obfuscated patterns (`sk-...abcd`) with a boolean flag `is_set: true`.

---

## 2. The Expanded 24-Module Settings Matrix

### Module 1: General Settings (`GeneralSettings`)
- **Route / Component**: `/settings/general` | `GeneralSettings.tsx` / `GeneralSettingsView.cs` / `GeneralSettingsView.swift`
- **Purpose**: Host identity, visual aesthetic, system feedback, and interface localization.
- **Fields & Controls**:
  * `host_display_name`: String (1-32 chars, default: current OS username).
  * `theme`: Radio Segment (`dark` [default], `light`, `system`, `high_contrast`).
  * `ui_zoom_level`: Slider (80% to 150%, 5% increments, default: 100%).
  * `language`: Dropdown (English [default], Spanish, German, Japanese, Simplified Chinese, French).
  * `sound_effects_enabled`: Switch (default: `true`).
  * `completion_chime`: Dropdown (`gentle_bell`, `subtle_pop`, `digital_ping`, `silent`).
  * `error_alert_tone`: Switch (default: `true`).
  * `auto_save_interval_sec`: Number input (5 to 300 seconds, default: 30).

### Module 2: Provider Registry (`ProvidersSettings`)
- **Route / Component**: `/settings/providers` | `ProvidersSettings.tsx`
- **Purpose**: Multi-provider cloud LLM credential management, proxy configuration, and live latency health tests.
- **Fields & Controls**:
  * `providers`: Array of Provider Config Cards:
    - `openai`: API Key (password masked), Base URL (`https://api.openai.com/v1`), Organization ID, Default Model (`gpt-4o`).
    - `anthropic`: API Key (password masked), Base URL (`https://api.anthropic.com/v1`), Default Model (`claude-3-5-sonnet-20241022`).
    - `gemini`: API Key (password masked), Base URL (`https://generativelanguage.googleapis.com`), Default Model (`gemini-2.0-flash-exp`).
    - `groq`: API Key, Base URL, Default Model (`llama-3.3-70b-versatile`).
    - `deepseek`: API Key, Base URL (`https://api.deepseek.com`), Default Model (`deepseek-chat`).
    - `openrouter`: API Key, Base URL (`https://openrouter.ai/api/v1`).
    - `mistral`: API Key, Base URL (`https://api.mistral.ai/v1`).
    - `custom_openai_compatible`: Custom Name, Base URL, API Key, Model Identifier.
  * **Actions per Provider**:
    - `Test Connection`: Dispatches validation request (`POST /api/provider-proxy/test`).
    - `Status Pill`: Displays `Connected (84ms)` [green], `Auth Failed (401)` [red], or `Timeout (504)` [amber].

### Module 3: Local Models (`LocalModelSettings`)
- **Route / Component**: `/settings/local-models` | `LocalModelSettings.tsx`
- **Purpose**: Integration with local inferencing backends (Ollama, LM Studio, vLLM, llama.cpp).
- **Fields & Controls**:
  * `ollama_endpoint`: URL input (default: `http://localhost:11434`).
  * `lmstudio_endpoint`: URL input (default: `http://localhost:1234/v1`).
  * `active_local_backend`: Radio selector (`ollama`, `lmstudio`, `custom_vllm`, `disabled`).
  * `detected_models_list`: Dynamic table of pulled models (Name, Parameter size, Quantization, Disk footprint, Delete button).
  * `pull_model_input`: Text field with "Pull Model" action (e.g., `qwen2.5-coder:14b`, `llama3.2:3b`).
  * `download_progress`: Real-time streaming progress bar (speed in MB/s, % completed, ETA).
  * `context_window_override`: Slider (2048 to 131072 tokens).
  * `gpu_layer_offload`: Number stepper (`auto`, or fixed layer count 0-99).

### Module 4: Local Image Models (`LocalImageModelSettings`)
- **Route / Component**: `/settings/local-image-models` | `LocalImageModelSettings.tsx`
- **Purpose**: Connect local generative image backends (ComfyUI, Stable Diffusion WebUI / Forge, FLUX.1).
- **Fields & Controls**:
  * `backend_type`: Dropdown (`comfyui` [default], `sd_webui_forge`, `diffusers_local`).
  * `server_url`: URL input (default: `http://127.0.0.1:8188`).
  * `default_checkpoint`: Dropdown auto-populated from ComfyUI API (e.g. `flux1-dev-fp8.safetensors`, `sd_xl_base_1.0.safetensors`).
  * `lora_directory`: Directory path picker (`~/.superagent/models/loras`).
  * `enable_vram_offload`: Toggle (enables CPU offload when VRAM < 12GB).
  * `default_steps`: Number input (1 to 100, default: 28).
  * `default_cfg`: Decimal input (1.0 to 20.0, default: 3.5).
  * `test_generation_button`: Generates a 64x64 test swatch to verify pipeline health.

### Module 5: Local Video Models (`LocalVideoModelSettings`)
- **Route / Component**: `/settings/local-video-models` | `LocalVideoModelSettings.tsx`
- **Purpose**: Manage high-end generative video pipelines (Wan2.1, HunyuanVideo, CogVideoX).
- **Fields & Controls**:
  * `video_backend`: Dropdown (`comfyui_video`, `native_diffusers`, `remote_slurm`).
  * `active_checkpoint`: Dropdown (`Wan2.1-T2V-14B`, `Wan2.1-I2V-720P`, `HunyuanVideo-1.5`, `CogVideoX-5B`).
  * `vram_budget_gb`: Slider (8GB to 48GB, default: auto-detected VRAM minus 2GB).
  * `enable_teacache`: Switch (TeaCache speedup for video diffusion models, default: `true`).
  * `temporal_tiling`: Switch (enables chunked temporal frames to avoid OOM, default: `true`).
  * `ffmpeg_binary_path`: File picker path (validated by System Doctor).
  * `default_fps`: Segmented control (`16`, `24`, `30`, `60`).

### Module 6: MCP Server Catalog & Dashboard (`MCPDashboard`)
- **Route / Component**: `/settings/mcp` | `MCPDashboard.tsx`
- **Purpose**: Model Context Protocol (MCP) server lifecycle management, environment injection, and tools inspection.
- **Fields & Controls**:
  * `mcp_servers`: Dynamic list of registered MCP servers.
    - Each server card displays: Server Name, Transport (`stdio` | `sse`), Status (`running` [green], `stopped` [gray], `errored` [red]), Tool Count, Latency (ms).
  * `add_server_modal`:
    - `transport_type`: Segmented (`stdio`, `sse`).
    - `command`: String (e.g., `npx -y @modelcontextprotocol/server-postgres`).
    - `arguments`: Tag-input list of CLI args.
    - `environment_variables`: Key-Value secure editor with `.env` import.
    - `sse_url`: HTTP/SSE endpoint URL.
  * `catalog_one_click_install`: Cards for pre-tested servers (Brave Search, GitHub, SQLite, PostgreSQL, Fetch, Puppeteer, Memory).
  * `inspect_tools_drawer`: Lists all tools provided by selected server with input JSON schemas.

### Module 7: Usage & Cost Tracker (`UsageTrackerSettings`)
- **Route / Component**: `/settings/usage` | `UsageTrackerSettings.tsx`
- **Purpose**: Real-time token accounting, multi-provider budget caps, and cost analytics.
- **Fields & Controls**:
  * `pricing_table`: Editable rates per 1M prompt/completion tokens per provider.
  * `monthly_budget_cap_usd`: Number input (default: `$50.00`).
  * `budget_alert_threshold_percent`: Slider (50% to 100%, default: 80%).
  * `hard_cap_enforcement`: Switch (hard stop agent tool execution when cap exceeded, default: `true`).
  * `usage_aggregation_range`: Date Filter (`Today`, `This Week`, `This Month`, `Year to Date`, `Custom`).
  * `breakdown_charts`:
    - Dual Bar Chart: Prompt Tokens vs Completion Tokens.
    - Donut Chart: Cost distribution across providers.
  * `export_records`: Button ("Export Ledger to CSV" / "Export JSON").

### Module 8: Memory & Context Engine (`MemorySettings`)
- **Route / Component**: `/settings/memory` | `MemorySettings.tsx`
- **Purpose**: Persistent episodic and semantic memory controls, profile facts store, and project rule detectors.
- **Fields & Controls**:
  * `enable_persistent_memory`: Switch (default: `true`).
  * `profile_facts_editor`: Tabular key-value editor (`preference`, `identity`, `environment`).
  * `learned_insights_browser`: Searchable list of memory nodes with delete/edit actions.
  * `compaction_token_threshold`: Slider (4000 to 128000 tokens, default: 32000).
  * `auto_compaction_strategy`: Dropdown (`summarize_and_prune`, `vector_cluster`, `sliding_window`).
  * `project_rules_auto_detect`: Switch (automatically parse `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, default: `true`).
  * `purge_memory_button`: Destructive action with confirmation dialog ("Clear All Agent Memories").

### Module 9: Voice & Speech Studio (`VoiceSettings`)
- **Route / Component**: `/settings/voice` | `VoiceSettings.tsx`
- **Purpose**: Audio capture, speech-to-text (Whisper), text-to-speech (ElevenLabs/WebSpeech), and hotkeys.
- **Fields & Controls**:
  * `stt_engine`: Dropdown (`whisper_local`, `whisper_cloud_openai`, `groq_whisper`, `web_speech`).
  * `whisper_model_size`: Dropdown (`tiny`, `base`, `small`, `medium`, `large-v3`, default: `base`).
  * `push_to_talk_hotkey`: Key recorder (default: `Ctrl+Space` or `F8`).
  * `audio_input_device`: Dropdown populated via `cpal` / `navigator.mediaDevices.enumerateDevices()`.
  * `microphone_gain_meter`: Live visual VU meter responding to speech.
  * `phonetic_replacement_dictionary`: Table (`replace "super agent"` -> `"SuperAgent"`).
  * `tts_engine`: Dropdown (`elevenlabs`, `openai_tts`, `webspeech`, `disabled`).
  * `elevenlabs_voice_id`: Dropdown fetching available voices via API key.
  * `auto_speak_responses`: Switch (default: `false`).

### Module 10: Telegram Bot Bridge (`TelegramSettings`)
- **Route / Component**: `/settings/telegram` | `TelegramSettings.tsx`
- **Purpose**: Remote agent control, status alerts, voice note transcription, and remote image delivery.
- **Fields & Controls**:
  * `bot_token`: Password-masked input (`123456789:ABCdefGhIJKlmNoPQRstuVWXyz`).
  * `connection_mode`: Radio (`long_polling` [default], `webhook`).
  * `webhook_url`: URL input (used if mode is webhook).
  * `allowed_user_ids`: Tag-input list of Telegram User/Chat IDs (prevents unauthorized bot use).
  * `allow_voice_notes`: Switch (auto-transcribes incoming audio into agent instructions, default: `true`).
  * `remote_image_delivery`: Switch (sends generated images directly to Telegram chat, default: `true`).
  * `bot_status_indicator`: `Active & Polling` [green] / `Disconnected` [gray].

### Module 11: Computer Use Automation (`ComputerUseSettings`)
- **Route / Component**: `/settings/computer-use` | `ComputerUseSettings.tsx`
- **Purpose**: Direct OS screen inspection, window automation, and hardware input injection safety boundaries.
- **Fields & Controls**:
  * `capture_backend`: Dropdown:
    - `wgc_direct3d11`: Windows Graphics Capture (supports background occluded windows without raising them, hardware Direct3D texture).
    - `bitblt`: Standard GDI BitBlt (classic fallback).
    - `x11_xdo` / `wayland_portal`: Linux capture backends.
    - `core_graphics`: macOS ScreenCaptureKit.
  * `coordinate_unscaling_mode`: Dropdown (`dpi_aware_physical`, `logical_virtual_screen`, `client_relative`).
  * `mouse_emulation_mode`: Dropdown (`humanized_bezier` [smooth curvature with slight jitter], `instant_snap`, `linear_interpolated`).
  * `mouse_move_speed_ms`: Slider (50ms to 800ms, default: 220ms).
  * `action_safety_delay_ms`: Slider (50ms to 2000ms, default: 350ms).
  * `input_safety_lock_hotkey`: Keyboard shortcut to immediately abort active automation (default: `Escape` or `Ctrl+Pause`).
  * `enable_keystroke_simulation`: Switch (default: `true`).
  * `highlight_target_elements`: Switch (renders bounding box highlight around clicked UI elements, default: `true`).

### Module 12: Browser Leasing & CDP Gateway (`BrowserLeasingSettings`)
- **Route / Component**: `/settings/browser-leasing` | `BrowserLeasingSettings.tsx`
- **Purpose**: Manage two-tiered browser tab claiming (`claimExistingTab` vs `createTab`), CDP debugging ports, and in-page WebMCP tool injection.
- **Fields & Controls**:
  * `cdp_endpoint_mode`: Radio:
    - `auto_launch_isolated`: Launches dedicated Chromium instance in temporary sandbox profile.
    - `attach_existing_chrome`: Connects to user's daily Chrome instance via remote debugging port (default: `http://localhost:9222`).
  * `cdp_port`: Number input (default: `9222`).
  * `tab_lease_policy`: Dropdown:
    - `prefer_existing_claim`: Match open tabs by domain before opening a new tab.
    - `always_new_tab`: Never hijack active user tabs.
    - `isolated_incognito`: Always launch ephemeral incognito session.
  * `cookie_isolation`: Switch (separate agent cookies from host profile, default: `false`).
  * `in_page_webmcp_injection`: Switch (injects `@superagent/webmcp` content script into leased tabs for in-DOM DOM tree extraction, default: `true`).
  * `inject_in_dom_agent_indicator`: Switch (renders floating `⚡ SuperAgent Connected` pill inside leased tab viewport, default: `true`).
  * `headless_mode`: Switch (default: `false` - headed mode allows user to observe automation).
  * `default_viewport`: Dropdown (`1920x1080`, `1440x900`, `1280x720`, `auto_fit_window`).

### Module 13: Security Guardian & Policy Engine (`SecurityGuardianSettings`)
- **Route / Component**: `/settings/security-guardian` | `SecurityGuardianSettings.tsx`
- **Purpose**: System-level watchdog, WTS session lock listener, 4-tier confirmation threshold engine, and path blacklists.
- **Fields & Controls**:
  * `lockscreen_watchdog_enabled`: Switch (actively monitors `WTS_SESSION_LOCK` / screensaver activation; aborts and freezes all mouse/keyboard actions immediately on lock, default: `true`).
  * `confirmation_tier_thresholds`: Table of Action Types to Confirmation Tier:
    - `File Read`: Tier 1 (Auto-Execute).
    - `File Write / Edit`: Tier 3 (Pre-Approval Required).
    - `Shell Execution (Read-Only / git status / ls)`: Tier 1 (Auto-Execute).
    - `Shell Execution (Stateful / npm / cargo / git commit)`: Tier 2 (Post-Notification).
    - `Shell Execution (Destructive / rm -rf / git push --force)`: Tier 4 (Air-Gapped Confirmation Required).
    - `Computer Use Mouse / Keyboard Input`: Tier 3 (Pre-Approval Required).
    - `Browser Payment / Checkout Form Submit`: Tier 4 (Air-Gapped Confirmation Required).
  * `protected_path_blacklist`: Multi-line text input with glob patterns:
    ```
    ~/.ssh/**
    ~/.aws/**
    **/.env*
    **/id_rsa*
    C:\Windows\System32/**
    ```
  * `allowed_network_origins_whitelist`: Domain pattern whitelist (e.g., `*.github.com`, `*.npmjs.org`, `localhost:*`).
  * `cross_origin_iframe_blocking`: Switch (prevents browser automation from interacting with unverified third-party iframes, default: `true`).

### Module 14: 3D Companion & VRM Studio (`CompanionSettings`)
- **Route / Component**: `/settings/companion` | `CompanionSettings.tsx`
- **Purpose**: Configuration for interactive 3D humanoid VRM companion avatars, rendering physics, and affective synchronization.
- **Fields & Controls**:
  * `active_vrm_model`: File picker / model selector (`default_companion.vrm`, or custom user upload).
  * `graphics_fidelity`: Segmented control (`low` [no shadows, simple shaders], `medium` [shadow maps, spring bones], `high` [PBR, MSAA 4x, full hair physics]).
  * `spring_bone_physics`: Switch (dynamic cloth, hair, and accessory physics, default: `true`).
  * `procedural_eye_tracking`: Switch (companion's gaze smoothly follows the user's mouse cursor across the screen, default: `true`).
  * `mouse_tracking_sensitivity`: Slider (0.1 to 2.0, default: 1.0).
  * `lip_sync_sensitivity`: Slider (audio FFT amplitude gain, 0.5 to 3.0, default: 1.2).
  * `emotion_reaction_level`: Dropdown (`subtle`, `expressive` [default], `dramatic`, `disabled`).
  * `idle_blinking_rate`: Slider (binks per minute: 8 to 24, default: 14).
  * `desktop_pet_mode_defaults`:
    - `window_opacity`: Slider (40% to 100%, default: 95%).
    - `always_on_top`: Switch (default: `true`).
    - `click_through_idle`: Switch (clicks pass through transparent areas to background apps, default: `false`).

### Module 15: Web App Hosting & LAN Gateway (`WebAppHostingSettings`)
- **Route / Component**: `/settings/web-hosting` | `WebAppSettings.tsx`
- **Purpose**: Local Axum daemon hosting, external LAN accessibility, QR code pairing, and web credentials.
- **Fields & Controls**:
  * `daemon_status`: Indicator (`Running on port 1469` [green] / `Stopped` [red]).
  * `server_port`: Number input (default: `1469`, range: `1024-65535`).
  * `bind_interface`: Dropdown (`127.0.0.1` [Local Loopback Only], `0.0.0.0` [Expose to Local Network / LAN]).
  * `auto_start_on_boot`: Switch (launches daemon as Windows Service / macOS LaunchAgent / systemd unit, default: `true`).
  * `enable_scrypt_auth`: Switch (mandatory login gate for non-loopback connections, default: `true`).
  * `change_admin_password`: Secure dialog (Current Password, New Password min 8 chars, Confirm Password).
  * `lan_pairing_qr_code`: Dynamically generated QR code displaying `http://<LAN_IP>:1469?pair=<SESSION_TOKEN>`.
  * `session_cookie_ttl_hours`: Number input (1 to 720 hours, default: 168 [7 days]).

### Module 16: 3D Studio Graphics & Shaders (`ThreeDStudioSettings`)
- **Route / Component**: `/settings/threed-studio` | `ThreeDSettings.tsx`
- **Purpose**: Rendering engine parameters for 3D asset generation, Gaussian splatting, and CAD inspection.
- **Fields & Controls**:
  * `rendering_backend`: Dropdown (`webgpu_preferred`, `webgl2_fallback`).
  * `shadow_map_resolution`: Dropdown (`512x512`, `1024x1024` [default], `2048x2048`, `4096x4096`).
  * `anti_aliasing`: Dropdown (`none`, `fxaa`, `msaa_2x`, `msaa_4x` [default]).
  * `tone_mapping`: Dropdown (`aces_filmic` [default], `reinhard`, `cineon`, `linear`).
  * `ambient_occlusion`: Dropdown (`disabled`, `ssao_low`, `ssao_high`).
  * `mesh_export_format`: Segmented (`gltf`, `glb` [default], `usdz`, `obj`).
  * `draco_compression_level`: Slider (0 [uncompressed] to 10 [maximum compression], default: 7).

### Module 17: Hardware ECAD Settings (`ECADSettings`)
- **Route / Component**: `/settings/ecad` | `PCBSettingsModal.tsx`
- **Purpose**: Electronic computer-aided design, PCB layout synthesis, and manufacturing checks.
- **Fields & Controls**:
  * `kicad_cli_path`: File picker path to `kicad-cli` binary.
  * `default_pcb_layers`: Segmented (`2_layer`, `4_layer` [default], `6_layer`, `8_layer`).
  * `minimum_trace_width_mil`: Number input (default: `6.0` mil).
  * `minimum_clearance_mil`: Number input (default: `6.0` mil).
  * `minimum_via_drill_mm`: Number input (default: `0.3` mm).
  * `manufacturer_preset`: Dropdown (`jlcpcb_standard`, `pcbway_standard`, `oshpark_custom`).
  * `auto_run_drc_on_generate`: Switch (runs Design Rule Checks immediately after layout synthesis, default: `true`).
  * `render_3d_board_preview`: Switch (generates interactive 3D model of PCB with components, default: `true`).

### Module 18: Artifacts Runtime & Sandboxing (`ArtifactsSettings`)
- **Route / Component**: `/settings/artifacts` | `ArtifactSettings.tsx`
- **Purpose**: Local server port allocation, containerization, live hot-reloading, and process monitoring.
- **Fields & Controls**:
  * `port_range_start`: Number input (default: `3000`).
  * `port_range_end`: Number input (default: `3999`).
  * `process_isolation_mode`: Dropdown:
    - `native_subprocesses`: Spawns sandboxed OS child processes.
    - `docker_containers`: Spawns isolated Docker containers per artifact.
  * `hot_reload_file_watcher`: Switch (watches artifact directory and sends WebSocket reload event on file change, default: `true`).
  * `auto_terminate_orphans`: Switch (kills stale node/python servers when session closes, default: `true`).
  * `max_memory_per_artifact_mb`: Slider (256MB to 4096MB, default: 1024MB).

### Module 19: Storage & Data Management (`StorageSettings`)
- **Route / Component**: `/settings/storage` | `StorageSettings.tsx`
- **Purpose**: Workspace paths, embedded database maintenance (LevelDB/redb), cache clearing, and full backups.
- **Fields & Controls**:
  * `workspace_root_dir`: File path picker (default: `~/.superagent`).
  * `chat_history_retention_days`: Dropdown (`30_days`, `90_days`, `1_year`, `forever` [default]).
  * `database_size_indicator`: Readout (`Current database size: 48.2 MB`).
  * `compact_database_button`: Calls `redb::compact()` / LevelDB cleanup.
  * `cache_size_indicator`: Readout (`Image & Video Cache: 2.4 GB`).
  * `purge_cache_button`: Deletes temporary preview files and raw audio buffers.
  * `export_entire_vault`: Button ("Export Full Backup Archive (.zip)").
  * `factory_reset_button`: Danger zone action requiring double password entry ("Wipe All Data & Reset").

### Module 20: Software Updates & Release Channels (`UpdatesSettings`)
- **Route / Component**: `/settings/updates` | `UpdatesSettings.tsx`
- **Purpose**: SuperAgent version tracking, GitHub release updater, and automatic changelog inspection.
- **Fields & Controls**:
  * `current_version`: Readout (e.g., `v2.4.0 (commit 7a8f9c1)`).
  * `release_channel`: Dropdown (`stable` [default], `beta`, `nightly`).
  * `auto_check_updates`: Switch (default: `true`).
  * `check_for_updates_button`: Triggers GitHub API release comparison.
  * `update_status_card`: Shows `You are on the latest version` [green] or `New update available: v2.5.0` with release notes markdown viewer and "Download & Install" button.

### Module 21: System Doctor Diagnostics (`SystemDoctorSettings` / `DoctorModal`)
- **Route / Component**: `/settings/system-doctor` | `DoctorModal.tsx`
- **Purpose**: Deep hardware readiness inspection, binary dependencies, VRAM detection, Direct3D/WGC check, and port bind testing.
- **Fields & Controls**:
  * `run_full_diagnostic_button`: Triggers immediate re-evaluation of all test probes.
  * `hardware_and_environment_probes`:
    1. `OS Architecture & Kernel`: Version string, 64-bit support.
    2. `Node.js Runtime`: Installed version (minimum v18.0.0 required).
    3. `Rust Toolchain`: Installed version (minimum 1.80.0 required).
    4. `Git CLI`: Installed version and user identity configured.
    5. `FFmpeg Binary`: Video workspace encoder/decoder readiness.
    6. `GPU Acceleration & VRAM`: NVIDIA CUDA / Apple Metal / AMD ROCm detected, dedicated VRAM capacity (e.g. `16384 MB VRAM`).
    7. `Direct3D 11 / WGC Capability`: Windows Graphics Capture driver compatibility check.
    8. `Port 1469 Bindability`: Verifies port 1469 is free and not claimed by a zombie process.
    9. `Disk Write Permissions & Storage`: Checks write access to `~/.superagent` and verifies > 5 GB free disk space.
    10. `Microphone & Audio Loopback`: Audio hardware input stream open check.

### Module 22: Notification Rules & Quiet Hours (`NotificationSettings`)
- **Route / Component**: `/settings/notifications` | `NotificationSettings.tsx`
- **Purpose**: Multi-channel alerts, sound effects, system banner notifications, and Do-Not-Disturb schedules.
- **Fields & Controls**:
  * `system_desktop_notifications`: Switch (OS native toast notifications, default: `true`).
  * `notify_on_agent_task_complete`: Switch (default: `true`).
  * `notify_on_permission_required`: Switch (urgent blocker notification, default: `true`).
  * `notify_on_agent_error`: Switch (default: `true`).
  * `telegram_mirror_notifications`: Switch (forward desktop notifications to Telegram, default: `false`).
  * `quiet_hours_enabled`: Switch (suppresses all audible chimes during specified hours, default: `false`).
  * `quiet_hours_schedule`: Time range picker (`22:00` to `08:00`).

### Module 23: Telemetry & Privacy Governance (`TelemetrySettings`)
- **Route / Component**: `/settings/telemetry` | `TelemetrySettings.tsx`
- **Purpose**: Local-only enforcement, error crash reports, prompt anonymization, and PII masking.
- **Fields & Controls**:
  * `strict_local_mode`: Switch (strictly blocks any external network request; forces local Ollama and local tool execution only, default: `false`).
  * `anonymous_crash_reporting`: Switch (submits anonymized Rust stack traces on fatal crash, default: `false`).
  * `pii_prompt_scrubber`: Switch (automatically redacts credit card numbers, SSNs, and private credentials from outbound LLM prompts, default: `true`).
  * `audit_log_retention`: Dropdown (`7_days`, `30_days`, `90_days`, `infinite`).
  * `view_audit_log_button`: Opens full-screen viewer of all outbound agent requests and tool arguments.

### Module 24: Keybinding & Shortcut Manager (`ShortcutsSettings`)
- **Route / Component**: `/settings/shortcuts` | `ShortcutsModal.tsx`
- **Purpose**: Global OS-level and in-app keyboard shortcut mapping, conflict detection, and reset to defaults.
- **Fields & Controls**:
  * `shortcut_table`: Searchable and re-recordable list of commands:
    - `Global: Circle Search Overlay`: Default `Ctrl+Shift+S` (Win/Linux) / `Cmd+Shift+S` (macOS).
    - `Global: Voice Dictation Overlay`: Default `Ctrl+Space` or `F8`.
    - `Global: System Tray Mini-Launcher`: Default `Ctrl+Shift+A` / `Cmd+Shift+A`.
    - `In-App: New Chat`: Default `Ctrl+N` / `Cmd+N`.
    - `In-App: Command Palette`: Default `Ctrl+K` / `Cmd+K`.
    - `In-App: Settings`: Default `Ctrl+,` / `Cmd+,`.
    - `In-App: Abort Active Agent Run`: Default `Escape` or `Ctrl+C`.
    - `In-App: Toggle 3D Companion`: Default `Ctrl+Shift+P` / `Cmd+Shift+P`.
  * `conflict_warning_badge`: Displays inline warning if a user records a keybinding already assigned.
  * `reset_all_shortcuts_button`: Restores factory default key combinations.

---

## 3. ASCII Wireframes & Settings Card Layouts

### 3.1 Module 11: Computer Use (WGC vs BitBlt & Safety)
```
+-------------------------------------------------------------------------------------------------------------+
| Settings > Autonomous & Computer Use > Computer Use (CUA / WGC)                                            |
+-------------------------------------------------------------------------------------------------------------+
| Screen Capture Engine                                                                                       |
| Select the underlying graphics capture pipeline used to inspect OS windows.                                 |
|                                                                                                             |
|  (o) Windows Graphics Capture (WGC / Direct3D 11) [RECOMMENDED]                                             |
|      Captures background and partially occluded windows without raising them. Zero flicker, 60fps capable. |
|  ( ) GDI BitBlt (Legacy Fallback)                                                                           |
|      Requires window to be un-occluded. Fallback for older Windows 10 versions.                            |
|                                                                                                             |
| Coordinate Normalization & DPI Scaling                                                                      |
|  Coordinate Mode: [ Physical Display Pixels (DPI-Aware)                                                   v ]|
|  Active Display:  [ Display 1: 3840x2160 @ 150% Scaling (Primary)                                        v ]|
|                                                                                                             |
| Mouse Emulation Dynamics                                                                                    |
|  Trajectory Mode: [ Humanized Bezier Curve (Smoothed path with overshoot)                                 v ]|
|  Movement Speed:  [====================|----------------] 240 ms                                            |
|                                                                                                             |
| Operational Safety Delays                                                                                   |
|  Inter-Action Delay: [==============|-------------------------] 350 ms                                      |
|  Hold Click Duration: [======|--------------------------------] 60 ms                                       |
|                                                                                                             |
| Emergency Abort Key: [ ESCAPE (Double Press)                     ] [ Record New Hotkey ]                   |
|                                                                                                             |
| [ Test Capture Window... ]                                                                  [ Save Changes ] |
+-------------------------------------------------------------------------------------------------------------+
```

### 3.2 Module 13: Security Guardian & Confirmation Tiers
```
+-------------------------------------------------------------------------------------------------------------+
| Settings > Autonomous & Computer Use > Security Guardian Policy Engine                                      |
+-------------------------------------------------------------------------------------------------------------+
| Hardware Session Watchdog                                                                                   |
|  [X] LockScreen Watchdog (zo.guardian_denied)                                                               |
|      Hooks WTS_SESSION_LOCK. Instantly freezes mouse/keyboard automation when screen locks or screensaver runs.|
|                                                                                                             |
| 4-Tier Policy Threshold Matrix                                                                              |
| Configure the confirmation level required before the agent can execute specific categories of actions:     |
|                                                                                                             |
|  ACTION CATEGORY                   | CONFIRMATION LEVEL REQUIRED                                            |
|  ----------------------------------+----------------------------------------------------------------------- |
|  File Read (Project directory)     | [ Tier 1: Auto-Execute (No confirmation)                             v ]|
|  File Write / Modify               | [ Tier 3: Pre-Approval Required (Show Diff Modal)                    v ]|
|  Shell Read Commands (ls, git log) | [ Tier 1: Auto-Execute (No confirmation)                             v ]|
|  Shell Mutating Commands (npm i)   | [ Tier 2: Post-Notification (Toast with Undo)                         v ]|
|  Shell Destructive (rm -rf, drop)  | [ Tier 4: Air-Gapped Confirmation (Physical Token / Master Password) v ]|
|  Desktop Mouse Click / Key Press   | [ Tier 3: Pre-Approval Required (Highlight Target)                   v ]|
|  Browser Form Submission (Payment) | [ Tier 4: Air-Gapped Confirmation (Physical Token / Master Password) v ]|
|                                                                                                             |
| Protected Path Blacklist (Agent Access Strictly Blocked)                                                    |
| +---------------------------------------------------------------------------------------------------------+ |
| | ~/.ssh/**                                                                                               | |
| | ~/.aws/**                                                                                               | |
| | **/.env*                                                                                                | |
| | C:\Windows\System32\**                                                                                  | |
| +---------------------------------------------------------------------------------------------------------+ |
|                                                                                                             |
| [ Add Blacklist Rule ]                                                                      [ Save Policy ] |
+-------------------------------------------------------------------------------------------------------------+
```

### 3.3 Module 21: System Doctor Diagnostics Dashboard
```
+-------------------------------------------------------------------------------------------------------------+
| Settings > System, Privacy & Diagnostics > System Doctor Diagnostics                                        |
+-------------------------------------------------------------------------------------------------------------+
| Hardware & Environment Readiness Status                                          [ Run Full Diagnostic (F5) ]|
| Overall System Health: [ ● READY TO RUN ]  - All 10 Core Subsystems Operational.                            |
|                                                                                                             |
| PROBE NAME                   | CURRENT STATUS            | DETECTED VALUE                     | REMEDIATION |
| -----------------------------+---------------------------+------------------------------------+------------ |
| 1. OS & Architecture         | [ PASS ]                  | Windows 11 Pro 64-bit (Build 22631)| None        |
| 2. Node.js Runtime           | [ PASS ]                  | v20.18.0                           | None        |
| 3. Rust Toolchain            | [ PASS ]                  | cargo 1.84.0 (stable-msvc)         | None        |
| 4. Git CLI                   | [ PASS ]                  | git version 2.45.2.windows.1       | None        |
| 5. FFmpeg Video Encoder      | [ PASS ]                  | ffmpeg 7.0.1-essentials_build      | None        |
| 6. GPU & VRAM Allocation     | [ PASS ]                  | NVIDIA GeForce RTX 4090 (24564 MB) | None        |
| 7. Direct3D 11 / WGC         | [ PASS ]                  | WGC Supported, D3D11 Feature 12_1  | None        |
| 8. Daemon Port 1469 Bind     | [ PASS ]                  | Free & Available (0.0.0.0:1469)    | None        |
| 9. Storage & Write Access    | [ PASS ]                  | ~/.superagent (412 GB free space)  | None        |
| 10. Microphone Input Stream  | [ PASS ]                  | Realtek High Definition Audio      | None        |
|                                                                                                             |
| Diagnostic Log Output:                                                                                      |
| [14:22:01] INFO  Probing GPU VRAM via NVML: RTX 4090 detected, 24564 MB total, 21400 MB free.              |
| [14:22:01] INFO  Verifying WGC Direct3D11 swapchain initialization: Succeeded in 18ms.                      |
| [14:22:02] INFO  Attempting ephemeral TCP bind on 127.0.0.1:1469: Socket open and closed cleanly.           |
|                                                                                                             |
| [ Copy Diagnostic Report to Clipboard ]                                            [ Export JSON Report ]   |
+-------------------------------------------------------------------------------------------------------------+
```

---

## 4. Standardized Demo Stubs

### 4.1 Demo Stub: Settings Store Configuration
The following TypeScript model provides a complete, typed mock representation of all 24 settings modules for frontend development, storybooks, and automated testing:

```typescript
// ============================================================================
// [DEMO_STUB: SettingsStoreConfigurationDemo]
// DESCRIPTION: Complete typed mock configuration for all 24 Settings Modules.
// BACKEND_ROUTE: GET /api/settings -> superagent_core_v2::storage::settings
// SEARCH_TAG: #DEMO_SETTINGS_STORE_CONFIG
// ============================================================================

export interface SuperAgentSettingsSchema {
  general: {
    hostDisplayName: string;
    theme: 'dark' | 'light' | 'system' | 'high_contrast';
    uiZoomLevel: number;
    language: string;
    soundEffectsEnabled: boolean;
    completionChime: string;
    errorAlertTone: boolean;
    autoSaveIntervalSec: number;
  };
  providers: {
    activeDefaultProvider: string;
    activeDefaultModel: string;
    apiKeys: Record<string, { isSet: boolean; maskedKey: string; customBaseUrl?: string }>;
  };
  localModels: {
    backend: 'ollama' | 'lmstudio' | 'vllm' | 'disabled';
    ollamaEndpoint: string;
    lmstudioEndpoint: string;
    contextWindowOverride: number;
    gpuLayerOffload: number;
  };
  localImageModels: {
    backend: 'comfyui' | 'sd_webui_forge' | 'diffusers_local';
    serverUrl: string;
    defaultCheckpoint: string;
    loraDirectory: string;
    enableVramOffload: boolean;
    defaultSteps: number;
    defaultCfg: number;
  };
  localVideoModels: {
    backend: 'comfyui_video' | 'native_diffusers' | 'remote_slurm';
    activeCheckpoint: string;
    vramBudgetGb: number;
    enableTeacache: boolean;
    temporalTiling: boolean;
    defaultFps: number;
  };
  mcp: {
    servers: Array<{
      id: string;
      name: string;
      transport: 'stdio' | 'sse';
      command?: string;
      args?: string[];
      sseUrl?: string;
      isEnabled: boolean;
      status: 'running' | 'stopped' | 'error';
      toolCount: number;
      latencyMs: number;
    }>;
  };
  usage: {
    monthlyBudgetCapUsd: number;
    budgetAlertThresholdPercent: number;
    hardCapEnforcement: boolean;
    pricingOverrides: Record<string, { promptPerMillion: number; completionPerMillion: number }>;
  };
  memory: {
    enablePersistentMemory: boolean;
    compactionTokenThreshold: number;
    autoCompactionStrategy: 'summarize_and_prune' | 'vector_cluster' | 'sliding_window';
    projectRulesAutoDetect: boolean;
    facts: Record<string, string>;
  };
  voice: {
    sttEngine: 'whisper_local' | 'whisper_cloud_openai' | 'groq_whisper' | 'web_speech';
    whisperModelSize: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';
    pushToTalkHotkey: string;
    ttsEngine: 'elevenlabs' | 'openai_tts' | 'webspeech' | 'disabled';
    autoSpeakResponses: boolean;
  };
  telegram: {
    botTokenConfigured: boolean;
    connectionMode: 'long_polling' | 'webhook';
    allowedUserIds: string[];
    allowVoiceNotes: boolean;
    remoteImageDelivery: boolean;
  };
  computerUse: {
    captureBackend: 'wgc_direct3d11' | 'bitblt' | 'core_graphics' | 'wayland_portal';
    coordinateUnscalingMode: 'dpi_aware_physical' | 'logical_virtual_screen' | 'client_relative';
    mouseEmulationMode: 'humanized_bezier' | 'instant_snap' | 'linear_interpolated';
    mouseMoveSpeedMs: number;
    actionSafetyDelayMs: number;
    inputSafetyLockHotkey: string;
    enableKeystrokeSimulation: boolean;
    highlightTargetElements: boolean;
  };
  browserLeasing: {
    cdpEndpointMode: 'auto_launch_isolated' | 'attach_existing_chrome';
    cdpPort: number;
    tabLeasePolicy: 'prefer_existing_claim' | 'always_new_tab' | 'isolated_incognito';
    cookieIsolation: boolean;
    inPageWebMcpInjection: boolean;
    injectInDomAgentIndicator: boolean;
    headlessMode: boolean;
    defaultViewport: string;
  };
  securityGuardian: {
    lockScreenWatchdogEnabled: boolean;
    confirmationTiers: Record<string, 1 | 2 | 3 | 4>;
    protectedPathBlacklist: string[];
    allowedNetworkOriginsWhitelist: string[];
    crossOriginIframeBlocking: boolean;
  };
  companion: {
    activeVrmModel: string;
    graphicsFidelity: 'low' | 'medium' | 'high';
    springBonePhysics: boolean;
    proceduralEyeTracking: boolean;
    mouseTrackingSensitivity: number;
    lipSyncSensitivity: number;
    emotionReactionLevel: 'subtle' | 'expressive' | 'dramatic' | 'disabled';
    desktopPetWindowOpacity: number;
    desktopPetAlwaysOnTop: boolean;
  };
  webHosting: {
    serverPort: number;
    bindInterface: '127.0.0.1' | '0.0.0.0';
    autoStartOnBoot: boolean;
    enableScryptAuth: boolean;
    sessionCookieTtlHours: number;
  };
  threeDStudio: {
    renderingBackend: 'webgpu_preferred' | 'webgl2_fallback';
    shadowMapResolution: number;
    antiAliasing: 'none' | 'fxaa' | 'msaa_2x' | 'msaa_4x';
    meshExportFormat: 'gltf' | 'glb' | 'usdz' | 'obj';
    dracoCompressionLevel: number;
  };
  ecad: {
    kicadCliPath: string;
    defaultPcbLayers: '2_layer' | '4_layer' | '6_layer' | '8_layer';
    minimumTraceWidthMil: number;
    minimumClearanceMil: number;
    manufacturerPreset: 'jlcpcb_standard' | 'pcbway_standard' | 'oshpark_custom';
    autoRunDrcOnGenerate: boolean;
  };
  artifacts: {
    portRangeStart: number;
    portRangeEnd: number;
    processIsolationMode: 'native_subprocesses' | 'docker_containers';
    hotReloadFileWatcher: boolean;
    autoTerminateOrphans: boolean;
    maxMemoryPerArtifactMb: number;
  };
  storage: {
    workspaceRootDir: string;
    chatHistoryRetentionDays: '30_days' | '90_days' | '1_year' | 'forever';
  };
  updates: {
    releaseChannel: 'stable' | 'beta' | 'nightly';
    autoCheckUpdates: boolean;
  };
  notifications: {
    systemDesktopNotifications: boolean;
    notifyOnAgentTaskComplete: boolean;
    notifyOnPermissionRequired: boolean;
    notifyOnAgentError: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
  telemetry: {
    strictLocalMode: boolean;
    anonymousCrashReporting: boolean;
    piiPromptScrubber: boolean;
    auditLogRetentionDays: number;
  };
  shortcuts: {
    keybindings: Record<string, string>;
  };
}

export const DEMO_SETTINGS_STORE: SuperAgentSettingsSchema = {
  general: {
    hostDisplayName: 'Alex Mercer',
    theme: 'dark',
    uiZoomLevel: 100,
    language: 'English',
    soundEffectsEnabled: true,
    completionChime: 'gentle_bell',
    errorAlertTone: true,
    autoSaveIntervalSec: 30,
  },
  providers: {
    activeDefaultProvider: 'anthropic',
    activeDefaultModel: 'claude-3-5-sonnet-20241022',
    apiKeys: {
      anthropic: { isSet: true, maskedKey: 'sk-ant-api03-••••••••••••••••••••••••-AA' },
      openai: { isSet: true, maskedKey: 'sk-proj-••••••••••••••••••••••••-99' },
      gemini: { isSet: false, maskedKey: '' },
    },
  },
  localModels: {
    backend: 'ollama',
    ollamaEndpoint: 'http://localhost:11434',
    lmstudioEndpoint: 'http://localhost:1234/v1',
    contextWindowOverride: 32768,
    gpuLayerOffload: 33,
  },
  localImageModels: {
    backend: 'comfyui',
    serverUrl: 'http://127.0.0.1:8188',
    defaultCheckpoint: 'flux1-dev-fp8.safetensors',
    loraDirectory: 'C:/Users/Alex/.superagent/models/loras',
    enableVramOffload: true,
    defaultSteps: 28,
    defaultCfg: 3.5,
  },
  localVideoModels: {
    backend: 'comfyui_video',
    activeCheckpoint: 'Wan2.1-T2V-14B',
    vramBudgetGb: 22,
    enableTeacache: true,
    temporalTiling: true,
    defaultFps: 24,
  },
  mcp: {
    servers: [
      {
        id: 'srv-brave',
        name: 'Brave Search',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        isEnabled: true,
        status: 'running',
        toolCount: 2,
        latencyMs: 14,
      },
      {
        id: 'srv-postgres',
        name: 'PostgreSQL Local',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://postgres:secret@localhost:5432/devdb'],
        isEnabled: true,
        status: 'running',
        toolCount: 5,
        latencyMs: 8,
      },
    ],
  },
  usage: {
    monthlyBudgetCapUsd: 100.0,
    budgetAlertThresholdPercent: 80,
    hardCapEnforcement: true,
    pricingOverrides: {
      'claude-3-5-sonnet-20241022': { promptPerMillion: 3.0, completionPerMillion: 15.0 },
      'gpt-4o': { promptPerMillion: 2.5, completionPerMillion: 10.0 },
    },
  },
  memory: {
    enablePersistentMemory: true,
    compactionTokenThreshold: 32000,
    autoCompactionStrategy: 'summarize_and_prune',
    projectRulesAutoDetect: true,
    facts: {
      'preferred_language': 'TypeScript / Rust',
      'editor': 'Visual Studio Code',
      'git_workflow': 'Trunk-based development with feature branches',
    },
  },
  voice: {
    sttEngine: 'whisper_local',
    whisperModelSize: 'base',
    pushToTalkHotkey: 'Ctrl+Space',
    ttsEngine: 'elevenlabs',
    autoSpeakResponses: false,
  },
  telegram: {
    botTokenConfigured: true,
    connectionMode: 'long_polling',
    allowedUserIds: ['987654321'],
    allowVoiceNotes: true,
    remoteImageDelivery: true,
  },
  computerUse: {
    captureBackend: 'wgc_direct3d11',
    coordinateUnscalingMode: 'dpi_aware_physical',
    mouseEmulationMode: 'humanized_bezier',
    mouseMoveSpeedMs: 240,
    actionSafetyDelayMs: 350,
    inputSafetyLockHotkey: 'Escape',
    enableKeystrokeSimulation: true,
    highlightTargetElements: true,
  },
  browserLeasing: {
    cdpEndpointMode: 'attach_existing_chrome',
    cdpPort: 9222,
    tabLeasePolicy: 'prefer_existing_claim',
    cookieIsolation: false,
    inPageWebMcpInjection: true,
    injectInDomAgentIndicator: true,
    headlessMode: false,
    defaultViewport: '1920x1080',
  },
  securityGuardian: {
    lockScreenWatchdogEnabled: true,
    confirmationTiers: {
      'file_read': 1,
      'file_write': 3,
      'shell_readonly': 1,
      'shell_mutating': 2,
      'shell_destructive': 4,
      'computer_use_input': 3,
      'browser_payment_form': 4,
    },
    protectedPathBlacklist: [
      '~/.ssh/**',
      '~/.aws/**',
      '**/.env*',
      'C:\\Windows\\System32\\**',
    ],
    allowedNetworkOriginsWhitelist: ['*.github.com', '*.npmjs.org', 'localhost:*'],
    crossOriginIframeBlocking: true,
  },
  companion: {
    activeVrmModel: 'default_companion.vrm',
    graphicsFidelity: 'high',
    springBonePhysics: true,
    proceduralEyeTracking: true,
    mouseTrackingSensitivity: 1.0,
    lipSyncSensitivity: 1.2,
    emotionReactionLevel: 'expressive',
    desktopPetWindowOpacity: 0.95,
    desktopPetAlwaysOnTop: true,
  },
  webHosting: {
    serverPort: 1469,
    bindInterface: '0.0.0.0',
    autoStartOnBoot: true,
    enableScryptAuth: true,
    sessionCookieTtlHours: 168,
  },
  threeDStudio: {
    renderingBackend: 'webgpu_preferred',
    shadowMapResolution: 2048,
    antiAliasing: 'msaa_4x',
    meshExportFormat: 'glb',
    dracoCompressionLevel: 7,
  },
  ecad: {
    kicadCliPath: 'C:/Program Files/KiCad/8.0/bin/kicad-cli.exe',
    defaultPcbLayers: '4_layer',
    minimumTraceWidthMil: 6.0,
    minimumClearanceMil: 6.0,
    manufacturerPreset: 'jlcpcb_standard',
    autoRunDrcOnGenerate: true,
  },
  artifacts: {
    portRangeStart: 3000,
    portRangeEnd: 3999,
    processIsolationMode: 'native_subprocesses',
    hotReloadFileWatcher: true,
    autoTerminateOrphans: true,
    maxMemoryPerArtifactMb: 1024,
  },
  storage: {
    workspaceRootDir: 'C:/Users/Alex/.superagent',
    chatHistoryRetentionDays: 'forever',
  },
  updates: {
    releaseChannel: 'stable',
    autoCheckUpdates: true,
  },
  notifications: {
    systemDesktopNotifications: true,
    notifyOnAgentTaskComplete: true,
    notifyOnPermissionRequired: true,
    notifyOnAgentError: true,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  },
  telemetry: {
    strictLocalMode: false,
    anonymousCrashReporting: false,
    piiPromptScrubber: true,
    auditLogRetentionDays: 30,
  },
  shortcuts: {
    keybindings: {
      'global.circle_search': 'Ctrl+Shift+S',
      'global.voice_dictation': 'Ctrl+Space',
      'global.tray_launcher': 'Ctrl+Shift+A',
      'app.new_chat': 'Ctrl+N',
      'app.command_palette': 'Ctrl+K',
      'app.settings': 'Ctrl+,',
      'app.abort_run': 'Escape',
    },
  },
};
// ============================================================================
// [END_DEMO_STUB: SettingsStoreConfigurationDemo]
// ============================================================================
```

---

### 4.2 Demo Stub: System Doctor Readiness Report
The following mock report models all 10 diagnostic probes for the System Doctor view:

```typescript
// ============================================================================
// [DEMO_STUB: SystemDoctorReadinessReportDemo]
// DESCRIPTION: Mock diagnostic payload generated by System Doctor probes.
// BACKEND_ROUTE: GET /api/doctor/diagnostics -> superagent_core_v2::server::routes::doctor
// SEARCH_TAG: #DEMO_SYSTEM_DOCTOR_REPORT
// ============================================================================

export interface SystemDoctorProbeResult {
  id: string;
  name: string;
  category: 'system' | 'runtime' | 'hardware' | 'network' | 'storage';
  status: 'pass' | 'warn' | 'fail';
  detectedValue: string;
  remediationAction?: string;
  remediationCommand?: string;
  latencyMs: number;
}

export interface SystemDoctorReport {
  timestamp: string;
  overallStatus: 'ready' | 'degraded' | 'critical';
  probes: SystemDoctorProbeResult[];
  logs: string[];
}

export const DEMO_SYSTEM_DOCTOR_REPORT: SystemDoctorReport = {
  timestamp: '2026-10-14T14:22:01.482Z',
  overallStatus: 'ready',
  probes: [
    {
      id: 'probe_os',
      name: 'OS Architecture & Kernel',
      category: 'system',
      status: 'pass',
      detectedValue: 'Windows 11 Pro 64-bit (Build 22631.3880)',
      latencyMs: 2,
    },
    {
      id: 'probe_node',
      name: 'Node.js Runtime',
      category: 'runtime',
      status: 'pass',
      detectedValue: 'v20.18.0 (Satisfies >= 18.0.0)',
      latencyMs: 12,
    },
    {
      id: 'probe_rust',
      name: 'Rust Toolchain',
      category: 'runtime',
      status: 'pass',
      detectedValue: 'cargo 1.84.0 (stable-msvc)',
      latencyMs: 15,
    },
    {
      id: 'probe_git',
      name: 'Git CLI & Identity',
      category: 'runtime',
      status: 'pass',
      detectedValue: 'git version 2.45.2.windows.1 (user.name configured)',
      latencyMs: 8,
    },
    {
      id: 'probe_ffmpeg',
      name: 'FFmpeg Video Encoder',
      category: 'runtime',
      status: 'pass',
      detectedValue: 'ffmpeg 7.0.1-essentials_build (libx264, nvenc available)',
      latencyMs: 14,
    },
    {
      id: 'probe_gpu_vram',
      name: 'GPU Acceleration & VRAM',
      category: 'hardware',
      status: 'pass',
      detectedValue: 'NVIDIA GeForce RTX 4090 (24564 MB Dedicated VRAM)',
      latencyMs: 24,
    },
    {
      id: 'probe_wgc',
      name: 'Direct3D 11 / WGC Capture',
      category: 'hardware',
      status: 'pass',
      detectedValue: 'Windows.Graphics.Capture supported; D3D11 device ready',
      latencyMs: 18,
    },
    {
      id: 'probe_port_bind',
      name: 'Port 1469 Bind Test',
      category: 'network',
      status: 'pass',
      detectedValue: 'TCP 0.0.0.0:1469 free and unbound',
      latencyMs: 4,
    },
    {
      id: 'probe_storage',
      name: 'Disk Write Permissions & Storage',
      category: 'storage',
      status: 'pass',
      detectedValue: 'C:/Users/Alex/.superagent writable (412.8 GB free space)',
      latencyMs: 6,
    },
    {
      id: 'probe_audio',
      name: 'Microphone & Audio Stream',
      category: 'hardware',
      status: 'pass',
      detectedValue: 'Realtek High Definition Audio (Default 48000Hz stereo)',
      latencyMs: 11,
    },
  ],
  logs: [
    '[14:22:01.450] [probe_os] Inspected Windows registry and system metrics.',
    '[14:22:01.462] [probe_gpu_vram] Initialized NVML; detected RTX 4090 with 24564 MB VRAM.',
    '[14:22:01.470] [probe_wgc] Created Direct3D11 swapchain device context; WGC feature level verified.',
    '[14:22:01.475] [probe_port_bind] Successfully opened and closed test TCP listener on port 1469.',
    '[14:22:01.482] All 10 probes passed with 0 warnings and 0 failures.',
  ],
};
// ============================================================================
// [END_DEMO_STUB: SystemDoctorReadinessReportDemo]
// ============================================================================
```

---

## 5. Comprehensive Test Case Catalog

The following test suites must be implemented in TypeScript/Vitest and Rust integration tests to verify the governance system:

| Test ID | Test Scenario | Steps to Execute | Expected Result & Verification |
| :--- | :--- | :--- | :--- |
| `TC-SET-01` | **Port 1469 Conflict Detection** | 1. Start external mock server listening on TCP `1469`.<br>2. Navigate to Web App Hosting settings.<br>3. Trigger "Test Port Availability" or click Save. | UI displays red error banner: `Port 1469 is already in use by PID <xyz>`. Daemon warns user and suggests alternate port `1470`. Save is blocked. |
| `TC-SET-02` | **Corrupted Settings File Recovery** | 1. Terminate daemon.<br>2. Write invalid JSON syntax to `~/.superagent/settings.json`.<br>3. Boot SuperAgent daemon. | Daemon detects invalid syntax, renames corrupt file to `settings.json.corrupt.<timestamp>`, logs warning, initializes default settings, and boots cleanly without crashing. |
| `TC-SET-03` | **API Key Obfuscation & Wire Security** | 1. Configure OpenAI API key `sk-proj-1234567890abcdef`.<br>2. Save settings.<br>3. Inspect WebSocket payload for `settings.get`. | WebSocket response contains `maskedKey: "sk-proj-••••••••cdef"` and `isSet: true`. Raw key is never exposed across the network. |
| `TC-SET-04` | **Provider Proxy Connection Timeout** | 1. In Provider Registry, set Custom Base URL to unreachable IP `10.255.255.1`.<br>2. Click "Test Connection". | Request times out after strictly 5000ms. UI status pill transitions to amber: `Connection timed out (504 Gateway Timeout)`. Error does not block other tabs. |
| `TC-SET-05` | **WGC Capture Failure Fallback** | 1. Simulate D3D11 device removal error in WGC probe.<br>2. Run System Doctor diagnostic. | Probe #7 flags warning: `WGC Direct3D11 Unavailable`. Remediation card advises falling back to BitBlt and automatically updates `computerUse.captureBackend` setting. |
| `TC-SET-06` | **LockScreen Watchdog Automation Abort** | 1. Initiate active Computer Use mouse trajectory.<br>2. Post simulated Windows message `WM_WTSSESSION_CHANGE` with `WTS_SESSION_LOCK`. | Within < 10ms, `zo.guardian_denied` event fires. All mouse movements halt immediately. Active step transitions to `FAILED: LockScreen active`. |
| `TC-SET-07` | **4-Tier Policy Escalation Check** | 1. Set `shell_destructive` to Tier 4.<br>2. Direct agent to execute `rm -rf /tmp/test-project`. | Agent loop halts. Tier 4 Air-Gapped Confirmation modal appears requiring explicit typed password / token confirmation. Attempting to bypass via prompt injection fails. |
| `TC-SET-08` | **Protected Path Blacklist Blocking** | 1. Attempt agent tool execution `file_ops::read_file` targeting `~/.ssh/id_rsa`. | Security Guardian intercepts request before execution. Rejects with error `Access Denied: Path matches protected blacklist pattern ~/.ssh/**`. |
| `TC-SET-09` | **Disk Space Low Warning** | 1. Mock `probe_storage` free space to `800 MB` (< 2 GB minimum). | Probe flags red failure: `Low Disk Space (800 MB free)`. System Doctor displays cleanup recommendation button linking directly to Storage Cache Purge. |
| `TC-SET-10` | **Keybinding Conflict Detection** | 1. Attempt to assign `Ctrl+Space` (Voice Dictation) to "Circle Search". | UI rings red border on input: `Shortcut already assigned to Voice Dictation Overlay`. Save button remains disabled until resolved. |
