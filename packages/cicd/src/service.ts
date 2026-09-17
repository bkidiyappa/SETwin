export const PIPELINE_PROVIDERS = ["github-actions", "gitlab", "jenkins", "azure-devops"] as const;
export type PipelineProvider = (typeof PIPELINE_PROVIDERS)[number];

export function renderPipelineTemplate(provider: PipelineProvider): string {
  switch (provider) {
    case "github-actions":
      return [
        "name: SETwin CI",
        "on:",
        "  push:",
        "    branches: [main]",
        "  pull_request:",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    services:",
        "      postgres:",
        "        image: pgvector/pgvector:pg16",
        "        env:",
        "          POSTGRES_USER: setwin",
        "          POSTGRES_PASSWORD: setwin",
        "          POSTGRES_DB: setwin",
        "        ports: ['5432:5432']",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: pnpm/action-setup@v4",
        "        with:",
        "          version: 10",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: 20",
        "          cache: pnpm",
        "      - run: pnpm install",
        "      - run: pnpm test",
        "        env:",
        "          SETWIN_DATABASE_URL: postgresql://setwin:setwin@127.0.0.1:5432/setwin",
      ].join("\n");
    case "gitlab":
      return [
        "stages: [test]",
        "test:",
        "  stage: test",
        "  image: node:20",
        "  services:",
        "    - name: pgvector/pgvector:pg16",
        "      alias: postgres",
        "  variables:",
        "    POSTGRES_USER: setwin",
        "    POSTGRES_PASSWORD: setwin",
        "    POSTGRES_DB: setwin",
        "    SETWIN_DATABASE_URL: postgresql://setwin:setwin@postgres:5432/setwin",
        "  script:",
        "    - corepack enable",
        "    - pnpm install",
        "    - pnpm test",
      ].join("\n");
    case "jenkins":
      return [
        "pipeline {",
        "  agent any",
        "  stages {",
        "    stage('Test') {",
        "      steps {",
        "        sh 'corepack enable && pnpm install && pnpm test'",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n");
    case "azure-devops":
      return [
        "trigger:",
        "  - main",
        "pool:",
        "  vmImage: ubuntu-latest",
        "steps:",
        "  - task: NodeTool@0",
        "    inputs:",
        "      versionSpec: '20.x'",
        "  - script: |",
        "      corepack enable",
        "      pnpm install",
        "      pnpm test",
        "    displayName: 'SETwin tests'",
      ].join("\n");
    default:
      return "";
  }
}

export function listPipelineAdapters(): Array<{ provider: PipelineProvider; configured: boolean }> {
  return PIPELINE_PROVIDERS.map((provider) => ({
    provider,
    configured: Boolean(
      (provider === "github-actions" && process.env.SETWIN_GITHUB_TOKEN) ||
        (provider === "gitlab" && process.env.SETWIN_GITLAB_TOKEN) ||
        (provider === "jenkins" && process.env.SETWIN_JENKINS_URL) ||
        (provider === "azure-devops" && process.env.SETWIN_ADO_TOKEN),
    ),
  }));
}
