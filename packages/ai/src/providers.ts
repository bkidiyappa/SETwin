import type { AiCompletionRequest, AiCompletionResult, AiProvider, AiProviderName } from "./types.ts";

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { ok: response.ok, status: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(provider: AiProviderName, model: string, error: string): AiCompletionResult {
  return { provider, model, text: "", status: "unavailable", error };
}

export function createOllamaProvider(): AiProvider {
  const baseUrl = (process.env.SETWIN_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const defaultModel = process.env.SETWIN_OLLAMA_MODEL ?? "qwen2.5:7b";
  const timeoutMs = Number(process.env.SETWIN_OLLAMA_TIMEOUT_MS ?? 120_000);
  return {
    name: "ollama",
    isConfigured: () => true,
    async complete(request) {
      const model = request.model ?? defaultModel;
      try {
        const result = await postJson(
          `${baseUrl}/api/generate`,
          {
            model,
            prompt: request.system ? `${request.system}\n\n${request.prompt}` : request.prompt,
            stream: false,
            options: { temperature: request.temperature ?? 0.2 },
          },
          {},
          Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000,
        );
        if (!result.ok) {
          return unavailable("ollama", model, `HTTP ${result.status}: ${result.text.slice(0, 200)}`);
        }
        const payload = result.json as { response?: string };
        const text = payload.response ?? "";
        if (!text.trim()) {
          return unavailable("ollama", model, "Empty response from Ollama");
        }
        return {
          provider: "ollama",
          model,
          text,
          status: "ok",
          raw: result.json,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const hint = /abort/i.test(message)
          ? `Ollama timed out after ${timeoutMs}ms (raise SETWIN_OLLAMA_TIMEOUT_MS)`
          : message;
        return unavailable("ollama", model, hint);
      }
    },
  };
}

export function createOpenAiProvider(): AiProvider {
  const apiKey = process.env.SETWIN_OPENAI_API_KEY ?? "";
  const baseUrl = (process.env.SETWIN_OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const defaultModel = process.env.SETWIN_OPENAI_MODEL ?? "gpt-4o-mini";
  return {
    name: "openai",
    isConfigured: () => Boolean(apiKey),
    async complete(request) {
      const model = request.model ?? defaultModel;
      if (!apiKey) {
        return unavailable("openai", model, "SETWIN_OPENAI_API_KEY not configured");
      }
      try {
        const messages = [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          { role: "user", content: request.prompt },
        ];
        const result = await postJson(
          `${baseUrl}/chat/completions`,
          { model, messages, temperature: request.temperature ?? 0.2, max_tokens: request.maxTokens ?? 2048 },
          { authorization: `Bearer ${apiKey}` },
        );
        if (!result.ok) {
          return unavailable("openai", model, `HTTP ${result.status}: ${result.text.slice(0, 200)}`);
        }
        const payload = result.json as { choices?: Array<{ message?: { content?: string } }> };
        return {
          provider: "openai",
          model,
          text: payload.choices?.[0]?.message?.content ?? "",
          status: "ok",
          raw: result.json,
        };
      } catch (error) {
        return unavailable("openai", model, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createAnthropicProvider(): AiProvider {
  const apiKey = process.env.SETWIN_ANTHROPIC_API_KEY ?? "";
  const baseUrl = (process.env.SETWIN_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  const defaultModel = process.env.SETWIN_ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
  return {
    name: "anthropic",
    isConfigured: () => Boolean(apiKey),
    async complete(request) {
      const model = request.model ?? defaultModel;
      if (!apiKey) {
        return unavailable("anthropic", model, "SETWIN_ANTHROPIC_API_KEY not configured");
      }
      try {
        const result = await postJson(
          `${baseUrl}/v1/messages`,
          {
            model,
            max_tokens: request.maxTokens ?? 2048,
            system: request.system,
            messages: [{ role: "user", content: request.prompt }],
          },
          { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        );
        if (!result.ok) {
          return unavailable("anthropic", model, `HTTP ${result.status}`);
        }
        const payload = result.json as { content?: Array<{ text?: string }> };
        return {
          provider: "anthropic",
          model,
          text: payload.content?.map((part) => part.text ?? "").join("") ?? "",
          status: "ok",
          raw: result.json,
        };
      } catch (error) {
        return unavailable("anthropic", model, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createBedrockProvider(): AiProvider {
  const region = process.env.SETWIN_BEDROCK_REGION ?? "";
  const modelId = process.env.SETWIN_BEDROCK_MODEL ?? "anthropic.claude-3-haiku-20240307-v1:0";
  return {
    name: "bedrock",
    isConfigured: () => Boolean(region && process.env.SETWIN_AWS_ACCESS_KEY_ID),
    async complete(request) {
      if (!region || !process.env.SETWIN_AWS_ACCESS_KEY_ID) {
        return unavailable("bedrock", modelId, "SETWIN_BEDROCK_REGION / SETWIN_AWS_ACCESS_KEY_ID not configured");
      }
      // Bedrock SigV4 signing is environment-specific; use the OpenAI-compatible proxy URL when provided.
      const proxy = process.env.SETWIN_BEDROCK_PROXY_URL;
      if (!proxy) {
        return unavailable(
          "bedrock",
          modelId,
          "SETWIN_BEDROCK_PROXY_URL required for HTTP access without AWS SDK",
        );
      }
      try {
        const result = await postJson(proxy.replace(/\/$/, "") + "/chat/completions", {
          model: request.model ?? modelId,
          messages: [
            ...(request.system ? [{ role: "system", content: request.system }] : []),
            { role: "user", content: request.prompt },
          ],
        });
        if (!result.ok) {
          return unavailable("bedrock", modelId, `HTTP ${result.status}`);
        }
        const payload = result.json as { choices?: Array<{ message?: { content?: string } }> };
        return {
          provider: "bedrock",
          model: modelId,
          text: payload.choices?.[0]?.message?.content ?? "",
          status: "ok",
          raw: result.json,
        };
      } catch (error) {
        return unavailable("bedrock", modelId, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createAzureProvider(): AiProvider {
  const endpoint = (process.env.SETWIN_AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
  const apiKey = process.env.SETWIN_AZURE_OPENAI_API_KEY ?? "";
  const deployment = process.env.SETWIN_AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
  const apiVersion = process.env.SETWIN_AZURE_OPENAI_API_VERSION ?? "2024-06-01";
  return {
    name: "azure",
    isConfigured: () => Boolean(endpoint && apiKey),
    async complete(request) {
      const model = request.model ?? deployment;
      if (!endpoint || !apiKey) {
        return unavailable("azure", model, "SETWIN_AZURE_OPENAI_ENDPOINT / API_KEY not configured");
      }
      try {
        const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
        const result = await postJson(
          url,
          {
            messages: [
              ...(request.system ? [{ role: "system", content: request.system }] : []),
              { role: "user", content: request.prompt },
            ],
            temperature: request.temperature ?? 0.2,
          },
          { "api-key": apiKey },
        );
        if (!result.ok) {
          return unavailable("azure", model, `HTTP ${result.status}`);
        }
        const payload = result.json as { choices?: Array<{ message?: { content?: string } }> };
        return {
          provider: "azure",
          model,
          text: payload.choices?.[0]?.message?.content ?? "",
          status: "ok",
          raw: result.json,
        };
      } catch (error) {
        return unavailable("azure", model, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createGeminiProvider(): AiProvider {
  const apiKey = process.env.SETWIN_GEMINI_API_KEY ?? "";
  const defaultModel = process.env.SETWIN_GEMINI_MODEL ?? "gemini-1.5-flash";
  return {
    name: "gemini",
    isConfigured: () => Boolean(apiKey),
    async complete(request) {
      const model = request.model ?? defaultModel;
      if (!apiKey) {
        return unavailable("gemini", model, "SETWIN_GEMINI_API_KEY not configured");
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const prompt = request.system ? `${request.system}\n\n${request.prompt}` : request.prompt;
        const result = await postJson(url, { contents: [{ parts: [{ text: prompt }] }] });
        if (!result.ok) {
          return unavailable("gemini", model, `HTTP ${result.status}`);
        }
        const payload = result.json as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        return { provider: "gemini", model, text, status: "ok", raw: result.json };
      } catch (error) {
        return unavailable("gemini", model, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function createAllProviders(): AiProvider[] {
  return [
    createOllamaProvider(),
    createOpenAiProvider(),
    createAnthropicProvider(),
    createBedrockProvider(),
    createAzureProvider(),
    createGeminiProvider(),
  ];
}
