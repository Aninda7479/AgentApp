use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::threed_workspace::{
    Generate3DRequest, SpatialWorldConfig, ThreeDModality, ThreeDOutputFormat,
    ThreeDWorkspaceManager,
};
use crate::tools::r#trait::Tool;

#[derive(Clone)]
pub struct ThreeDTool {
    manager: Arc<ThreeDWorkspaceManager>,
}

impl ThreeDTool {
    pub fn new(manager: Arc<ThreeDWorkspaceManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for ThreeDTool {
    fn name(&self) -> &str {
        "threed_workspace"
    }

    fn description(&self) -> &str {
        "SuperAgent 3D & Spatial Harness. Generate 3D models (characters, props, vehicles, CAD solids), construct spatial worlds (rooms, architecture, city blocks, environments), inspect 3D assets, and list available models. Generates valid GLTF/GLB models viewable directly in SuperAgent Studio (/studio)."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["generate_asset", "build_world", "list_models", "inspect_model"],
                    "description": "Action to perform: 'generate_asset' (create 3D prop/character/object), 'build_world' (generate full spatial room or city environment), 'list_models' (view generated 3D assets), or 'inspect_model' (view statistics for an asset)"
                },
                "prompt": {
                    "type": "string",
                    "description": "Detailed description of the 3D asset or spatial world to construct (e.g. 'Cyberpunk metropolis with neon spires and road grid', 'Modern executive loft with glass desk and holographic console', 'Futuristic combat android in titanium armor')"
                },
                "theme": {
                    "type": "string",
                    "enum": ["cyberpunk_city", "modern_loft", "sci_fi_bridge", "cozy_room", "fantasy_dungeon", "landscape"],
                    "description": "Spatial world theme when using 'build_world'"
                },
                "modality": {
                    "type": "string",
                    "enum": ["text_to_3d", "image_to_3d", "world_gen", "character_avatar", "cad_solid"],
                    "description": "Generation modality (default: 'world_gen' for worlds, 'text_to_3d' for objects)"
                },
                "output_format": {
                    "type": "string",
                    "enum": ["glb", "obj", "ply", "stl"],
                    "description": "Output 3D file format (default: 'glb')"
                },
                "model_id": {
                    "type": "string",
                    "description": "Optional model engine ID (e.g. 'procedural-world-v1', 'trellis-image-large', 'hunyuan3d-2', 'tripo3d-api', 'meshy4-api')"
                },
                "id": {
                    "type": "string",
                    "description": "Asset ID when using 'inspect_model'"
                }
            },
            "required": ["action"]
        })
    }

    async fn execute(&self, input: Value) -> Result<String> {
        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("generate_asset");

        match action {
            "generate_asset" | "build_world" => {
                let prompt = input
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("'prompt' is required for 3D generation"))?;

                let theme = input
                    .get("theme")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                let modality = match input.get("modality").and_then(|v| v.as_str()) {
                    Some("character_avatar") => Some(ThreeDModality::CharacterAvatar),
                    Some("cad_solid") => Some(ThreeDModality::CadSolid),
                    Some("image_to_3d") => Some(ThreeDModality::ImageTo3D),
                    Some("world_gen") => Some(ThreeDModality::WorldGen),
                    _ => {
                        if action == "build_world" {
                            Some(ThreeDModality::WorldGen)
                        } else {
                            Some(ThreeDModality::TextTo3D)
                        }
                    }
                };

                let output_format = match input.get("output_format").and_then(|v| v.as_str()) {
                    Some("obj") => Some(ThreeDOutputFormat::Obj),
                    Some("ply") => Some(ThreeDOutputFormat::Ply),
                    Some("stl") => Some(ThreeDOutputFormat::Stl),
                    _ => Some(ThreeDOutputFormat::Glb),
                };

                let model_id = input
                    .get("model_id")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                let req = Generate3DRequest {
                    prompt: prompt.to_string(),
                    negative_prompt: None,
                    model_id,
                    mode: None,
                    modality,
                    output_format,
                    init_image: None,
                    poly_budget: None,
                    texture_resolution: None,
                    seed: None,
                    geometry_style: None,
                    spatial_world: Some(SpatialWorldConfig {
                        theme,
                        room_width: Some(8.0),
                        room_length: Some(8.0),
                        room_height: Some(4.0),
                        density: Some(0.8),
                        include_lighting: true,
                        skybox: None,
                    }),
                };

                let resp = self.manager.generate(&req, None).await?;

                Ok(json!({
                    "status": "success",
                    "id": resp.id,
                    "model_url": resp.model_url,
                    "format": resp.format.extension(),
                    "poly_count": resp.poly_count,
                    "vertex_count": resp.vertex_count,
                    "generation_time_ms": resp.generation_time_ms,
                    "message": format!(
                        "Successfully generated 3D asset '{}' ({} polygons, {} vertices). Viewable in SuperAgent 3D Studio at http://localhost:1469/studio.",
                        resp.id,
                        resp.poly_count.unwrap_or(0),
                        resp.vertex_count.unwrap_or(0)
                    )
                }).to_string())
            }

            "list_models" => {
                let records = self.manager.list_generations()?;
                let list: Vec<Value> = records
                    .into_iter()
                    .take(20)
                    .map(|r| {
                        json!({
                            "id": r.id,
                            "prompt": r.prompt,
                            "format": r.format.extension(),
                            "poly_count": r.poly_count,
                            "created_at": r.created_at,
                            "file_url": format!("/api/threed/generations/{}/file", r.id),
                        })
                    })
                    .collect();

                Ok(json!({
                    "status": "success",
                    "count": list.len(),
                    "models": list
                })
                .to_string())
            }

            "inspect_model" => {
                let id = input
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow!("'id' is required for inspect_model"))?;

                let rec = self.manager.get_generation(id)?;
                match rec {
                    Some(r) => Ok(json!({
                        "status": "success",
                        "id": r.id,
                        "prompt": r.prompt,
                        "format": r.format.extension(),
                        "poly_count": r.poly_count,
                        "vertex_count": r.vertex_count,
                        "created_at": r.created_at,
                        "file_name": r.file_name,
                        "model_id": r.model_id,
                        "source": r.source,
                        "metadata": r.metadata,
                    })
                    .to_string()),
                    None => Ok(json!({
                        "status": "error",
                        "message": format!("Model with id '{}' not found", id)
                    })
                    .to_string()),
                }
            }

            other => Err(anyhow!(
                "Unknown action '{}' for threed_workspace tool",
                other
            )),
        }
    }
}
