# OmniRoute Provider & `oc/big-pickle` Investigation Findings

## Executive Summary
An intensive empirical investigation of the **OmniRoute Local Provider** (`http://127.0.0.1:20128/v1`) using the model `oc/big-pickle` was conducted.

The provider endpoint is functional and fully capable of streaming completions, multi-turn system prompts, and JSON tool calling schema execution when consumed with a sanitized request structure and exponential backoff retry handling.

---

## Key Technical Findings

### 1. Payload Sensitivity (HTTP 500 Triggers)
* **Explicit `stream` Parameter**: Sending `stream: true` or `stream: false` in the request body triggers an HTTP 500 error from OmniRoute proxy (`[500]: Internal server error`). OmniRoute defaults to SSE streaming (`text/event-stream`).
* **Unsupported Hyperparameters**: Passing traditional OpenAI parameters like `temperature`, `max_tokens`, or `top_p` causes HTTP 500 server errors on the `oc/big-pickle` model route.
* **Supported Hyperparameters**: `max_completion_tokens`, `tools`, and `reasoning_effort` are fully supported.

### 2. Upstream Concurrency & Rate Limit Behavior
* Rapid back-to-back requests to `oc/big-pickle` can trigger transient HTTP 500 errors from the upstream provider proxy.
* **Resolution**: Implementing exponential backoff retries (2s, 4s, 8s) automatically resolves transient failures and yields a 100% success rate across test suites.

### 3. Capability Verification
* **Model Discovery (`GET /v1/models`)**: Model `oc/big-pickle` identified (`owned_by: opencode`, `context_length: 200000`).
* **Streaming SSE Parser**: Successfully decodes text deltas and reasoning tokens from `data: {...}` stream chunks.
* **Tool / Function Calling**: Fully supports JSON tool calling dispatch (e.g. generating `tool_calls` array with function name and parsed JSON arguments).
* **Multi-Turn Context**: Handles system instructions and conversation turns reliably.

---

## Reproduction & Verification Steps

1. Execute the production test script located at `/test/omniroute-perfect-client.js`:
   ```bash
   node test/omniroute-perfect-client.js
   ```
2. Verification Results:
   * Test 1 (Model Discovery): `PASSED`
   * Test 2 (Streaming Execution): `PASSED`
   * Test 3 (System Prompt & Multi-turn): `PASSED`
   * Test 4 (Tool Calling Schema): `PASSED`
   * Test 5 (Parameter Sanitization Defense): `PASSED`
   * Overall Result: **5 PASSED, 0 FAILED**
