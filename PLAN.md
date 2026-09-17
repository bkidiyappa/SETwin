# SETwin — Software Engineering Twin

> **Implementation status:** TypeScript Phase 5 — Review & Approval is complete (reviews, findings, approval requests, multi-approval, delegation, escalation). Do not extend the Python prototype with Phase 1+. Next implementation is Phase 6 — Audit.

> **A living engineering twin that works with the LLMs, coding agents, IDEs, and engineering systems your organization already uses.**

### Tagline

> **Your software has a memory. SETwin is that memory.**

### Core Principle

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

---

# 1. Vision

SETwin — **Software Engineering Twin** — is a living digital twin of a software product and its engineering lifecycle.

It maintains persistent knowledge of:

- Requirements
- Epics
- Features
- Business rules
- Acceptance criteria
- Gherkin scenarios
- Architecture
- Design
- Components
- Services
- APIs
- Databases
- Source code
- Dependencies
- Tests
- Defects
- Risks
- Decisions
- Reviews
- Approvals
- Changes
- Builds
- Deployments
- Releases
- Runtime information
- Engineering metrics
- AI actions
- Human decisions
- Audit history

SETwin creates a persistent engineering intelligence layer above the tools organizations already use.

---

# 2. The Problem

Modern engineering organizations use many disconnected systems:

```text
Product Management
      |
      +-- Jira / ADO / Product tools

Design
      |
      +-- Confluence / Docs / Figma

Development
      |
      +-- GitHub / GitLab / Bitbucket

AI
      |
      +-- Cursor / Windsurf / Claude Code
      +-- OpenCode / OpenHands
      +-- OpenAI / Claude / Bedrock / Azure OpenAI
      +-- Ollama / Qwen

Testing
      |
      +-- Playwright / Cypress / Selenium
      +-- OpenSecant
      +-- API / Unit / Integration tests

CI/CD
      |
      +-- GitHub Actions / Jenkins / Azure DevOps
      +-- GitLab CI / CircleCI

Observability
      |
      +-- Datadog / Grafana / Prometheus

Engineering Metrics
      |
      +-- OpenVector
```

The knowledge connecting these systems is fragmented.

SETwin provides the persistent layer connecting them.

---

# 3. SETwin's Role

SETwin sits between:

```text
Business
   |
Product
   |
Engineering
   |
AI
   |
Execution
   |
Production
```

Conceptually:

```text
                    EXPERIENCE
        Web UI | CLI | IDE | AI Agents | MCP
                         |
                         v
                  SETwin Platform
                         |
       +-----------------+-----------------+
       |                 |                 |
       v                 v                 v
   Twin / Graph      Workflow &       AI / Agents
   Knowledge         Governance
       |                 |                 |
       +-----------------+-----------------+
                         |
                         v
                Engineering Systems
                         |
       +-------+---------+---------+--------+
       |       |         |         |        |
      Git    CI/CD     Tests     Cloud    Issues
```

---

# 4. What SETwin Owns

SETwin owns:

- Engineering knowledge
- Engineering relationships
- Engineering context
- Artifact versions
- Traceability
- Workflow
- Reviews
- Approvals
- Governance
- AI activity
- Change intelligence
- Engineering audit
- Engineering state

---

# 5. What SETwin Integrates With

SETwin integrates with:

- Git
- GitHub
- GitLab
- Bitbucket
- Azure DevOps
- Jira
- Confluence
- Figma
- CI/CD systems
- Test frameworks
- Observability platforms
- Engineering metrics systems
- LLM providers
- Coding agents
- IDEs
- MCP clients
- OpenSecant
- OpenVector

SETwin does not need to replace these systems.

---

# 5.1 What SETwin Is NOT

SETwin should not become:

- Another IDE
- Another coding assistant
- Another RAG framework
- Another Jira replacement
- Another GitHub replacement
- Another CI/CD system
- Another test automation framework
- Another observability platform
- Another metrics platform
- A proprietary LLM
- A replacement for OpenCode, OpenHands, Cursor, or Windsurf

SETwin orchestrates and connects these capabilities.

The fundamental boundary is:

> **SETwin owns engineering knowledge, traceability, workflow, governance and approval.**

External tools own their specialized execution capabilities.

---

# 6. Product Philosophy

## 6.1 Persistent Memory

SETwin remembers the software system over time.

Not merely:

> "Here is the current repository."

But:

> "Here is how the product evolved, why it evolved, what changed, who reviewed it, what it affects, what tests validate it, and what happened afterward."

---

## 6.2 Deterministic First

Use deterministic systems whenever possible.

Examples:

- Git for history
- Tree-sitter for code structure
- Gherkin parser for syntax
- PostgreSQL for transactional state
- RBAC for authorization
- Workflow engine for state
- Audit service for audit events

AI is used for semantic reasoning.

---

## 6.3 AI-Native

AI is a first-class capability.

SETwin should support:

- AI requirements analysis
- AI Gherkin generation
- AI architecture
- AI impact analysis
- AI coding
- AI test generation
- AI review
- AI defect analysis
- AI release analysis
- AI engineering assistants
- AI Scrum team
- AI engineering agents
- AI learning from engineering history

---

## 6.4 Human Governance

AI can propose and execute authorized tasks.

Humans retain approval authority for governed transitions.

---

# 7. Long-Term Architecture

The complete architecture is:

```text
                             SETwin
                  Software Engineering Twin
                                  |
       +--------------------------+--------------------------+
       |                          |                          |
       v                          v                          v
 EXPERIENCE                  AI / AGENTS                INTEGRATIONS
       |                          |                          |
 +-----+------+           +-------+--------+          +------+------+
 |     |      |           |       |        |          |      |      |
Web   CLI    MCP       Scrum    Coding   Review      Git   Jira   CI/CD
UI                  Agents     Agents    Agents
                                  |
                                  v
                         AI Gateway / Router
                                  |
             +--------------------+---------------------+
             |          |           |          |        |
          OpenAI     Anthropic    Bedrock    Azure    Ollama
             |          |           |          |        |
            GPT       Claude       Models     Models    Qwen
                                  |
                                  v
                         SETwin CORE PLATFORM
                                  |
       +--------------------------+--------------------------+
       |            |              |            |            |
       v            v              v            v            v
     Twin        Context       Workflow      Governance    Audit
       |            |              |            |            |
       +------------+--------------+------------+------------+
                                  |
                                  v
                             Data Layer
                                  |
          +-----------------------+----------------------+
          |              |              |               |
      PostgreSQL       pgvector       Graph          Object Store
                                      Engine
                                  |
                                  v
                         Engineering Data
                                  |
       +----------+----------+----------+----------+----------+
       |          |          |          |          |          |
      Code       Tests     Defects    Builds    Releases   Runtime
```

---

# 8. Technology Strategy

SETwin uses a **polyglot architecture where justified**, but maintains a simple primary platform.

## Primary Platform

### Node.js + TypeScript

Used for:

- Core application
- APIs
- CLI
- MCP
- Workflow
- Governance
- AI Gateway
- Integrations
- Repository intelligence
- Web backend
- Real-time services

Primary technologies:

- Node.js
- TypeScript
- Fastify
- Zod
- Drizzle ORM
- PostgreSQL
- Vitest
- Pino
- pnpm

---

# 9. Python

Python is explicitly part of the long-term SETwin architecture.

It is not required for the initial core, but is available for capabilities where Python has a strong ecosystem advantage.

Potential Python components:

- Advanced ML
- NLP
- Defect prediction
- Quality prediction
- Anomaly detection
- Engineering forecasting
- Embedding experimentation
- Custom model inference
- Data science
- Statistical analysis
- AI research
- PyTorch
- scikit-learn
- pandas
- Jupyter
- Specialized ML libraries

Architecture:

```text
SETwin Core
Node.js / TypeScript
       |
       +----------------------+
       |                      |
       v                      v
Python ML Services      Python Data Science
```

Python services should be independently deployable.

They communicate with SETwin through:

- REST
- gRPC
- queues/events where appropriate
- MCP where appropriate

---

# 9.1 Platform Decision and Current Repository

**Plan of record:** Node.js + TypeScript is the SETwin core. Python is not the initial application runtime. Python is reserved for ML, NLP, forecasting, and related intelligence services (Phase 23).

**Current repository:** TypeScript Phase 5 is implemented (`apps/cli`, `apps/api`, `packages/config`, `packages/database`, `packages/core`, `packages/auth`, `packages/twin`). A Python Phase 0 prototype remains under `setwin/` and must not receive Phase 1+ features.

**Cursor / implementation rule:**

1. Do not add identity, artifacts, Gherkin, workflow, approvals, or AI on the Python stack.
2. Implement Phase 6 on the TypeScript core.
3. Preserve CLI contracts including `workflow` and `review` commands.
4. Keep PostgreSQL, Docker Compose, secret-safe status output, structured logging, and shared CLI/API services.

Local developer experience target after the TypeScript foundation:

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm dev
setwin init
setwin status
```

No cloud account is required for the core local development experience.

---

# 10. Data Architecture

## Primary Database

PostgreSQL.

Used for:

- transactional data
- artifacts
- versions
- users
- roles
- permissions
- approvals
- workflows
- reviews
- relationships
- events

---

## Vector Database

Initial option:

**pgvector**

Long-term architecture may support:

- pgvector
- Qdrant
- Weaviate
- Milvus
- other enterprise vector stores

The vector layer remains replaceable.

---

# 11. Graph Architecture

The long-term SETwin architecture supports graph-native engineering knowledge.

Initial:

```text
PostgreSQL relationship tables
```

Future graph capability:

- Apache AGE
- dedicated graph database where justified
- graph traversal engines
- graph analytics

Potential future graph systems may include:

- Apache AGE
- Neo4j
- other enterprise graph systems

Graph infrastructure should only be introduced when scale or traversal complexity justifies it.

The product architecture must not prevent it.

---

# 12. Object Storage

Long-term support for:

- S3
- Azure Blob Storage
- Google Cloud Storage
- MinIO
- local filesystem for development

Used for:

- large artifacts
- reports
- build outputs
- test evidence
- screenshots
- videos
- logs
- AI artifacts
- architecture documents

---

# 13. Event Architecture

SETwin begins with transactional event recording.

Long-term architecture supports:

- PostgreSQL event tables
- event publishing
- asynchronous processing
- message queues
- Kafka
- Amazon EventBridge
- RabbitMQ
- NATS

Potential architecture:

```text
SETwin Core
     |
     v
Domain Event
     |
     +---- Audit
     +---- Metrics
     +---- AI Context
     +---- Notifications
     +---- Integrations
     +---- Analytics
```

Kafka or another event platform should be introduced when scale requires it.

---

# 14. Caching

Long-term architecture supports:

- in-memory cache
- Redis
- distributed cache

Potential use:

- AI context caching
- session state
- expensive graph queries
- embeddings
- workflow state acceleration
- distributed locks

Redis is not mandatory initially but remains part of the target architecture.

---

# 15. Search

SETwin supports multiple search strategies:

```text
Exact Search
     |
Full Text Search
     |
Semantic Search
     |
Graph Search
     |
Hybrid Search
```

Long-term options:

- PostgreSQL FTS
- pgvector
- OpenSearch
- Elasticsearch

Hybrid retrieval:

```text
Query
 |
 +-- Keyword
 |
 +-- Vector
 |
 +-- Graph
 |
 +-- Metadata
 |
 v
Context Ranking
 |
 v
AI Context
```

---

# 16. Gherkin-First Behavioral Model

Gherkin is the canonical behavioral representation.

```gherkin
Feature: Order cancellation

  Scenario: Customer cancels an eligible order
    Given an order was placed 10 minutes ago
    And the order has not been fulfilled
    When the customer cancels the order
    Then the order should be cancelled
    And the customer should receive confirmation
```

Requirements may originate as:

- Natural language
- Product documents
- Jira
- ADO
- Figma
- API definitions
- imported requirements

But SETwin should transform behavioral intent into structured Gherkin.

---

# 17. Traceability Model

Core chain:

```text
Epic
 |
Feature
 |
Requirement
 |
Business Rule
 |
Gherkin Feature
 |
Gherkin Scenario
 |
Design
 |
Component
 |
API
 |
Code
 |
Unit Test
 |
API Test
 |
UI Test
 |
Build
 |
Release
 |
Production
```

This becomes the backbone of the Software Engineering Twin.

---

# 18. Domain Model

Long-term entity model:

```text
Organization
Project

User
Role
Permission
Team
UserRole

Epic
Feature
Requirement
AcceptanceCriterion
BusinessRule

GherkinFeature
GherkinScenario
GherkinStep

Architecture
Design
Decision
Risk

Component
Service
API
Database
CodeRepository
Branch
Commit
File
Class
Function
Method
Dependency

TestSuite
Test
TestRun
TestResult

Defect
Incident

Build
Deployment
Environment
Release

Review
ReviewFinding

ApprovalPolicy
ApprovalRequest
ApprovalDecision

AuditEvent
DomainEvent

AIProvider
AIModel
AIAgent
AIAction
AIConversation
AIArtifact

Metric
EngineeringSignal
```

---

# 19. Relationship Model

Initial relationships:

```text
CONTAINS
DERIVED_FROM
IMPLEMENTS
SATISFIES
DESIGNED_BY
DEPENDS_ON
CALLS
IMPORTS
EXPOSES
CONSUMES
TESTED_BY
VALIDATES
AFFECTS
FIXES
CAUSED_BY
INTRODUCED_IN
CHANGED_IN
SUPERSEDES
REVIEWED_BY
APPROVED_BY
DEPLOYED_TO
RELEASED_IN
```

Relationship metadata:

```text
source
confidence
created_by
created_at
valid_from
valid_to
```

AI-generated relationships can be marked:

```text
AI_INFERRED
```

and reviewed before becoming authoritative.

---

# 20. Temporal Twin

SETwin should eventually support temporal understanding.

Example:

```text
REQ-101 v1
    |
    v2
    |
    v3
```

And:

```text
Code change
   |
   v
Requirement state at that time
   |
   v
Tests at that time
   |
   v
Release
```

The twin should eventually answer:

> What did the system look like when Release 12 was created?

This is a major long-term capability.

---

# 21. Versioning

Everything important is versioned.

Examples:

```text
Requirement v1
Requirement v2

Design v1
Design v2

Gherkin v1
Gherkin v2

Architecture v3
```

Never silently modify an approved version.

---

# 22. Role-Based Governance

Default roles:

- Product Owner
- Product Manager
- Architect
- Developer
- QA/QE
- Engineering Manager
- Security Reviewer
- Compliance Reviewer
- Release Manager
- SRE
- Administrator

Custom roles supported.

---

# 23. Approval Policies

Example:

```yaml
approval_policies:

  requirement:
    required_roles:
      - product_owner

  architecture:
    required_roles:
      - architect

  code:
    required_roles:
      - engineering_reviewer

  test:
    required_roles:
      - qa_reviewer

  security:
    required_roles:
      - security_reviewer

  production_release:
    required_roles:
      - engineering_manager
      - release_manager
```

Policies are configurable.

---

# 24. Approval Gates

SETwin supports:

- Single approval
- Multiple approvals
- Sequential approvals
- Parallel approvals
- Conditional approvals
- Delegated approval
- Escalation
- Approval expiry
- Re-review after changes
- Separation of duties

Example:

```text
Production Release

        +-- QE Approval
        |
Release +-- Security Approval
        |
        +-- Engineering Approval
        |
        +-- Release Manager Approval
```

---

# 25. Review Intelligence

AI Reviewer can identify:

- Missing requirements
- Contradictions
- Missing test coverage
- Architectural risks
- Security concerns
- Performance concerns
- Traceability gaps
- Requirement drift
- Unexpected change impact

AI recommendations do not equal human approval.

---

# 26. Audit

Everything important is auditable.

Audit:

```text
Who
What
When
Where
Why
Before
After
Version
Role
Provider
Model
Agent
Decision
Evidence
```

AI actions are separately identifiable.

---

# 27. Immutable Audit

Long-term audit capabilities:

- append-only storage
- retention policies
- tamper evidence
- hash chaining
- signed audit records
- archival
- compliance export

Blockchain is not required.

---

# 28. AI Gateway

All models are accessed through an abstraction layer.

Providers:

```text
OpenAI
Anthropic
Amazon Bedrock
Azure OpenAI
Ollama
Google Gemini
OpenAI-compatible APIs
Enterprise-hosted models
```

Models may include:

```text
GPT
Claude
Qwen
Llama
Mistral
Gemini
Enterprise custom models
```

---

# 29. AI Model Routing

SETwin eventually supports:

```text
Task
 |
Policy
 |
Context sensitivity
 |
Cost
 |
Latency
 |
Capability
 |
Compliance
 |
Provider
 |
Model
```

Example:

```text
Sensitive source code
       |
       v
Enterprise/local model

Complex architecture
       |
       v
Enterprise reasoning model

Simple classification
       |
       v
Small local model
```

---

# 30. AI Privacy Policies

Organizations can configure:

```yaml
ai_policy:

  source_code:
    allowed_providers:
      - ollama
      - bedrock

  requirements:
    allowed_providers:
      - openai
      - anthropic
      - bedrock

  sensitive_data:
    external_models: false
```

SETwin must identify where data is sent.

---

# 31. AI Scrum Team

Long-term agents:

### Product Owner Agent

- Requirements
- Gherkin
- Business rules
- Acceptance criteria
- Ambiguity

### Architect Agent

- Architecture
- Design
- Dependencies
- Risks
- Impact

### Developer Agent

- Implementation
- Refactoring
- Unit tests
- Documentation

### QE Agent

- Test design
- Automation
- Regression
- Quality analysis

### Security Agent

- Security review
- Threat modeling
- Vulnerability analysis

### SRE Agent

- Reliability
- Deployment
- Observability
- Incident analysis

### Release Agent

- Release readiness
- Risk
- Change summary
- Approval preparation

### Reviewer Agent

- Cross-artifact consistency
- Traceability
- Quality gates

---

# 32. Agent Orchestration

SETwin owns engineering workflow.

Agent orchestration can use:

- Native SETwin orchestration
- LangGraph
- OpenAI agent frameworks
- MCP
- OpenHands
- OpenCode
- future agent protocols

LangGraph is optional infrastructure for agent workflows, not the source of truth for engineering governance.

---

# 33. Coding Agents

Support:

- OpenCode
- OpenHands
- Claude Code
- Cursor
- Windsurf
- VS Code AI capabilities
- JetBrains AI capabilities
- future coding agents

Preferred integration:

```text
Coding Agent
      |
     MCP
      |
    SETwin
```

Where direct adapters are required:

```text
setwin/agents/adapters/
```

---

# 34. IDE Ecosystem

Long-term support:

```text
Cursor
Windsurf
VS Code
JetBrains
Visual Studio
```

SETwin should expose:

- Context
- Requirements
- Design
- Impact
- Tests
- Defects
- Reviews
- Approvals
- Decisions

directly inside developer workflows where possible.

---

# 35. MCP

MCP is a primary integration protocol.

Tools:

```text
setwin_get_context
setwin_get_requirement
setwin_get_design
setwin_get_impact
setwin_get_tests
setwin_get_defects
setwin_get_decisions
setwin_get_audit
setwin_search

setwin_create_artifact
setwin_update_artifact
setwin_submit_review
setwin_get_review

setwin_get_status
setwin_get_workflow
setwin_get_approval
```

Future MCP resources/prompts should also be supported.

---

# 36. Repository Intelligence

Repository ingestion:

```text
Git
 |
Repository Scanner
 |
Git Metadata
 |
Tree-sitter
 |
AST
 |
Code Entities
 |
Relationships
 |
SETwin Twin
```

Support:

- TypeScript
- JavaScript
- Java
- Python
- C#
- Go
- C/C++
- Kotlin
- Swift
- Rust
- other Tree-sitter-supported languages

---

# 37. Code Intelligence

Long-term code model:

```text
Repository
 |
Branch
 |
Commit
 |
File
 |
Module
 |
Class
 |
Interface
 |
Function
 |
Method
 |
Variable
 |
Import
 |
Dependency
 |
API
```

Potential future integrations:

- Language Server Protocol
- SCIP
- Semgrep
- CodeQL
- SonarQube
- static analyzers

---

# 38. Change Intelligence

Every Git change becomes an opportunity to calculate impact.

```text
Commit
 |
Changed Files
 |
Changed Code Entities
 |
Dependencies
 |
Requirements
 |
Gherkin
 |
Design
 |
Tests
 |
Defects
 |
Release Risk
```

SETwin should eventually calculate:

- impacted requirements
- impacted tests
- regression scope
- architectural impact
- risk
- approval requirements

---

# 39. Impact Analysis

Impact engine combines:

### Deterministic

- Git diff
- dependency graph
- call graph
- import graph
- ownership
- traceability

### Semantic

- LLM reasoning
- embeddings
- historical changes
- defect patterns

Output:

```text
CHANGE IMPACT

Risk:
High

Requirements:
REQ-101
REQ-118

Scenarios:
5

Code:
14 entities

Tests:
31

Defects:
2 historical defects

Required Reviews:
Code
QE
Security
```

---

# 40. Context Engine

The context engine is one of SETwin's most important capabilities.

Input:

```text
Current task
```

Context:

```text
Requirements
Business Rules
Gherkin
Architecture
Design
Code
Tests
Defects
Decisions
History
Changes
Reviews
Approvals
Metrics
Team
Policies
```

Output:

```text
AI-ready engineering context
```

---

# 41. Context Ranking

Context can be ranked using:

- Graph distance
- Semantic similarity
- Recency
- Importance
- Artifact type
- Change relevance
- User role
- Current workflow
- Historical relevance

---

# 42. Organizational Memory

SETwin should eventually understand organizational knowledge:

```text
Team ownership
Architecture conventions
Coding standards
Review practices
Security policies
Release policies
Historical decisions
Known exceptions
Engineering patterns
```

Example:

> "Why does this service use this unusual retry strategy?"

SETwin should be able to locate:

```text
Decision
Requirement
Incident
Review
Commit
Author
Date
```

---

# 43. Engineering Decision Records

First-class Decision entity:

```text
Decision ID
Title
Context
Problem
Options
Decision
Consequences
Owner
Approvers
Date
Supersedes
Related artifacts
```

This prevents institutional knowledge from disappearing into chat messages.

---

# 44. Business Rules

Business rules become first-class artifacts.

Example:

```text
BR-001

An order can be cancelled within 30 minutes
unless fulfillment has started.
```

Relationships:

```text
Business Rule
 |
Requirements
 |
Gherkin
 |
Code
 |
Tests
```

---

# 45. Requirement Intelligence

AI can identify:

- ambiguous requirements
- conflicting requirements
- duplicates
- missing acceptance criteria
- missing business rules
- dependencies
- downstream impact
- requirement churn

---

# 46. Requirement Drift

SETwin should eventually detect:

```text
Original Requirement
        |
        v
Current Gherkin
        |
        v
Current Code
        |
        v
Current Tests
```

and identify divergence.

Example:

```text
Requirement says:
30 minutes

Code implements:
15 minutes

Test validates:
20 minutes
```

This becomes a high-value SETwin capability.

---

# 47. Quality Intelligence

SETwin can eventually combine:

- Requirements
- Tests
- Code
- Defects
- Builds
- Releases
- Production incidents
- Engineering metrics

to provide engineering quality intelligence.

---

# 48. OpenVector Integration

OpenVector becomes the metrics/visualization companion.

SETwin provides:

```text
Traceability
Events
Changes
Reviews
Approvals
Tests
Defects
Releases
AI activity
```

OpenVector can calculate/display:

```text
Requirement Coverage
Automation Coverage
Defect Leakage
Velocity
Capacity
Code Quality
Change Failure Rate
Review Cycle Time
Requirement Churn
Rework
AI Contribution
Human Intervention
```

---

# 49. OpenSecant Integration

SETwin integrates with OpenSecant for UI automation.

```text
Requirement
 |
Gherkin
 |
Affected UI Scenarios
 |
OpenSecant
 |
Playwright
 |
Execution
 |
Result
 |
SETwin
```

SETwin does not duplicate OpenSecant's automation engine.

---

# 50. Test Ecosystem

Support:

- Playwright
- Cypress
- Selenium
- Webdriver
- REST/API frameworks
- Postman/Newman
- Jest
- Vitest
- JUnit
- pytest
- NUnit
- other test frameworks

Test adapters normalize execution results.

---

# 51. CI/CD Integrations

Support:

- GitHub Actions
- GitLab CI
- Jenkins
- Azure DevOps
- CircleCI
- Buildkite
- AWS CodePipeline
- other CI/CD systems

SETwin should consume:

- build results
- test results
- deployment results
- artifacts
- release information

---

# 52. Cloud Integrations

Long-term:

### AWS

- Bedrock
- S3
- CodePipeline
- CodeBuild
- CloudWatch
- EventBridge

### Azure

- Azure OpenAI
- Azure DevOps
- Blob Storage
- Application Insights

### GCP

- Gemini
- Cloud Storage
- Cloud Build
- Cloud Monitoring

---

# 53. Observability

Integrations:

- Datadog
- Prometheus
- Grafana
- OpenTelemetry
- CloudWatch
- Application Insights

Long-term correlation:

```text
Requirement
 |
Code
 |
Release
 |
Deployment
 |
Runtime
 |
Incident
```

This allows SETwin to connect engineering intent to production behavior.

---

# 54. Production Feedback Loop

Long-term:

```text
Production Incident
        |
        v
Affected Service
        |
        v
Code
        |
        v
Release
        |
        v
Requirement
        |
        v
Gherkin
        |
        v
Test Gap
```

SETwin can identify where the engineering lifecycle failed to detect a problem.

---

# 55. Defect Intelligence

Defect model:

```text
Defect
 |
Requirement
 |
Gherkin
 |
Code
 |
Test
 |
Release
 |
Environment
```

AI can classify:

- root cause
- escape phase
- defect pattern
- affected architecture
- similar historical defects

---

# 56. Predictive Engineering

Future Python/ML capabilities may provide:

- defect prediction
- change risk prediction
- regression prediction
- release risk
- review risk
- requirement churn prediction
- quality trend prediction
- capacity forecasting

These are future intelligence capabilities, not assumptions in the core workflow.

---

# 57. Engineering Twin Simulation

Long-term SETwin can support:

> "What happens if we change this?"

Simulation could calculate:

```text
Changed Component
 |
Dependencies
 |
Requirements
 |
Tests
 |
Teams
 |
Deployment
 |
Risk
 |
Potential Production Impact
```

This becomes a true engineering digital twin.

---

# 58. Scenario Simulation

Potential questions:

> What if this service is removed?

> What if this API changes?

> What if this requirement changes?

> What tests need to change?

> What releases are affected?

> What teams are affected?

> What approvals are required?

---

# 59. Engineering Knowledge Graph

The long-term graph:

```text
                     Business Rule
                          |
                          v
Requirement <--------> Gherkin
    |                     |
    v                     v
 Design <-------------> Scenario
    |
    v
Component
    |
    v
Service
    |
    v
API
    |
    v
Code
    |
    v
Test
    |
    v
Build
    |
    v
Release
    |
    v
Deployment
    |
    v
Production
    |
    v
Incident
```

This is the core digital twin.

---

# 60. Web Experience

React + TypeScript + Vite.

Future UI:

```text
Dashboard
Twin Explorer
Requirements
Gherkin
Architecture
Code
Tests
Defects
Change Impact
Reviews
Approvals
Audit
AI Activity
Agents
Releases
Metrics
Production
```

---

# 61. Twin Explorer

Cytoscape.js or equivalent graph visualization.

Capabilities:

- Search
- Expand
- Collapse
- Filter
- Trace
- Highlight
- Timeline
- Relationship inspection
- Impact visualization
- Version comparison

---

# 62. Timeline View

Every artifact can have:

```text
Timeline

v1 Created
v1 Reviewed
v1 Approved
v2 Created
v2 Reviewed
v2 Approved
Code Changed
Test Changed
Release Created
Release Approved
```

---

# 63. Diff Intelligence

SETwin should compare:

- Requirement versions
- Gherkin versions
- Design versions
- Code versions
- Test versions
- Architecture versions

AI can summarize differences.

---

# 64. AI Activity Dashboard

Show:

```text
AI Agent
Provider
Model
Task
Artifact
Time
Result
Human Reviewer
Decision
```

Example:

```text
Architect Agent
Claude
DES-104
Generated architecture proposal
Approved by Architect
```

---

# 65. Governance Dashboard

Show:

```text
Pending approvals
Overdue approvals
Rejected artifacts
Changes requested
High-risk changes
Unreviewed AI output
Policy violations
Audit anomalies
```

---

# 66. Compliance

Long-term support for:

- SOC 2
- ISO 27001
- HIPAA where applicable
- PCI DSS where applicable
- GDPR
- enterprise internal controls

Capabilities:

- immutable audit
- approval evidence
- role separation
- retention
- export
- access history
- AI activity tracking

SETwin should not claim certification merely because these features exist.

---

# 67. Multi-Tenant Enterprise Architecture

Long-term:

```text
Organization
 |
Tenant
 |
Project
 |
Team
 |
Repository
```

Isolation:

- Data
- Users
- Roles
- Policies
- AI providers
- Secrets
- Audit
- integrations

---

# 68. Deployment Models

SETwin should support:

### Local

```text
Node
PostgreSQL
Ollama
```

### Docker Compose

```text
SETwin
PostgreSQL
Ollama
```

### Enterprise VM

```text
SETwin
PostgreSQL
Redis
Object Storage
```

### Kubernetes

Long-term:

```text
SETwin services
PostgreSQL
Redis
Vector DB
Object Storage
Event Bus
AI Services
```

### Cloud

AWS / Azure / GCP.

---

# 69. Local Developer Experience

Target:

```bash
git clone <repo>

cd SETwin

pnpm install

docker compose up -d

pnpm db:migrate

pnpm dev
```

Then:

```bash
setwin init
setwin status
```

Local AI:

```text
Ollama
+
Qwen
```

No cloud account should be required for the core local development experience.

---

# 70. Security Architecture

Security principles:

- Zero trust
- Least privilege
- RBAC
- ABAC where necessary
- Secrets management
- Encryption
- Audit
- tenant isolation
- repository boundaries
- AI data policies
- agent permissions
- approval enforcement

Future integrations:

- OAuth/OIDC
- SAML
- LDAP
- Active Directory
- Okta
- Azure AD / Entra ID
- enterprise secret managers

---

# 71. Agent Security

Every agent should have:

```text
Agent Identity
Permissions
Allowed Tools
Allowed Repositories
Allowed Environments
Allowed Actions
Approval Requirements
```

Example:

```text
Developer Agent

Can:
  Read repository
  Create branch
  Modify code
  Run tests

Cannot:
  Approve production
  Change approval policy
  Delete audit history
```

---

# 72. Agent Sandboxing

Long-term support:

- container sandbox
- filesystem boundaries
- network restrictions
- command allowlists
- repository restrictions
- execution time limits
- secret isolation

---

# 73. AI Human-in-the-Loop

Configurable levels:

```text
Level 0
Human only

Level 1
AI suggests

Level 2
AI prepares changes

Level 3
AI executes approved tasks

Level 4
AI executes low-risk autonomous tasks

Level 5
Policy-controlled autonomous engineering
```

Organizations decide which level is permitted.

---

# 74. Policy Engine

Long-term policy engine can evaluate:

```text
Who
What
Which artifact
Which repository
Which environment
Which AI
Which provider
Risk
Change type
Approval status
```

Example:

```text
Production deployment
+
Security-sensitive service
+
AI-generated code

=> Security approval required
```

---

# 75. Notification System

Long-term integrations:

- Email
- Slack
- Microsoft Teams
- Webhooks
- PagerDuty
- enterprise notification systems

Notifications:

- Approval requested
- Review requested
- Approval rejected
- Build failed
- Release blocked
- Risk increased
- AI action completed

---

# 76. API Architecture

API styles may include:

- REST
- GraphQL where useful
- WebSocket/SSE for real-time updates
- MCP
- Webhooks

REST remains the primary initial API.

---

# 77. Public API

Long-term SETwin API should allow external systems to:

- Create requirements
- Read requirements
- Create artifacts
- Query graph
- Query impact
- Retrieve context
- Submit reviews
- Manage approvals
- Retrieve audit
- retrieve engineering metrics
- receive events

---

# 78. Plugin Architecture

Long-term SETwin should support plugins/adapters for:

```text
LLM Providers
AI Agents
Git Providers
Issue Trackers
CI/CD
Test Frameworks
Observability
Cloud
Identity
Notifications
Metrics
Storage
Vector DB
Graph DB
```

Standard interface:

```typescript
interface Integration {
  name: string;
  initialize(): Promise<void>;
  health(): Promise<HealthStatus>;
}
```

---

# 79. Configuration

Configuration should support:

```yaml
database:
ai:
agents:
workflow:
approvals:
security:
audit:
repositories:
integrations:
notifications:
storage:
search:
vector:
graph:
metrics:
observability:
```

---

# 80. Testing Architecture

Testing layers:

```text
Unit
Integration
Contract
Workflow
Authorization
Audit
AI
Repository
Graph
MCP
API
UI
End-to-End
Performance
Security
```

Long-term:

- load testing
- chaos testing
- fault injection
- security testing

---

# 81. AI Evaluation

SETwin should eventually evaluate AI output.

Metrics:

- correctness
- traceability
- hallucination rate
- requirement coverage
- code quality
- test quality
- review acceptance
- human intervention
- cost
- latency

AI evaluations should themselves be auditable.

---

# 82. AI Cost Intelligence

Track:

```text
Provider
Model
Tokens
Cost
Latency
Task
Artifact
Team
Project
```

Allow organizations to understand:

> Where is AI providing value?

---

# 83. AI Contribution

Long-term metrics:

```text
AI-generated code
AI-modified code
AI-generated tests
AI-generated requirements
AI-generated designs
Human modifications
Human approvals
Human rework
```

Never treat AI contribution as automatically equivalent to engineering productivity.

---

# 84. Engineering Metrics

SETwin can provide raw engineering events.

Potential metrics:

### Flow

- Lead time
- Cycle time
- Review time
- Approval time
- Deployment frequency

### Quality

- Defect leakage
- Escaped defects
- Test coverage
- Automation coverage
- Change failure rate

### Requirements

- Requirement churn
- Requirement coverage
- Traceability
- Requirement drift

### AI

- AI contribution
- AI acceptance
- Human intervention
- AI rework
- AI cost
- AI latency

OpenVector can visualize these metrics.

---

# 85. Performance Architecture

Initial:

```text
Modular Monolith
```

Long-term scaling:

```text
API
Workflow
AI
Repository Intelligence
Context
Search
Graph
Audit
Analytics
Notifications
```

These may eventually become independently scalable services.

Do not force microservices before scale requires them.

---

# 86. Observability of SETwin

SETwin itself must expose:

- logs
- metrics
- traces
- health
- readiness
- dependency status
- AI provider status
- database status
- queue status

Use:

- OpenTelemetry
- Prometheus
- Grafana
- Datadog

where appropriate.

---

# 87. Disaster Recovery

Long-term:

- PostgreSQL backups
- point-in-time recovery
- object storage replication
- audit archival
- configuration backup
- disaster recovery testing

---

# 88. Data Retention

Configurable retention for:

- Audit
- AI activity
- Test results
- Build results
- Logs
- Artifacts
- historical versions

Retention policies must not silently destroy required compliance history.

---

# 89. Import / Export

SETwin should support importing:

- Jira
- Azure DevOps
- GitHub
- GitLab
- Confluence
- Gherkin
- test results
- architecture documents

Export:

- Requirements
- Gherkin
- Traceability
- Audit
- Reviews
- Approvals
- Metrics
- Reports

---

# 90. Migration Strategy

SETwin should not require organizations to abandon existing systems.

Example:

```text
Jira
 |
Import
 |
SETwin Twin
 |
Traceability
 |
Continue using Jira
```

Eventually SETwin can synchronize bidirectionally where useful.

---

# 91. Data Synchronization

Long-term synchronization:

```text
Jira <------> SETwin
GitHub <-----> SETwin
ADO <--------> SETwin
CI/CD <------> SETwin
```

Conflict handling must be explicit.

---

# 92. External Source of Truth

SETwin must distinguish:

```text
SETwin-owned
External source
Imported
Synchronized
AI-inferred
Human-authored
```

This prevents confusion about authority.

---

# 93. Provenance

Every important fact should have provenance.

Example:

```text
Requirement:
  Source: Jira
  Imported: 2026-09-16
  Authoritative: Jira

Gherkin:
  Source: SETwin AI
  Generated by: Claude
  Reviewed by: Product Owner
  Authoritative: SETwin
```

---

# 94. Confidence

AI-inferred information may carry confidence:

```text
confidence:
  value: 0.87
  source: AI
```

But confidence must never replace governance.

---

# 95. Explainability

SETwin should answer:

> Why did you identify this test as impacted?

Example:

```text
PaymentService.cancel()
   |
calls
   |
RefundService.refund()
   |
implements
   |
REQ-118
   |
validated by
   |
TEST-441
```

The explanation comes from traceable relationships.

---

# 96. Security and Compliance AI Boundary

SETwin should explicitly show:

```text
Data
 |
Provider
 |
Region
 |
Model
 |
Retention
```

For enterprise use, users should know when source code or requirements leave the organization's environment.

---

# 97. Full Lifecycle

The ultimate SETwin lifecycle:

```text
IDEA
 |
EPIC
 |
FEATURE
 |
REQUIREMENT
 |
BUSINESS RULE
 |
GHERKIN
 |
DESIGN
 |
ARCHITECTURE
 |
CODE
 |
TEST
 |
BUILD
 |
REVIEW
 |
APPROVAL
 |
DEPLOYMENT
 |
RELEASE
 |
PRODUCTION
 |
OBSERVABILITY
 |
INCIDENT
 |
LEARNING
 |
REQUIREMENT
```

This creates a closed engineering learning loop.

---

# 98. Engineering Twin Feedback Loop

```text
                    BUSINESS
                       |
                       v
                 REQUIREMENT
                       |
                       v
                    DESIGN
                       |
                       v
                     CODE
                       |
                       v
                     TEST
                       |
                       v
                    RELEASE
                       |
                       v
                  PRODUCTION
                       |
                       v
                   INCIDENT
                       |
                       v
                   LEARNING
                       |
                       +------------+
                                    |
                                    v
                              REQUIREMENT
```

---

# 99. Product Phases

The complete product is divided into implementation phases.

## Phase 0 — Foundation

- Node.js
- TypeScript
- PostgreSQL
- Fastify
- Drizzle
- Zod
- CLI
- Docker
- Vitest
- configuration
- logging

## Phase 1 — Identity (complete on TypeScript core)

- Users, roles, permissions, teams, and memberships
- scrypt password hashing and SHA-256 session tokens (`stw_…`)
- First user becomes administrator; later user creation requires `admin:manage_users`
- Backend permission checks shared by CLI and API

## Phase 2 — Twin Core (complete on TypeScript core)

- Projects
- Artifacts with typed keys (`REQ-001`, `DES-001`, …)
- Immutable versions: v1 DRAFT; creating v2 SUPERSEDEs a previous DRAFT
- Provenance on every version (`HUMAN_AUTHORED` / `SETWIN` by default)
- Explicit artifact relationships (`IMPLEMENTS`, `CONTAINS`, …); AI_INFERRED requires confidence

## Phase 3 — Gherkin (complete on TypeScript core)

- Official `@cucumber/gherkin` parser
- Features, scenarios, and steps stored per artifact version
- Validation before persist; invalid source is rejected
- Traceability: Gherkin `VALIDATES` a Requirement

## Phase 4 — Workflow (complete on TypeScript core)

- Lifecycle: `DRAFT` → `IN_REVIEW` → `APPROVED` | `REJECTED` | `CHANGES_REQUESTED`
- Illegal transitions are rejected (cannot approve from DRAFT; cannot version while IN_REVIEW)
- Type policies (requirement → product_owner, design → architect, code → engineering_manager, test → qa_reviewer)
- Administrator may bypass the role gate; permissions still apply

## Phase 5 — Review & Approval (complete on TypeScript core)

- Submit opens a Review and ApprovalRequest rows from `approval_policies`
- Findings persist on the open review; unresolved HIGH findings block approval
- Multi-approval: CODE requires engineering_manager and security_reviewer in parallel
- Sequential approval: ARCHITECTURE requires architect then engineering_manager
- Delegation assigns a pending request to another user who holds the required role
- Escalation changes the required role (and optionally the assignee)
- Separation of duties: the artifact author cannot approve unless administrator
- Administrator may satisfy remaining requests in one approve
- Approval expiry: past `dueAt` blocks non-admin approve

## Phase 6 — Audit

- Audit events
- Immutable history
- AI activity
- provenance

## Phase 7 — AI Gateway

- Ollama
- OpenAI
- Anthropic
- Bedrock
- Azure OpenAI
- Gemini
- model routing

## Phase 8 — Requirement Intelligence

- AI requirements
- Gherkin generation
- ambiguity
- business rules
- conflicts

## Phase 9 — Repository Intelligence

- Git
- Tree-sitter
- code graph
- language support

## Phase 10 — Change Intelligence

- Git diff
- impact
- regression scope
- risk

## Phase 11 — Context Engine

- graph context
- vector search
- hybrid retrieval
- team context

## Phase 12 — AI Scrum Team

- Product Owner
- Architect
- Developer
- QE
- Security
- SRE
- Release
- Reviewer

## Phase 13 — Coding Agents

- OpenCode
- OpenHands
- Claude Code
- Cursor
- Windsurf
- IDE integrations

## Phase 14 — MCP

- MCP server
- tools
- resources
- prompts

## Phase 15 — Testing Ecosystem

- Playwright
- OpenSecant
- API
- unit
- integration
- Selenium
- Cypress

## Phase 16 — CI/CD

- GitHub Actions
- GitLab
- Jenkins
- Azure DevOps
- cloud pipelines

## Phase 17 — OpenSecant

- test generation
- execution
- result ingestion

## Phase 18 — OpenVector

- engineering events
- metrics
- visualization

## Phase 19 — Web UI

- Dashboard
- Twin Explorer
- Reviews
- Approvals
- Audit
- AI activity

## Phase 20 — Enterprise Integrations

- Jira
- ADO
- Confluence
- GitHub
- GitLab
- Bitbucket
- Figma
- identity systems

## Phase 21 — Observability

- OpenTelemetry
- Datadog
- Prometheus
- Grafana
- CloudWatch
- Application Insights

## Phase 22 — Production Intelligence

- deployments
- incidents
- runtime signals
- production feedback

## Phase 23 — Python Intelligence

- ML
- NLP
- prediction
- anomaly detection
- forecasting
- quality intelligence

## Phase 24 — Advanced Graph

- Apache AGE
- graph analytics
- advanced graph traversal
- temporal graph

## Phase 25 — Distributed Architecture

- Redis
- event bus
- Kafka
- asynchronous workers
- scalable services

## Phase 26 — Enterprise Scale

- multi-tenancy
- SSO
- enterprise security
- compliance
- data isolation
- high availability

## Phase 27 — Engineering Simulation

- change simulation
- dependency simulation
- release simulation
- risk simulation

## Phase 28 — Autonomous Engineering

Policy-controlled autonomous engineering workflows.

---

# 100. First Vertical Slice

Despite the breadth of the final architecture, development starts with one complete vertical slice.

```text
Requirement
    |
    v
AI Gherkin
    |
    v
Validation
    |
    v
Version
    |
    v
Review
    |
    v
Role Approval
    |
    v
Audit
```

Example:

```bash
setwin requirement create \
  "Customer can cancel an order within 30 minutes"

setwin review REQ-001

setwin approve REQ-001

setwin status
```

Expected:

```text
REQ-001

Requirement:
  APPROVED

Gherkin:
  APPROVED

Next Stage:
  DESIGN

Pending:
  Architect Approval
```

---

# 101. Definition of Done

Every feature requires:

- Implementation
- Unit tests
- Integration tests where appropriate
- Authorization
- Audit
- Version handling
- Error handling
- Documentation
- Observability
- Security considerations

AI features additionally require:

- Provider abstraction
- Structured output
- Validation
- Failure handling
- AI provenance
- Model/provider tracking
- Human governance

---

# 102. Development Rules

## Rule 1

Read `PLAN.md` before implementation.

## Rule 2

Implement incrementally.

## Rule 3

Never skip governance because it is inconvenient.

## Rule 4

Never silently modify approved artifacts.

## Rule 5

Never bypass authorization.

## Rule 6

Never treat AI output as automatically authoritative.

## Rule 7

Prefer deterministic systems over AI when deterministic systems can solve the problem.

## Rule 8

Reuse mature open-source components.

## Rule 9

Keep provider integrations behind adapters.

## Rule 10

Keep IDE integrations behind standard protocols.

## Rule 11

Keep external systems behind adapters.

## Rule 12

Avoid premature microservices.

## Rule 13

Do not remove long-term capabilities merely because they are not implemented yet.

## Rule 14

Every significant architectural decision must be documented.

## Rule 15

Every mutation must be auditable.

---

# 103. Technology Evolution Rule

SETwin's architecture should evolve:

```text
Simple
   |
   v
Modular
   |
   v
Scalable
   |
   v
Distributed
```

Not:

```text
Distributed
   |
   v
Try to make it simple
```

Start simple while keeping the domain model and interfaces capable of evolving.

---

# 104. Architecture Evolution

### Stage 1

```text
Node.js
TypeScript
PostgreSQL
```

### Stage 2

```text
+
pgvector
+
Ollama
+
React
```

### Stage 3

```text
+
Graph
+
Redis
+
Object Storage
```

### Stage 4

```text
+
Event Bus
+
Workers
+
Python ML
```

### Stage 5

```text
+
Distributed Services
+
Enterprise Identity
+
Multi-Tenant
+
Advanced Analytics
```

The product plan contains all stages.

---

# 105. Repository Structure

Target structure:

```text
SETwin/
│
├── PLAN.md
├── README.md
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
├── THIRD_PARTY.md
├── CHANGELOG.md
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
├── docker-compose.yml
├── .env.example
│
├── apps/
│   ├── api/
│   ├── cli/
│   ├── mcp/
│   ├── worker/
│   └── web/
│
├── packages/
│   ├── config/
│   ├── domain/
│   ├── database/
│   ├── auth/
│   ├── workflow/
│   ├── approval/
│   ├── audit/
│   ├── gherkin/
│   ├── graph/
│   ├── context/
│   ├── search/
│   ├── ai/
│   ├── agents/
│   ├── repository/
│   ├── impact/
│   ├── testing/
│   ├── integrations/
│   ├── events/
│   ├── notifications/
│   └── observability/
│
├── services/
│   ├── ml/
│   ├── nlp/
│   └── analytics/
│
├── integrations/
│   ├── git/
│   ├── github/
│   ├── gitlab/
│   ├── bitbucket/
│   ├── jira/
│   ├── azure-devops/
│   ├── confluence/
│   ├── figma/
│   ├── cicd/
│   ├── observability/
│   ├── opencode/
│   ├── openhands/
│   ├── opensecant/
│   └── openvector/
│
├── docs/
│
├── tests/
│
└── infrastructure/
    ├── docker/
    ├── kubernetes/
    ├── terraform/
    └── helm/
```

Not every directory needs to exist on day one.

The structure represents the long-term product architecture.

---

# 106. Third-Party Governance

`THIRD_PARTY.md` must document:

```text
Project
Repository
Version
License
Purpose
Required / Optional
Security considerations
Integration boundary
Replacement strategy
```

---

# 107. Final North Star

SETwin should eventually become the engineering system that understands:

```text
WHAT
Requirements
Business Rules

WHY
Decisions
Architecture
Design

HOW
Code
Components
Services
APIs

PROVE
Gherkin
Tests
Builds

WHO
Teams
Owners
Reviewers
Approvers

WHEN
Versions
Changes
Releases

WHAT HAPPENED
Production
Incidents
Observability

WHAT AI DID
Agents
Models
Providers
Actions

WHAT HUMANS DECIDED
Reviews
Approvals
Exceptions

WHAT WE LEARNED
Defects
Incidents
Metrics
Historical patterns
```

---

# 108. The SETwin Loop

```text
                    UNDERSTAND
                         |
                         v
                      MODEL
                         |
                         v
                     PROPOSE
                         |
                         v
                      REVIEW
                         |
                         v
                     APPROVE
                         |
                         v
                   IMPLEMENT
                         |
                         v
                       TEST
                         |
                         v
                     RELEASE
                         |
                         v
                    OBSERVE
                         |
                         v
                     LEARN
                         |
                         +----------------+
                                          |
                                          v
                                     UNDERSTAND
```

---

# 109. Final Product Definition

> **SETwin is a persistent Software Engineering Twin that connects requirements, business rules, Gherkin, architecture, design, code, tests, defects, changes, builds, releases, production signals, AI agents, human reviews, approvals and engineering history into one traceable engineering knowledge system.**

It does not replace the tools engineers already use.

It makes those tools work together with persistent engineering memory.

The fundamental proposition remains:

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

---

# 110. Cursor Agent Build Instructions

This section is mandatory.

Cursor must treat this section as the operational build procedure.

## STEP 1 — Read PLAN.md

Before making any code changes:

```text
Read PLAN.md completely.
Identify the current implementation phase.
Do not implement future phases.
```

The agent must summarize:

```text
Current phase
Goal
Files likely to change
Tests required
Dependencies required
```

before implementation.

## STEP 2 — Inspect the Existing Repository

Before creating files:

```text
Inspect:
- repository structure
- existing source files
- package.json / pyproject.toml
- README.md
- tests
- configuration
- Docker configuration
```

Do not overwrite existing work without understanding it.

Do not add Phase 1+ features to the Python prototype.

## STEP 3 — Determine Current Phase

The first incomplete phase on the **TypeScript core** is the work.

Example:

```text
TypeScript Phase 4 complete
Phase 5 incomplete

Therefore:
Implement Phase 5 only.
Do not implement Python Phase 5.
```

Do not jump to AI, MCP, or web UI because those appear easy.

## STEP 4 — Produce an Implementation Plan

Before coding, output a concise plan, then implement incrementally.

Preferred sequence for a feature:

```text
Domain model
    |
Database migration
    |
Repository
    |
Service
    |
API
    |
CLI
    |
Tests
```

Do not create hundreds of files in one operation.

---

# 111. Cursor Rules

## Small incremental changes

Each implementation should be small and testable.

## Test before progression

After every meaningful implementation:

```bash
pnpm test
```

Until the TypeScript core exists, the Python prototype may still run:

```bash
uv run pytest
```

If tests fail: STOP, investigate, fix, run tests again.

Do not continue to the next phase with failing tests.

## No fake implementations

Do not create empty `pass` / TODO / coming soon / placeholder / mock result for required production functionality unless this PLAN explicitly calls for a stub.

## No premature abstraction

Do not create 10 interfaces, 20 factories, microservices, or generic plugin frameworks unless the current requirement needs them.

Prefer simple implementations with clean boundaries.

Not every directory in section 105 needs to exist on day one.

## Reuse open source

Before implementing, ask whether a mature library already solves it.

Examples:

```text
Gherkin parsing  -> established parser
Git              -> Git library
Code parsing     -> Tree-sitter
Vector search    -> pgvector
Validation       -> Zod
HTTP API         -> Fastify
ORM / migrations -> Drizzle
CLI              -> existing Node CLI toolkit
LLM              -> provider SDK / OpenAI-compatible interface
MCP              -> MCP SDK
```

Do not implement these from scratch.

## Dependency discipline

Before adding a dependency, document in `THIRD_PARTY.md`:

```text
Project
Repository
Version
License
Purpose
Required / Optional
Why existing dependencies are insufficient
Security considerations
Integration boundary
Replacement strategy
```

## Deterministic before AI

If Git, Tree-sitter, Gherkin validation, permission checks, approval state, version validation, or audit can solve it, do not use an LLM.

## AI safety

AI-generated artifacts start as `DRAFT`.

AI must never automatically mark `APPROVED`.

AI must never bypass review, approval, authorization, or audit.

## Approval gate

Before changing workflow state, check current state, required role, permissions, approval policy, artifact version, and approval request. Reject the transition if any check fails.

## Audit every mutation

Every mutation must produce an audit event. Centralize mutation auditing in the application service layer. Do not rely on callers remembering to audit.

## Version protection

Never update an approved artifact in place. Create the next version as `DRAFT`. The previous approved version remains immutable.

## Database integrity

Enforce important rules at both the application layer and the database layer: unique artifact versions, foreign keys, required approval relationships, user-role relationships, audit immutability where practical.

## API, CLI, and MCP share services

```text
CLI ----+
API ----+----> Domain / Application Services
MCP ----+
```

Never implement separate business logic per interface. Never let MCP access the database directly.

## AI Gateway

Agents must never call provider SDKs directly. All model access goes through the AI Gateway and provider adapters.

No provider is a mandatory dependency for the application core. Ollama-only, OpenAI-only, Anthropic-only, and Bedrock-only must each work.

## No silent relationship creation

Relationships inferred by AI are marked `AI_INFERRED` with confidence. Deterministic relationships are marked `STATIC_ANALYSIS`. Humans can later confirm inferred relationships.

## Structured AI output

Prefer structured outputs. Validate AI output before persistence.

## Failure handling

Every AI integration must handle timeout, provider unavailable, invalid response, malformed JSON, rate limit, authentication failure, context too large, and model unavailable. Failure produces `AI_ACTION_FAILED` with an audit record. Never crash the workflow silently.

## Logging

Use structured logging. Every workflow request has a `correlation_id` across API, service, AI, agent, audit, workflow, and integrations.

## Documentation

Every completed phase updates `README.md`, `docs/architecture.md`, `PLAN.md`, and `THIRD_PARTY.md` where applicable.

## Completion report

After every implementation task, report:

```text
Implementation Complete

Phase:
Implemented:
Files Changed:
Dependencies Added:
Database Changes:
API Changes:
CLI Changes:
Tests Added:
Tests Run:
Result:
Known Limitations:
Next Planned Step:
```

---

# 112. Exact Build Sequence for Cursor

Follow this sequence on the TypeScript core.

## Build 1 — Repository Foundation

Create:

```text
package.json
pnpm-workspace.yaml
tsconfig.json
apps/cli
apps/api
packages/config
tests
README.md
PLAN.md
.env.example
.gitignore
docker-compose.yml
```

Implement:

```bash
setwin --help
setwin status
```

Success:

```text
Application starts
CLI works
Vitest works
Docker environment works
```

CLI contracts must match the existing Python prototype: help, version, status without exposing secrets, init creates local directories.

## Build 2 — Configuration and Logging

Environment configuration, application configuration, database configuration, Pino structured logging, correlation IDs.

`setwin status` returns configuration health without exposing secrets.

## Build 3 — Database

PostgreSQL, Drizzle, migrations. Initial schema only. Do not build graph infrastructure yet.

## Build 4 — User / Role / Permission (complete)

User, Role, Permission, UserRole, Team. Permission checks. Tests: user can have a role; unauthorized operations fail.

## Build 5 — Artifact / Version (complete)

Artifact, ArtifactVersion. v1 immutable; v2 supersedes v1 as DRAFT. Projects, provenance, and explicit relationships are included.

## Build 6 — Audit Engine

AuditEvent, append-only storage, correlation ID, actor, role, entity, version. Every mutation generates an audit event.

## Build 7 — Review Engine (complete)

Review, findings, decisions: APPROVE, REJECT, CHANGES_REQUESTED.

## Build 8 — Approval Engine (complete)

ApprovalPolicy, ApprovalRequest, ApprovalDecision. Role, permission, and version validation. Multi-approval.

## Build 9 — Gherkin (complete)

Integrate a mature Gherkin parser. Features, scenarios, steps, validation, and requirement traceability.

## Build 10 — Requirement

```bash
setwin requirement create "<text>"
setwin requirement show REQ-001
```

Creates Requirement, ArtifactVersion, AuditEvent.

## Build 11 — Requirement → Gherkin AI

LLM Gateway, Ollama provider, Qwen. Natural language → structured Gherkin → parser → validation → DRAFT artifact. No automatic approval.

## Build 12 — Requirement Approval

```bash
setwin review REQ-001
setwin approve REQ-001
setwin reject REQ-001
setwin request-changes REQ-001
```

Validate role, permission, version, policy, workflow state. Generate audit event.

## Build 13 — First Complete Vertical Slice

Natural language requirement → AI Gherkin → validation → draft → review → PO approval → audit.

Do not move to architecture agents until this works end-to-end.

Later builds follow product phases 9–28 in this PLAN. Do not skip ahead.

---

# 113. First Demo Scenario

The first meaningful demonstration remains:

```text
Customers can cancel an order within 30 minutes.
```

SETwin generates Gherkin as DRAFT. The Product Owner reviews and approves. Every step is versioned and audited. Design, code, tests, and release come only after that slice works.

---

# 114. Engineering Principles

1. Persistent engineering memory
2. Graph-first knowledge
3. Deterministic facts before AI
4. Gherkin-first behavior
5. Human approval gates
6. Role-based governance
7. Version everything important
8. Audit every important change
9. AI actions are traceable
10. Provider-independent AI
11. IDE-independent integration
12. MCP-first external integration
13. Open-source reuse
14. Simple modular architecture
15. CLI-first development
16. API, CLI, and MCP share domain services
17. No bypassing governance
18. No silent modification of approved artifacts
19. Tests before phase progression
20. No unnecessary infrastructure
21. TypeScript core; Python for ML/analytics
22. Start simple; keep the domain able to evolve
