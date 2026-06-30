import React from 'react';

interface ServersSettingsProps {
  mcpDashboard: React.ReactNode;
}

export const ServersSettings: React.FC<ServersSettingsProps> = ({ mcpDashboard }) => {
  return (
    <div style={{ maxWidth: '780px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px', textAlign: 'left' }}>
        Model Context Protocol
      </h1>
      <p style={{ fontSize: '0.88rem', color: '#8a8a8a', marginBottom: '28px', textAlign: 'left', lineHeight: '1.5' }}>
        Connect local or remote context servers to supply the agent with live tools, filesystems, database adapters, and services.
      </p>
      {mcpDashboard}
    </div>
  );
};
