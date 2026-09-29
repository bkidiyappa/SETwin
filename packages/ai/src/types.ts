export type AiProviderName =
  | "ollama"
  | "openai"
  | "anthropic"
  | "bedrock"
  | "azure"
  | "gemini";

export type AiCompletionRequest = {
  task: string;
  /** Which agent this call belongs to. Selects that agent's configured model. */
  agent?: string;
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When false, local thinking models should answer directly. */
  think?: boolean;
};

export type AiCompletionResult = {
  provider: AiProviderName;
  model: string;
  text: string;
  status: "ok" | "unavailable" | "error";
  error?: string;
  raw?: unknown;
};

export type AiProvider = {
  name: AiProviderName;
  isConfigured(): boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
};
