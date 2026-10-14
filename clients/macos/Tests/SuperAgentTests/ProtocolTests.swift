//
// ProtocolTests.swift
// SuperAgentTests
//
// XCTest suite testing roundtrip Codable serialization of all AgentStreamEvent
// variants, WireMessage, IpcRequestEnvelope, and subscription payloads, as well as
// serialization and mock state transitions across all 10 SuperAgent workspaces and demo datasets.
//

import XCTest
@testable import SuperAgent

final class ProtocolTests: XCTestCase {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    // MARK: - AgentStreamEvent Tests

    func testStartTurnEventSerialization() throws {
        let json = """
        {"type":"start_turn","sessionId":"s1","model":"gpt-4o"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .startTurn(sessionId: "s1", model: "gpt-4o"))
        XCTAssertEqual(event.sessionId, "s1")
        XCTAssertEqual(event.eventType, "start_turn")

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testTokenEventSerialization() throws {
        let json = """
        {"type":"token","sessionId":"sess-123","content":"Hello world"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .token(sessionId: "sess-123", content: "Hello world"))
        XCTAssertEqual(event.sessionId, "sess-123")
        XCTAssertEqual(event.eventType, "token")

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testThoughtEventSerialization() throws {
        let json = """
        {"type":"thought","sessionId":"s1","content":"Reasoning chain..."}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .thought(sessionId: "s1", content: "Reasoning chain..."))
        XCTAssertEqual(event.sessionId, "s1")
        XCTAssertEqual(event.eventType, "thought")

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testToolCallEventSerialization() throws {
        let json = """
        {"type":"tool_call","sessionId":"s1","toolCallId":"call-1","toolName":"file_read","toolArgs":{"path":"foo.txt"}}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        switch event {
        case .toolCall(let sid, let callId, let name, let args):
            XCTAssertEqual(sid, "s1")
            XCTAssertEqual(callId, "call-1")
            XCTAssertEqual(name, "file_read")
            XCTAssertEqual(args, AnyCodable(["path": "foo.txt"]))
        default:
            XCTFail("Expected toolCall event")
        }

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testToolResultEventSerialization() throws {
        let json = """
        {"type":"tool_result","sessionId":"s1","toolCallId":"call-1","toolResult":"file contents","isError":false}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .toolResult(sessionId: "s1", toolCallId: "call-1", toolResult: AnyCodable("file contents"), isError: false))

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testStepCompleteEventSerialization() throws {
        let json = """
        {"type":"step_complete","sessionId":"s1","stepIndex":2}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .stepComplete(sessionId: "s1", stepIndex: 2))

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testDoneEventSerialization() throws {
        let json = """
        {"type":"done","sessionId":"s1","stopReason":"stop"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .done(sessionId: "s1", stopReason: "stop"))

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testErrorEventSerialization() throws {
        let json = """
        {"type":"error","sessionId":"s1","error":"Connection timeout"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .error(sessionId: "s1", error: "Connection timeout"))

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testAbortEventSerialization() throws {
        let json = """
        {"type":"abort","sessionId":"s1"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .abort(sessionId: "s1"))

        let reencoded = try encoder.encode(event)
        let reparsed = try decoder.decode(AgentStreamEvent.self, from: reencoded)
        XCTAssertEqual(reparsed, event)
    }

    func testCamelCaseEventCompatibility() throws {
        let json = """
        {"type":"startTurn","sessionId":"s2","model":"claude-3-5"}
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let event = try decoder.decode(AgentStreamEvent.self, from: data)

        XCTAssertEqual(event, .startTurn(sessionId: "s2", model: "claude-3-5"))
    }

    // MARK: - WireMessage Tests

    func testWireMessageAgentEvent() throws {
        let event = AgentStreamEvent.token(sessionId: "session-abc", content: "chunk")
        let wire = WireMessage.agentEvent(channel: "agent-event", data: event)

        let reencoded = try encoder.encode(wire)
        let jsonString = try XCTUnwrap(String(data: reencoded, encoding: .utf8))
        XCTAssertTrue(jsonString.contains("\"channel\":\"agent-event\""))

        let reparsed = try decoder.decode(WireMessage.self, from: reencoded)
        XCTAssertEqual(reparsed, wire)
    }

    func testWireMessageSessionSync() throws {
        let payload = SessionSyncPayload(
            sessionId: "s-1",
            isRunning: true,
            replayEvents: [],
            fullAssistantText: "Hello",
            fullThoughtText: "Thinking",
            pendingTool: nil
        )
        let wire = WireMessage.sessionSync(channel: "session-sync", data: payload)

        let reencoded = try encoder.encode(wire)
        let jsonString = try XCTUnwrap(String(data: reencoded, encoding: .utf8))
        XCTAssertTrue(jsonString.contains("\"channel\":\"session-sync\""))

        let reparsed = try decoder.decode(WireMessage.self, from: reencoded)
        XCTAssertEqual(reparsed, wire)
    }

    func testWireMessagePong() throws {
        let pong = PongMessage(action: "PONG", timestamp: 1700000000000)
        let wire = WireMessage.pong(pong)

        let reencoded = try encoder.encode(wire)
        let jsonString = try XCTUnwrap(String(data: reencoded, encoding: .utf8))
        XCTAssertTrue(jsonString.contains("\"action\":\"PONG\""))

        let reparsed = try decoder.decode(WireMessage.self, from: reencoded)
        XCTAssertEqual(reparsed, wire)
    }

    // MARK: - IPC Envelopes & DTOs

    func testIpcRequestEnvelopeRoundtrip() throws {
        let req = AgentRunRequest(sessionId: "s-1", prompt: "Hello agent")
        let envelope = IpcRequestEnvelope(channel: Commands.agentRun, args: [req])

        let data = try encoder.encode(envelope)
        let parsed = try decoder.decode(IpcRequestEnvelope<AgentRunRequest>.self, from: data)

        XCTAssertEqual(parsed.channel, "agent-run")
        XCTAssertEqual(parsed.args.count, 1)
        XCTAssertEqual(parsed.args.first?.prompt, "Hello agent")
        XCTAssertEqual(parsed.args.first?.sessionId, "s-1")
    }

    func testIpcResponseEnvelope() throws {
        let res = AgentStatusResponse(sessionId: "s-1", isRunning: true)
        let envelope = IpcResponseEnvelope(data: res, error: nil)

        let data = try encoder.encode(envelope)
        let parsed = try decoder.decode(IpcResponseEnvelope<AgentStatusResponse>.self, from: data)

        XCTAssertEqual(parsed.data?.sessionId, "s-1")
        XCTAssertEqual(parsed.data?.isRunning, true)
        XCTAssertNil(parsed.error)
    }

    func testSubscriptionRequests() throws {
        let sub = SubscribeSessionRequest(sessionId: "sess-100")
        let subData = try encoder.encode(sub)
        let subJson = try XCTUnwrap(String(data: subData, encoding: .utf8))
        XCTAssertTrue(subJson.contains("\"action\":\"SUBSCRIBE_SESSION\""))
        XCTAssertTrue(subJson.contains("\"sessionId\":\"sess-100\""))

        let unsub = UnsubscribeSessionRequest(sessionId: "sess-100")
        let unsubData = try encoder.encode(unsub)
        let unsubJson = try XCTUnwrap(String(data: unsubData, encoding: .utf8))
        XCTAssertTrue(unsubJson.contains("\"action\":\"UNSUBSCRIBE_SESSION\""))

        let sync = SyncSessionRequest(sessionId: "sess-100")
        let syncData = try encoder.encode(sync)
        let syncJson = try XCTUnwrap(String(data: syncData, encoding: .utf8))
        XCTAssertTrue(syncJson.contains("\"action\":\"SYNC_SESSION\""))
    }

    func testPortDiscoveryFallback() {
        XCTAssertEqual(DaemonDiscovery.defaultPort, 1469)
    }

    // MARK: - Workspace Demo Data Serialization Tests

    func testComputerUseDemoDataRoundtrip() throws {
        // Test Windows list
        let windowsData = try encoder.encode(DEMO_WINDOWS)
        let decodedWindows = try decoder.decode([WindowItemDemo].self, from: windowsData)
        XCTAssertEqual(decodedWindows.count, DEMO_WINDOWS.count)
        XCTAssertEqual(decodedWindows.first?.hwnd, "0x000A04E2")
        XCTAssertTrue(decodedWindows.first?.isOccluded ?? false)

        // Test Accessibility Tree with elementIndex 10
        let axData = try encoder.encode(DEMO_ACCESSIBILITY_TREE)
        let decodedAx = try decoder.decode(AccessibilityNodeDemo.self, from: axData)
        XCTAssertEqual(decodedAx.elementIndex, 0)
        let editorNode = decodedAx.children?.last?.children?.first
        XCTAssertEqual(editorNode?.elementIndex, 10)
        XCTAssertEqual(editorNode?.role, "EditField")
        XCTAssertTrue(editorNode?.isFocused ?? false)

        // Test Occluded Capture Metadata & Trajectory
        let capData = try encoder.encode(DEMO_OCCLUDED_CAPTURE)
        let decodedCap = try decoder.decode(CaptureFrameMetadataDemo.self, from: capData)
        XCTAssertEqual(decodedCap.frameId, 40192)
        XCTAssertEqual(decodedCap.settlingState.baseDelayMs, 1000)
        XCTAssertEqual(decodedCap.settlingState.spinnerHoldMs, 1420)
        XCTAssertEqual(decodedCap.activeTrajectory?.targetElementIndex, 10)
        XCTAssertEqual(decodedCap.activeTrajectory?.velocityPxPerSec, 1420.0)
    }

    func testBrowserLeasingDemoDataRoundtrip() throws {
        let tabsData = try encoder.encode(DEMO_CLAIMED_TABS)
        let decodedTabs = try decoder.decode([BrowserTabDemo].self, from: tabsData)
        XCTAssertEqual(decodedTabs.count, 3)
        XCTAssertEqual(decodedTabs.first?.mentionKey, "@tab-checkout")
        XCTAssertEqual(decodedTabs.first?.tierType, "claimed_existing")

        let toolsData = try encoder.encode(DEMO_WEBMCP_TOOLS)
        let decodedTools = try decoder.decode([WebMcpToolDemo].self, from: toolsData)
        XCTAssertEqual(decodedTools.count, 4)
        XCTAssertEqual(decodedTools.first?.name, "fill_checkout_form")
        XCTAssertEqual(decodedTools.first?.avgExecutionMs, 14.2)

        let eventsData = try encoder.encode(DEMO_CDP_EVENTS)
        let decodedEvents = try decoder.decode([CdpEventDemo].self, from: eventsData)
        XCTAssertEqual(decodedEvents.count, 5)
        XCTAssertEqual(decodedEvents.first?.category, "Network")
    }

    func testSecurityGuardianDemoDataRoundtrip() throws {
        // Test 4-tier confirmations
        let confData = try encoder.encode(DEMO_SECURITY_CONFIRMATIONS)
        let decodedConf = try decoder.decode([SecurityConfirmationDemo].self, from: confData)
        XCTAssertEqual(decodedConf.count, 2)
        XCTAssertEqual(decodedConf.first?.tier, .mode2AlwaysConfirm)
        XCTAssertEqual(decodedConf.last?.tier, .mode1Handoff)

        // Test 16-state zo decision badges
        let zoData = try encoder.encode(DEMO_ZO_DECISION_BADGES)
        let decodedZo = try decoder.decode([ZoDecisionBadgeDemo].self, from: zoData)
        XCTAssertEqual(decodedZo.count, 16)
        XCTAssertEqual(decodedZo.first?.stateKey, "approval_cancelled")
        XCTAssertTrue(decodedZo.contains(where: { $0.stateKey == "guardian_denied" && !$0.isRetryable }))
        XCTAssertTrue(decodedZo.contains(where: { $0.stateKey == "guardian_timed_out" && $0.isRetryable }))

        // Test 7 vault recovery branches
        XCTAssertEqual(DEMO_VAULT_RECOVERY_BRANCHES.count, 7)
        XCTAssertTrue(DEMO_VAULT_RECOVERY_BRANCHES.contains("1. retry_after_credential_delivery"))
        XCTAssertTrue(DEMO_VAULT_RECOVERY_BRANCHES.contains("7. stop"))
    }

    func testReplConsoleDemoDataRoundtrip() throws {
        let scopeData = try encoder.encode(DEMO_REPL_SCOPE)
        let decodedScope = try decoder.decode([ReplScopeNodeDemo].self, from: scopeData)
        XCTAssertEqual(decodedScope.count, 4)
        XCTAssertEqual(decodedScope.first?.name, "activeTabs")
        XCTAssertEqual(decodedScope[1].name, "targetWindow")

        XCTAssertFalse(DEMO_REPL_LOG_LINES.isEmpty)
        XCTAssertTrue(DEMO_REPL_LOG_LINES.first?.contains("cua_repl") ?? false)
    }

    func testCompanionDemoDataRoundtrip() throws {
        let state = CompanionStateDemo(
            name: "Lumina",
            currentMood: .joy,
            affinityLevel: 92,
            dailyStreakDays: 14,
            isFloatingPetActive: true
        )
        let data = try encoder.encode(state)
        let decoded = try decoder.decode(CompanionStateDemo.self, from: data)
        XCTAssertEqual(decoded.name, "Lumina")
        XCTAssertEqual(decoded.currentMood, .joy)
        XCTAssertEqual(decoded.affinityLevel, 92)
        XCTAssertTrue(decoded.isFloatingPetActive)

        XCTAssertEqual(CompanionMoodDemo.allCases.count, 5)
        XCTAssertEqual(DEMO_PHOTO_PRESETS.count, 4)
    }

    func testCreativeStudioDemoDataRoundtrip() throws {
        let imgParams = ImageGenParamsDemo(
            prompt: "Cyberpunk skyline",
            aspectRatio: "16:9",
            steps: 30,
            cfgScale: 5.0,
            seed: 12345
        )
        let data = try encoder.encode(imgParams)
        let decoded = try decoder.decode(ImageGenParamsDemo.self, from: data)
        XCTAssertEqual(decoded.prompt, "Cyberpunk skyline")
        XCTAssertEqual(decoded.aspectRatio, "16:9")
        XCTAssertEqual(decoded.steps, 30)

        let filmData = try encoder.encode(DEMO_FILMSTRIP_ITEMS)
        let decodedFilm = try decoder.decode([FilmstripItemDemo].self, from: filmData)
        XCTAssertEqual(decodedFilm.count, 3)

        let vidData = try encoder.encode(DEMO_VIDEO_JOB)
        let decodedVid = try decoder.decode(VideoJobDemo.self, from: vidData)
        XCTAssertEqual(decodedVid.engine, "Wan2.1")
        XCTAssertEqual(decodedVid.progressPercent, 88)
    }

    func testPcbEcadDemoDataRoundtrip() throws {
        let compData = try encoder.encode(DEMO_PCB_COMPONENTS)
        let decodedComps = try decoder.decode([PcbComponentDemo].self, from: compData)
        XCTAssertEqual(decodedComps.count, 5)
        XCTAssertEqual(decodedComps.first?.designator, "U1")

        let netData = try encoder.encode(DEMO_PCB_NETS)
        let decodedNets = try decoder.decode([PcbNetWireDemo].self, from: netData)
        XCTAssertEqual(decodedNets.count, 5)
        XCTAssertEqual(decodedNets.first?.name, "VBUS_5V")

        let ercData = try encoder.encode(DEMO_ERC_RULES)
        let decodedErc = try decoder.decode([ErcRuleCheckDemo].self, from: ercData)
        XCTAssertEqual(decodedErc.count, 5)
        XCTAssertEqual(decodedErc.first?.code, "missing_decoupling")
    }

    func testTasksDemoDataRoundtrip() throws {
        let kanbanData = try encoder.encode(DEMO_KANBAN_CARDS)
        let decodedCards = try decoder.decode([KanbanCardDemo].self, from: kanbanData)
        XCTAssertEqual(decodedCards.count, 4)
        XCTAssertEqual(decodedCards.first?.column, "todo")

        let routineData = try encoder.encode(DEMO_ROUTINES)
        let decodedRoutines = try decoder.decode([CronRoutineDemo].self, from: routineData)
        XCTAssertEqual(decodedRoutines.count, 2)
        XCTAssertEqual(decodedRoutines.first?.cronExpression, "0 9 * * 1-5")
        XCTAssertTrue(decodedRoutines.first?.notifyTelegram ?? false)
    }

    func testSystemDoctorDemoDataRoundtrip() throws {
        let docData = try encoder.encode(DEMO_DOCTOR_CHECKS)
        let decodedDoc = try decoder.decode([DoctorCheckItemDemo].self, from: docData)
        XCTAssertEqual(decodedDoc.count, 8)
        XCTAssertEqual(decodedDoc.first?.component, "Core v2 Daemon")
        XCTAssertEqual(decodedDoc.first?.status, "healthy")
    }

    // MARK: - AppState Workspace State Transition Tests

    @MainActor
    func testAppStateWorkspaceTransitions() {
        let appState = AppState()

        // Verify initial workspace
        XCTAssertEqual(appState.activeWorkspace, .chat)

        // Switch across workspaces
        appState.activeWorkspace = .computerUse
        XCTAssertEqual(appState.activeWorkspace, .computerUse)

        appState.activeWorkspace = .browserLeasing
        XCTAssertEqual(appState.activeWorkspace, .browserLeasing)

        appState.activeWorkspace = .securityGuardian
        XCTAssertEqual(appState.activeWorkspace, .securityGuardian)

        appState.activeWorkspace = .pcbEcad
        XCTAssertEqual(appState.activeWorkspace, .pcbEcad)

        appState.activeWorkspace = .tasks
        XCTAssertEqual(appState.activeWorkspace, .tasks)
    }

    @MainActor
    func testAppStateActionMutations() {
        let appState = AppState()

        // 1. Computer Use target window
        let testWindow = WindowItemDemo(
            id: "test-win",
            title: "Test App",
            appName: "test.exe",
            pid: 9999,
            hwnd: "0x1234",
            bounds: RectDemo(x: 0, y: 0, width: 800, height: 600)
        )
        appState.targetWindowForCua(testWindow)
        XCTAssertEqual(appState.selectedWindow?.id, "test-win")
        XCTAssertEqual(appState.settlingCountdownMs, 1000)

        // 2. Browser tab lease renewal
        if let firstTabId = appState.browserTabs.first?.id {
            appState.renewTabLease(id: firstTabId)
            XCTAssertEqual(appState.browserTabs.first?.remainingSeconds, 60)
        }

        // 3. Security confirmation approval
        let initialConfCount = appState.securityConfirmations.count
        if let confId = appState.securityConfirmations.first?.id {
            appState.approveConfirmation(id: confId)
            XCTAssertEqual(appState.securityConfirmations.count, initialConfCount - 1)
        }

        // 4. REPL command execution & reset
        appState.runReplCommand("console.log('hello');")
        XCTAssertTrue(appState.replLines.contains("> console.log('hello');"))

        appState.resetReplSession()
        XCTAssertTrue(appState.replLines.first?.contains("js_reset") ?? false)
        XCTAssertEqual(appState.replTokenCount, 120)

        // 5. Kanban card movement
        if let firstCardId = appState.kanbanCards.first?.id {
            appState.moveKanbanCard(id: firstCardId, toColumn: "done")
            XCTAssertEqual(appState.kanbanCards.first?.column, "done")
        }

        // 6. Companion mood change
        appState.setCompanionMood(.joy)
        XCTAssertEqual(appState.companionState.currentMood, .joy)
    }
}
