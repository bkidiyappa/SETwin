export type AiProviderName =
  | "ollama"
  | "openai"
  | "anthropic"
  | "bedrock"
  | "azure"
  | "gemini";

export type AiCompletionRequest = {
  task: string;
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
