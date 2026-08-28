use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    Json,
};

use crate::automation::{DemonstrationTrace, RecordedAction, SynthesizedSkill};
use crate::server::routes::chat::resolve_active_workspace_model;
use crate::server::state::{
    AppState, StartTraceRequest, SynthesizeTraceRequest, WorkflowRunRequest,
};
use crate::types::{
    AgentPersona, ModelConfig, RoutineExecutionLog, RoutineTrigger, WorkflowExecutionResult,
};

// ─── Persona Endpoints ────────────────────────────────────────────────────────

pub async fn list_personas(State(state): State<AppState>) -> Json<Vec<AgentPersona>> {
    let list = state.persona_store.list().await;
    Json(list)
}

pub async fn get_persona(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<AgentPersona>, StatusCode> {
    state
        .persona_store
        .get(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn save_persona(
    State(state): State<AppState>,
    Json(persona): Json<AgentPersona>,
) -> Result<Json<AgentPersona>, StatusCode> {
    state
        .persona_store
        .save(persona)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn delete_persona(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .persona_store
        .delete(&id)
        .await
        .map(|deleted| Json(serde_json::json!({ "success": deleted })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

// ─── Routine Endpoints ────────────────────────────────────────────────────────

pub async fn list_routines(State(state): State<AppState>) -> Json<Vec<RoutineTrigger>> {
    let list = state.trigger_engine.list().await;
    Json(list)
}

pub async fn get_routine(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<RoutineTrigger>, StatusCode> {
    state
        .trigger_engine
        .get(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn save_routine(
    State(state): State<AppState>,
    Json(routine): Json<RoutineTrigger>,
) -> Result<Json<RoutineTrigger>, StatusCode> {
    state
        .trigger_engine
        .save(routine)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn delete_routine(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .trigger_engine
        .delete(&id)
        .await
        .map(|deleted| Json(serde_json::json!({ "success": deleted })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn run_routine_now(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<RoutineExecutionLog>, StatusCode> {
    state
        .trigger_engine
        .execute_routine(&id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Workflow Execution Endpoints ─────────────────────────────────────────────

pub async fn run_workflow(
    State(state): State<AppState>,
    Json(req): Json<WorkflowRunRequest>,
) -> Result<Json<WorkflowExecutionResult>, StatusCode> {
    state
        .pipeline_executor
        .execute_pipeline(&req.workflow, &req.input, None)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Demonstration Skills Endpoints ───────────────────────────────────────────

pub async fn list_skills(State(state): State<AppState>) -> Result<Json<Vec<SynthesizedSkill>>, StatusCode> {
    state
        .skill_synthesizer
        .list_skills()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn start_trace_session(
    State(state): State<AppState>,
    Json(req): Json<StartTraceRequest>,
) -> Json<serde_json::Value> {
    let session_id = state
        .trace_recorder
        .start_session(&req.title, &req.description)
        .await;
    Json(serde_json::json!({ "sessionId": session_id }))
}

pub async fn record_trace_action(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(action): Json<RecordedAction>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let recorded = state.trace_recorder.record_action(&id, action).await;
    if recorded {
        Ok(Json(serde_json::json!({ "success": true })))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

pub async fn stop_trace_session(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<DemonstrationTrace>, StatusCode> {
    state
        .trace_recorder
        .stop_session(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn synthesize_trace(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<SynthesizeTraceRequest>,
) -> Result<Json<SynthesizedSkill>, StatusCode> {
    let trace = state
        .trace_recorder
        .get_trace(&id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let raw_settings = state.settings_store.load_raw().unwrap_or_default();
    let (prov_type, m_id, api_key, base_url) = resolve_active_workspace_model(&raw_settings, &state.settings_store);
    let mut model_config = ModelConfig::new(prov_type, m_id);
    if let Some(k) = api_key {
        model_config.api_key = Some(k);
    }
    if let Some(u) = base_url {
        model_config.base_url = Some(u);
    }

    state
        .skill_synthesizer
        .synthesize_from_trace(&trace, &req.skill_name, &model_config)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
