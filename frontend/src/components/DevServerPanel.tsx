import React from 'react';
import ProjectTerminalView from './ProjectTerminalView';

interface DevServerPanelProps {
  projectId: string;
  command?: string;
  port?: number;
  workingDir: string;
}

const DevServerPanel: React.FC<DevServerPanelProps> = ({ 
  projectId, 
  command, 
  workingDir 
}) => {

  return (
    <ProjectTerminalView
      projectId={projectId}
      sessionType="devserver"
      workingDir={workingDir}
      command={command}
    />
  );
};

export default DevServerPanel;