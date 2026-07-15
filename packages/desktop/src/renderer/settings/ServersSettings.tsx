// @UNUSED — dead module: not imported by any entry point or other source file in the
// SuperAgent monorepo (confirmed via static import-graph analysis). Candidate for removal.
import React from 'react';

/** Props for the MCP servers settings panel. */
interface ServersSettingsProps {
  mcpDashboard: React.ReactNode;
}

/** Renders the MCP dashboard for connecting local or remote context servers. */
export const ServersSettings: React.FC<ServersSettingsProps> = ({ mcpDashboard }) => {
  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        Model Context Protocol
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Connect local or remote context servers to supply the agent with live tools, filesystems, database adapters, and services.
      </p>
      {mcpDashboard}
    </div>
  );
};
