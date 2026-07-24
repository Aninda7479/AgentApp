import { CreateArtifactParams } from '../artifact/artifactManifest.js';

export interface ArtifactToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const ARTIFACT_TOOLS: ArtifactToolDefinition[] = [
  {
    name: 'create_artifact',
    description: 'Creates a custom local micro-app / webapp artifact stored in ~/.superagent/artifact/<id>',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique folder/app identifier, e.g. "todo-list"' },
        name: { type: 'string', description: 'Display title of the micro-app' },
        description: { type: 'string', description: 'Short summary of what the app does' },
        type: { type: 'string', enum: ['static', 'node', 'python'], description: 'Runtime type' },
        entry: { type: 'string', description: 'Main entry file, e.g. "index.html"' },
        port: { type: 'number', description: 'Preferred HTTP port' },
        files: {
          type: 'object',
          description: 'Map of relative file paths to string file content, e.g. {"index.html": "<html>..."}'
        }
      },
      required: ['id', 'name', 'description', 'files']
    }
  },
  {
    name: 'list_artifacts',
    description: 'Lists all installed local micro-app artifacts and their current running status',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'start_artifact',
    description: 'Starts a stopped local micro-app artifact by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Artifact identifier' }
      },
      required: ['id']
    }
  },
  {
    name: 'stop_artifact',
    description: 'Stops a running local micro-app artifact by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Artifact identifier' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_artifact',
    description: 'Deletes a local micro-app artifact and its directory by ID',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Artifact identifier' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_artifact_logs',
    description: 'Retrieves execution output log lines for a running or past artifact',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Artifact identifier' },
        lines: { type: 'number', description: 'Maximum log lines to return (default 50)' }
      },
      required: ['id']
    }
  }
];
