//
// ProtocolTests.swift
// SuperAgentTests
//
// XCTest suite testing roundtrip Codable serialization of all AgentStreamEvent
// variants, WireMessage, IpcRequestEnvelope, and subscription payloads against
// the exact JSON schema produced by core_v2.
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
}
