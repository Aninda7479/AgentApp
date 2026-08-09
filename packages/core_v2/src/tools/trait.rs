use async_trait::async_trait;
use serde_json::Value;

/// Core trait representing an executable tool for the Agent engine.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Returns the unique name of the tool.
    fn name(&self) -> &str;

    /// Returns a human-readable description of what the tool does.
    fn description(&self) -> &str;

    /// Returns the JSON Schema defining the expected parameters for the tool.
    fn parameters_schema(&self) -> Value;

    /// Executes the tool with the given JSON input parameters.
    async fn execute(&self, input: Value) -> anyhow::Result<String>;
}
