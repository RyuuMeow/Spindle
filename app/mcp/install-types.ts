export type AgentClient = "codex" | "claude";
export type InstallState = "missing" | "installed" | "outdated" | "conflict";
export type AgentInstallation = {
  client: AgentClient;
  serverName: string;
  configPath: string;
  skillPath: string;
  mcp: InstallState;
  skill: InstallState;
  pending: boolean;
  error?: string;
};
export type InstallAction = "install" | "remove" | "test";
export type InstallResult = {
  installation: AgentInstallation;
  message: string;
  toolCount?: number;
};
