# SETwin — Software Engineering Twin

> **A living digital twin for AI-native software engineering.**

**Core principle**

> **AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**

---

# 1. Vision

SETwin — **Software Engineering Twin** — is a persistent engineering intelligence and governance layer for software development.

SETwin maintains a living representation of:

- Product requirements
- Business rules
- Gherkin features and scenarios
- Architecture and design
- Source code
- APIs
- Components
- Tests
- Defects
- Decisions
- Changes
- Reviews
- Approvals
- Builds
- Releases
- Engineering activity
- AI-generated proposals
- Human decisions

The goal is to give an AI Scrum team persistent knowledge of the software product rather than relying only on the current repository, prompt, or RAG context.

SETwin should understand:

> **What exists?**

> **What changed?**

> **Why does it exist?**

> **What will this change affect?**

> **What tests validate it?**

> **Who reviewed it?**

> **Who approved it?**

> **What did the AI do?**

> **What happened after it was implemented?**

---

# 2. Product North Star

A Product Owner enters:

```text
Customers can cancel an order within 30 minutes of placing it.
```

SETwin should eventually drive the lifecycle:

```text
Natural Language Requirement
          |
          v
Gherkin Feature + Scenarios
          |
          v
Gherkin Validation
          |
          v
Product Owner Review
          |
          v
Product Owner Approval
          |
          v
Architecture / Design Proposal
          |
          v
Architect Review
          |
          v
Architect Approval
          |
          v
Code Proposal / Implementation
          |
          v
Code Review
          |
          v
Code Approval
          |
          v
Test Generation / Modification
          |
          v
QE Review
          |
          v
Test Approval
          |
          v
Unit Tests
          |
          v
Build
          |
          v
API Tests
          |
          v
UI Tests
          |
          v
Release Review
          |
          v
Release Approval
```

At every important stage:

```text
AI proposes
     |
     v
Artifact created as DRAFT
     |
     v
Role review
     |
     +---- CHANGES REQUESTED
     |
     v
Human approval
     |
     v
Next stage
```

AI must never silently bypass an approval gate.

---

# 3. What SETwin Is

SETwin is:

- A persistent software engineering knowledge system
- A software product digital twin
- A software engineering knowledge graph
- A change-impact analysis system
- An AI Scrum-team orchestration layer
- A human-governed AI engineering workflow
- An engineering traceability system
- A review and approval system
- An engineering audit system
- An integration layer for AI coding agents and IDEs

---

# 4. What SETwin Is NOT

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
- A replacement for OpenCode
- A replacement for OpenHands
- A replacement for Cursor
- A replacement for Windsurf

SETwin should orchestrate and connect these capabilities.

The fundamental boundary is:

> **SETwin owns engineering knowledge, traceability, workflow, governance and approval.**

External tools own their specialized execution capabilities.

---

# 5. Core Design Principles

## 5.1 Persistent Memory

SETwin must maintain persistent knowledge of the software system.

It should not depend on the AI remembering previous conversations.

---

## 5.2 Graph First

Use relationships to understand the system.

Example:

```text
Requirement
    |
    +-- Gherkin Feature
            |
            +-- Scenario
                    |
                    +-- Design
                    |
                    +-- Code
                    |
                    +-- Unit Test
                    +-- API Test
                    +-- UI Test
```

Graph relationships answer:

> What is related to this?

Vector search answers:

> What is semantically similar to this?

Both can coexist.

---

## 5.3 Deterministic Facts Before AI

Use deterministic technology whenever possible.

Examples:

- Git → repository history
- Tree-sitter → code structure
- Gherkin parser → Gherkin syntax
- PostgreSQL → transactional state
- Approval engine → authorization
- Tests → execution results

Use AI for:

- semantic understanding
- requirement interpretation
- design proposals
- impact analysis
- code generation
- test generation
- review assistance
- summarization
- reasoning over connected engineering knowledge

Do not use an LLM where deterministic logic is sufficient.

---

## 5.4 Human Governance

AI can:

- analyze
- propose
- generate
- review
- recommend

Humans must retain approval authority.

---

## 5.5 Version Everything Important

Never silently overwrite an approved artifact.

Example:

```text
REQ-101 v1
REQ-101 v2
REQ-101 v3
```

Relationships:

```text
REQ-101 v3
    |
    +-- SUPERSEDES --> REQ-101 v2
```

Approval always applies to an exact artifact version.

---

## 5.6 Audit Everything

Every important mutation must produce an audit event.

Never delete audit history.

---

## 5.7 Reuse Before Reinvent

Before implementing functionality:

1. Search for an established open-source implementation.
2. Evaluate whether it fits.
3. Check license compatibility.
4. Check maturity and maintenance.
5. Check security.
6. Prefer reuse where appropriate.
7. Avoid unnecessary dependencies.

Do not build proprietary versions of mature open-source capabilities.

---

## 5.8 Simple Yet Powerful

Avoid unnecessary infrastructure.

Do not introduce:

- Kafka
- Redis
- Elasticsearch
- Kubernetes
- Neo4j
- microservices
- event buses

unless a demonstrated requirement requires them.

The first implementation should be a modular monolith.

---

# 6. Open Source Foundation

SETwin should explicitly reuse mature open-source technologies.

## 6.1 Core Foundation

| Capability | Technology | Purpose |
|---|---|---|
| Database | PostgreSQL | Primary persistence |
| Graph | Apache AGE | Graph capabilities where justified |
| Vector search | pgvector | Semantic retrieval |
| API | FastAPI | Backend API |
| Validation | Pydantic | Schemas and validation |
| ORM | SQLAlchemy | Database access |
| Code parsing | Tree-sitter | Source-code structure |
| Version control | Git | Repository history |
| Gherkin | Gherkin/Cucumber ecosystem | Parsing and validation |
| AI orchestration | LangGraph | Optional agent orchestration |
| Local LLM runtime | Ollama | Local inference |
| Local model | Qwen | Local coding/reasoning |
| AI protocol | MCP | IDE/agent integration |
| Frontend | React | Web UI |
| Frontend language | TypeScript | UI development |
| Build tooling | Vite | Frontend build |
| Graph visualization | Cytoscape.js | Twin visualization |
| Testing | pytest | Backend tests |
| Containers | Docker Compose | Local deployment |

The exact dependency versions must be pinned and documented.

---

# 7. Optional Open Source Integrations

SETwin should integrate with:

- OpenCode
- OpenHands
- OpenSecant
- OpenVector

These must remain optional.

SETwin must still operate if they are not installed.

---

# 8. External / Enterprise Integrations

## LLM Providers

Initial:

- Ollama
- OpenAI
- Anthropic
- Amazon Bedrock

Later:

- Azure OpenAI
- Google Gemini
- OpenAI-compatible endpoints
- Additional enterprise providers

---

## Developer Tools

Support through standard adapters/protocols:

- Cursor
- Windsurf
- VS Code
- JetBrains
- OpenCode
- OpenHands
- Claude Code where practical

MCP should be the preferred integration mechanism wherever possible.

---

# 9. High-Level Architecture

```text
                         SETwin
              Software Engineering Twin
                           |
       +-------------------+--------------------+
       |                   |                    |
       v                   v                    v
   Twin Store        Workflow Engine       Audit Engine
       |                   |                    |
       |              Approval Engine           |
       |                   |                    |
       +-------------------+--------------------+
                           |
                     Context Engine
                           |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
   AI Gateway           Agents               MCP
       |                   |                   |
       |           +-------+-------+       +---+------+
       |           |       |       |       |          |
       |          PO  Architect Developer Cursor   Windsurf
       |                         QE          OpenCode
       |                                      VS Code
       |
 +-----+-------+-------+--------+
 |             |       |        |
Ollama       OpenAI  Bedrock  Anthropic
```

---

# 10. Architecture Style

Use a **modular monolith** initially.

Recommended:

```text
SETwin Application
|
+-- API
+-- Domain
+-- Workflow
+-- Approval
+-- Audit
+-- Graph
+-- Context
+-- AI
+-- Repository Intelligence
+-- Agents
+-- MCP
+-- Integrations
```

Do not split these into independent services initially.

---

# 11. Recommended Repository Structure

```text
SETwin/
│
├── PLAN.md
├── README.md
├── LICENSE
├── THIRD_PARTY.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
│
├── pyproject.toml
├── uv.lock
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── docs/
│   ├── architecture.md
│   ├── domain-model.md
│   ├── workflow.md
│   ├── approvals.md
│   ├── audit.md
│   ├── gherkin.md
│   ├── ai.md
│   ├── mcp.md
│   └── integrations.md
│
├── setwin/
│   ├── __init__.py
│   ├── cli.py
│   ├── config.py
│   │
│   ├── api/
│   │
│   ├── domain/
│   │   ├── artifacts/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── approvals/
│   │   ├── reviews/
│   │   └── audit/
│   │
│   ├── graph/
│   │
│   ├── workflow/
│   │
│   ├── context/
│   │
│   ├── gherkin/
│   │
│   ├── repository/
│   │
│   ├── impact/
│   │
│   ├── llm/
│   │   ├── base.py
│   │   ├── ollama.py
│   │   ├── openai.py
│   │   ├── anthropic.py
│   │   └── bedrock.py
│   │
│   ├── agents/
│   │   ├── product_owner.py
│   │   ├── architect.py
│   │   ├── developer.py
│   │   ├── qe.py
│   │   ├── reviewer.py
│   │   └── adapters/
│   │       ├── opencode.py
│   │       └── openhands.py
│   │
│   ├── mcp/
│   │
│   └── integrations/
│       ├── opensecant.py
│       └── openvector.py
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── workflow/
│   ├── authorization/
│   ├── audit/
│   ├── gherkin/
│   └── e2e/
│
├── frontend/
│   ├── package.json
│   ├── src/
│   └── ...
│
├── data/
│
└── workspace/
```

The implementation may evolve, but domain boundaries must remain clear.

---

# 12. Core Domain Model

Initial entities:

```text
PROJECT
USER
ROLE
PERMISSION
USER_ROLE

ARTIFACT
ARTIFACT_VERSION

REQUIREMENT
GHERKIN_FEATURE
GHERKIN_SCENARIO

DESIGN
CODE_ENTITY
TEST
DEFECT
BUILD
RELEASE

REVIEW
APPROVAL_POLICY
APPROVAL_REQUEST
APPROVAL_DECISION

DECISION
RISK

AUDIT_EVENT

AI_AGENT
AI_ACTION
AI_PROVIDER
```

---

# 13. Artifact Model

Use a common artifact abstraction.

Example:

```text
Artifact
|
+-- id
+-- type
+-- project_id
+-- current_version
+-- lifecycle_state
+-- created_by
+-- created_at
```

Version:

```text
ArtifactVersion
|
+-- artifact_id
+-- version
+-- content
+-- created_by
+-- created_at
+-- supersedes_version
+-- status
```

Important statuses:

```text
DRAFT
IN_REVIEW
CHANGES_REQUESTED
APPROVED
REJECTED
SUPERSEDED
```

---

# 14. Gherkin-First Requirements

Requirements must support Gherkin as the canonical behavioral representation.

Example:

```gherkin
Feature: Order cancellation

  As a customer
  I want to cancel an order
  So that I can receive a refund before fulfillment

  Scenario: Customer cancels an order within 30 minutes
    Given an order was placed 10 minutes ago
    And the order has not been fulfilled
    When the customer cancels the order
    Then the order should be cancelled
    And the customer should receive a cancellation confirmation
```

AI may generate the Gherkin.

AI-generated Gherkin is always:

```text
DRAFT
```

until approved.

---

# 15. Test Gherkin

Tests should also use Gherkin where appropriate.

Example:

```gherkin
Feature: Order cancellation API

  Scenario: Cancel order through API
    Given an authenticated customer
    And an eligible order exists
    When POST "/orders/{id}/cancel" is called
    Then the response status should be 200
    And the order status should be "Cancelled"
```

Differentiate:

```text
Business Gherkin
    |
    +-- expresses product behavior

Test Gherkin
    |
    +-- expresses executable validation
```

---

# 16. Gherkin Traceability

Canonical chain:

```text
Requirement
    |
    +-- Feature
          |
          +-- Scenario
                 |
                 +-- IMPLEMENTS --> Code
                 |
                 +-- TESTED_BY --> Test
                 |
                 +-- REVIEWED_BY --> Review
                 |
                 +-- APPROVED_BY --> Approval
```

This allows SETwin to answer:

> Which code implements this requirement?

> Which tests validate it?

> Who approved it?

> Which requirements are affected by this code change?

---

# 17. Graph Relationships

Initial relationships:

```text
DERIVED_FROM
IMPLEMENTS
DESIGNED_BY
TESTED_BY
DEPENDS_ON
AFFECTS
FIXES
INTRODUCED_IN
CHANGED_IN
SUPERSEDES
APPROVED_BY
REJECTED_BY
SATISFIES
CALLS
USES
VALIDATES
CAUSED_BY
DEPLOYED_TO
RELEASED_IN
REVIEWED_BY
```

Example:

```text
REQ-101
   |
   +-- SATISFIES --> GH-101
                       |
                       +-- IMPLEMENTS --> PaymentService.cancel()
                       |
                       +-- TESTED_BY --> API-TEST-22
                       |
                       +-- TESTED_BY --> UI-TEST-41
```

---

# 18. User / Role / Permission Model

Entities:

```text
USER
ROLE
PERMISSION
USER_ROLE
```

Example roles:

```text
Product Owner
Architect
Developer
QA / QE
Engineering Manager
Release Manager
Administrator
```

Organizations must be able to define custom roles.

---

# 19. Initial Permissions

```text
requirement:create
requirement:edit
requirement:view

design:create
design:edit
design:view

code:view
code:review

test:create
test:edit
test:review

artifact:approve
artifact:reject
artifact:request_changes

release:approve

audit:view

admin:manage_users
admin:manage_roles
admin:manage_policies
```

Backend authorization is mandatory.

Never rely only on frontend authorization.

---

# 20. Approval Engine

Approval is a first-class domain concept.

Entities:

```text
ApprovalPolicy
ApprovalRequest
ApprovalDecision
```

Example:

```yaml
approval_policies:

  requirement:
    required_roles:
      - product_owner

  design:
    required_roles:
      - architect

  code:
    required_roles:
      - engineering_reviewer

  test:
    required_roles:
      - qa_reviewer

  release:
    required_roles:
      - release_manager
```

Organizations can configure policies.

---

# 21. Multi-Approval

Example:

```text
Production Release

✓ QE Lead
✓ Engineering Manager
✓ Release Manager
```

The workflow proceeds only when all required approvals are satisfied.

---

# 22. Version-Aware Approval

Approval must reference:

- Artifact ID
- Artifact version
- Approval request
- User ID
- Role
- Timestamp
- Decision
- Comment
- Evidence

Example:

```text
approve(
    artifact=REQ-101,
    version=3,
    approval_request=APR-88
)
```

If version 4 is subsequently created, approval of version 3 does not approve version 4.

This must be enforced by the backend.

---

# 23. Review Model

A review contains:

```text
Review
|
+-- artifact
+-- artifact_version
+-- reviewer
+-- reviewer_role
+-- findings
+-- questions
+-- evidence
+-- recommendation
+-- decision
+-- created_at
+-- completed_at
```

Review decisions:

```text
APPROVE
REJECT
CHANGES_REQUESTED
```

---

# 24. Approval Dashboards

The system must support role-aware approval dashboards.

## User Dashboard

Show:

```text
My Pending Approvals
My Recent Decisions
My Assigned Reviews
My Rejected Items
My Requested Changes
My Audit Activity
```

## Role Dashboard

Example:

```text
QA Reviewer

Pending:
  TEST-101
  TEST-104
  TEST-109

Changes Requested:
  TEST-099

Recently Approved:
  TEST-088
```

Backend must enforce:

- user has role
- user has permission
- approval request is active
- artifact version matches
- policy requirements are satisfied

---

# 25. Audit System

All changes must be audited.

Audit actions include:

```text
CREATE
READ where appropriate
UPDATE
DELETE
APPROVE
REJECT
REQUEST_CHANGES
GENERATE
EXECUTE
IMPORT
EXPORT

USER_CREATED
USER_UPDATED
ROLE_CHANGED
PERMISSION_CHANGED
POLICY_CHANGED

AI_ACTION
BUILD_STARTED
BUILD_COMPLETED
TEST_STARTED
TEST_COMPLETED
RELEASE_CREATED
RELEASE_APPROVED
```

---

# 26. Audit Event

Minimum model:

```text
AuditEvent
|
+-- id
+-- timestamp
+-- user
+-- role
+-- action
+-- entity_type
+-- entity_id
+-- entity_version
+-- previous_state
+-- new_state
+-- source
+-- correlation_id
+-- session information where appropriate
+-- metadata
```

Example:

```json
{
  "event": "REQUIREMENT_UPDATED",
  "user": "user-123",
  "role": "product_owner",
  "entity": "REQ-101",
  "version_before": 2,
  "version_after": 3,
  "timestamp": "2026-09-20T10:32:15Z",
  "source": "web",
  "correlation_id": "..."
}
```

---

# 27. Artifact History vs Audit History

These are different.

## Artifact History

Answers:

> What changed in this artifact?

Example:

```text
REQ-101 v1
REQ-101 v2
REQ-101 v3
```

## Audit History

Answers:

> Who changed it, when, how and why?

Example:

```text
Basav
Product Owner
Updated REQ-101
v2 -> v3
Web UI
2026-09-20 10:32
```

Both are required.

---

# 28. AI Auditability

Every AI action affecting the engineering system must be traceable.

Record:

```text
AI Agent
Provider
Model
Task
Input context reference
Output artifact reference
Repository/version
Timestamp
Result
Human decision
```

Do not necessarily store sensitive prompts and outputs forever.

Configurable retention may be supported later.

At minimum, audit must establish:

```text
Who/what AI acted?
Which provider?
Which model?
What artifact was affected?
When?
What happened afterward?
Who approved it?
```

---

# 29. Append-Only Audit

Audit history must be append-only.

Do not allow normal users or application workflows to edit historical audit events.

Later enhancement:

```text
Hash(previous_event + current_event)
```

can provide tamper evidence.

Do not introduce blockchain.

---

# 30. Workflow Engine

Initial lifecycle:

```text
REQUIREMENT_DRAFT
       |
       v
REQUIREMENT_REVIEW
       |
       +---- CHANGES_REQUESTED
       |          |
       |          v
       |     REQUIREMENT_DRAFT
       |
       +---- APPROVED
              |
              v
DESIGN_DRAFT
       |
       v
DESIGN_REVIEW
       |
       +---- CHANGES_REQUESTED
       |
       +---- APPROVED
              |
              v
CODE_DRAFT
       |
       v
CODE_REVIEW
       |
       +---- CHANGES_REQUESTED
       |
       +---- APPROVED
              |
              v
TEST_DRAFT
       |
       v
TEST_REVIEW
       |
       +---- CHANGES_REQUESTED
       |
       +---- APPROVED
              |
              v
UNIT_TEST
       |
       v
BUILD
       |
       v
API_TEST
       |
       v
UI_TEST
       |
       v
RELEASE
```

The workflow engine owns lifecycle state.

AI agents do not directly manipulate workflow state.

---

# 31. Domain Events

Important events:

```text
RequirementCreated
RequirementChanged
RequirementReviewed
RequirementApproved
RequirementRejected

DesignCreated
DesignChanged
DesignReviewed
DesignApproved

CodeGenerated
CodeChanged
CodeReviewed
CodeApproved

TestGenerated
TestChanged
TestReviewed
TestApproved

BuildStarted
BuildPassed
BuildFailed

TestExecutionStarted
TestExecutionPassed
TestExecutionFailed

ReleaseCreated
ReleaseApproved
ReleaseRejected
```

Every important transition should generate an event and appropriate audit information.

---

# 32. Repository Intelligence

Command:

```bash
setwin ingest <repo>
```

Pipeline:

```text
Git Repository
      |
      +-- Git metadata
      +-- Files
      +-- Tree-sitter
      +-- AST
      +-- Code entities
      |
      v
SETwin Twin
```

Initially identify:

```text
Repository
Branch
Commit
File
Class
Function
Method
Import
Export
```

Deterministic relationships:

```text
FILE CONTAINS CLASS
CLASS CONTAINS METHOD
FILE IMPORTS FILE
METHOD CALLS METHOD
```

Use LLMs only for semantic interpretation.

---

# 33. Change Intelligence

Command:

```bash
setwin change
```

Pipeline:

```text
Git Diff
    |
Changed Files
    |
Changed Code Entities
    |
Graph Relationships
    |
Affected Requirements
    |
Affected Gherkin
    |
Affected Design
    |
Affected Tests
    |
Affected Defects
```

Example:

```text
CHANGE IMPACT

PaymentService.java

Requirements:
  REQ-101
  REQ-118

Gherkin:
  Cancel eligible payment
  Reject cancelled payment
  Refund cancelled payment

Tests:
  Unit: 8
  API: 3
  UI: 2

Reviews Required:
  Code
  Gherkin/Test
```

---

# 34. Context Engine

Given:

```text
REQ-001
```

SETwin should retrieve:

```text
Requirement
Related Requirements
Business Rules
Gherkin
Design
Components
Code
APIs
Tests
Defects
Decisions
Recent Changes
Pending Reviews
Approval State
```

Graph first.

Vector search is supplementary.

---

# 35. Vector Search

Use pgvector for:

- Similar requirements
- Similar defects
- Similar decisions
- Similar designs
- Semantic retrieval
- Finding potentially related artifacts

Do not make vector search the source of truth.

---

# 36. Team Awareness Context

Every AI agent should receive a structured Team Awareness Context.

Example:

```text
TEAM AWARENESS CONTEXT

Sprint:
  Sprint 24

Story:
  STORY-101

Requirement:
  REQ-101 v3

Gherkin:
  Feature: Order Cancellation
  Scenarios: 4

Related Requirements:
  REQ-098
  REQ-118

Design:
  DES-44 v2

Affected Code:
  PaymentService.java
  OrderService.java

Tests:
  Unit: 12
  API: 4
  UI: 2

Defects:
  BUG-44

Recent Changes:
  commit abc123

Pending Reviews:
  Code Review
  QE Review

Current State:
  CODE_REVIEW
```

This is the shared context for the AI Scrum team.

---

# 37. AI Gateway

All LLM access must pass through one abstraction.

Example:

```python
class LLMProvider:

    def generate(
        self,
        prompt,
        context=None,
        model=None
    ):
        ...
```

Agents must not directly call provider-specific SDKs.

---

# 38. Provider Architecture

```text
SETwin AI Gateway
       |
       +-- Ollama
       +-- OpenAI
       +-- Anthropic
       +-- Bedrock
       +-- Azure OpenAI
       +-- Gemini
       +-- OpenAI-compatible
```

Example configuration:

```yaml
llm:

  default:
    provider: ollama
    model: qwen2.5-coder:7b

  providers:

    ollama:
      base_url: http://localhost:11434

    openai:
      api_key_env: OPENAI_API_KEY

    anthropic:
      api_key_env: ANTHROPIC_API_KEY

    bedrock:
      region_env: AWS_REGION
```

Credentials must never be committed.

---

# 39. Model Routing

Later support task-specific routing.

Example:

```yaml
routing:

  requirement_generation:
    provider: ollama
    model: qwen2.5-coder:7b

  code_generation:
    provider: openai
    model: configured-model

  architecture_review:
    provider: anthropic
    model: configured-model
```

This must remain configuration-driven.

---

# 40. AI Scrum Team

## Product Owner Agent

Responsibilities:

- Clarify requirements
- Identify ambiguity
- Generate Gherkin
- Identify business rules
- Identify dependencies
- Identify conflicts
- Suggest acceptance scenarios

Does not approve requirements.

---

## Architect Agent

Responsibilities:

- Propose architecture
- Identify affected components
- Identify dependencies
- Identify risks
- Generate design artifacts
- Analyze architecture impact

Does not approve designs.

---

## Developer Agent

Responsibilities:

- Generate implementation proposals
- Modify code
- Generate unit tests
- Explain implementation
- Produce diffs
- Work through coding-agent adapters

Does not approve code.

---

## QE Agent

Responsibilities:

- Generate test scenarios
- Analyze regression scope
- Identify missing coverage
- Generate API/UI tests
- Review test completeness
- Execute or request execution

Does not approve tests.

---

## Reviewer Agent

Responsibilities:

- Identify inconsistencies
- Detect missing coverage
- Detect traceability gaps
- Identify risks
- Recommend changes

Does not replace human approval.

---

# 41. Coding Agent Adapters

```text
setwin/agents/adapters/

opencode.py
openhands.py
```

Common interface:

```python
class CodingAgent:

    def execute(
        self,
        task,
        repository,
        context
    ):
        ...
```

Return:

```text
Changed files
Diff
Commands executed
Tests executed
Result
Errors
```

SETwin records the action.

---

# 42. MCP

SETwin should expose an MCP server.

Initial tools:

```text
setwin_get_context
setwin_get_requirement
setwin_get_design
setwin_get_impact
setwin_get_tests
setwin_get_defects
setwin_search

setwin_create_artifact

setwin_submit_review
setwin_get_review

setwin_get_status
```

Later:

```text
setwin_get_approval
setwin_get_audit
setwin_get_team_context
setwin_create_change_proposal
```

MCP should become the primary integration path for AI-enabled developer tools.

---

# 43. OpenSecant Integration

OpenSecant is an optional UI automation integration.

Flow:

```text
SETwin
   |
   v
Identify affected UI scenarios
   |
   v
OpenSecant
   |
   v
Execute tests
   |
   v
Return results
   |
   v
SETwin records result
```

SETwin should not duplicate OpenSecant's automation engine.

---

# 44. OpenVector Integration

OpenVector is an optional metrics consumer.

Potential SETwin metrics:

```text
Requirement Coverage
Gherkin Coverage
Code/Test Traceability
Automation Coverage
Defect Leakage
Change Failure Rate
Regression Risk
Review Cycle Time
Requirement Churn
Rework
AI Contribution
Human Intervention
Approval Cycle Time
```

SETwin provides engineering events and traceability data.

OpenVector owns visualization/metrics where appropriate.

---

# 45. CLI

SETwin should be CLI-first.

Initial:

```bash
setwin init

setwin status

setwin ingest <repo>

setwin requirement create "<text>"

setwin requirement show REQ-001

setwin design show DES-001

setwin graph REQ-001

setwin change

setwin context REQ-001

setwin review

setwin review REQ-001

setwin approve REQ-001

setwin reject REQ-001

setwin request-changes REQ-001
```

Later:

```bash
setwin agent run

setwin test

setwin build

setwin release
```

---

# 46. Web UI

The web UI comes after the core workflow is functional.

Recommended:

```text
React
TypeScript
Vite
Cytoscape.js
```

Screens:

```text
Dashboard

Twin Explorer

Requirement

Gherkin

Change Impact

Review

My Approvals

Role Approval Queue

Audit Explorer

AI Activity

Workflow

Repository
```

---

# 47. Dashboard

Main dashboard:

```text
SETwin

Current Sprint
Active Stories
Pending Reviews
Pending Approvals
Changes
Build Status
Test Status
Defects
AI Activity
Audit Activity
```

---

# 48. Security

Initial security requirements:

- Authentication
- Authorization
- Role-based access control
- Permission checks
- Secret management
- Input validation
- Audit logging
- Artifact version protection
- Approval protection
- API authentication
- Secure provider configuration

Never expose provider API keys.

Never store secrets in Git.

---

# 49. Testing Strategy

Every feature must have:

```text
Unit Tests
Integration Tests
Authorization Tests
Workflow Tests
Audit Tests
```

Important workflow tests:

```text
Cannot approve without required role

Cannot approve without permission

Cannot approve stale artifact version

Cannot bypass approval

Cannot move workflow forward without approval

Changes create new artifact version

Approved artifacts cannot be silently modified

Every mutation generates audit event

AI-generated artifact remains DRAFT

Rejected artifact cannot progress

Changes Requested returns workflow to correct stage
```

---

# 50. Definition of Done

Every feature must include:

- Implementation
- Tests
- Authorization
- Audit events
- Version handling
- Error handling
- Documentation
- CLI/API where appropriate

Approval features additionally require:

- Role validation
- Permission validation
- Version validation
- Approval policy validation
- Audit trail

AI features additionally require:

- Provider abstraction
- Structured output
- Validation
- Failure handling
- AI audit information

---

# 51. Development Phases

## Phase 0 — Foundation

Build:

- Python project
- FastAPI
- PostgreSQL
- Database migrations
- Configuration
- Docker Compose
- pytest
- CLI
- logging

Deliverable:

```bash
setwin init
setwin status
```

---

## Phase 1 — Identity and Authorization

Build:

- User
- Role
- Permission
- UserRole
- ApprovalPolicy

Deliver:

```text
User management
Role management
Permission checks
```

---

## Phase 2 — Twin Core

Build:

- Artifact
- ArtifactVersion
- Relationship
- Project
- Review
- Event

Deliver:

```text
Create artifact
Version artifact
Link artifacts
Query relationships
```

---

## Phase 3 — Gherkin

Build:

- Feature
- Scenario
- Given
- When
- Then
- And
- But
- Background
- Parser integration
- Validation

Deliver:

```text
Natural language
      |
      v
Gherkin
      |
      v
Validation
      |
      v
Stored artifact
```

---

## Phase 4 — Approval Engine

Build:

- ApprovalRequest
- ApprovalDecision
- ApprovalPolicy
- Role-based approval
- Multi-approval
- Version-aware approval

---

## Phase 5 — Audit Engine

Build:

- AuditEvent
- Append-only storage
- Correlation IDs
- Actor tracking
- Version tracking
- AI activity tracking

---

## Phase 6 — Requirement AI

Build:

- LLM interface
- Ollama provider
- Qwen support
- Gherkin generation
- Structured output
- Validation

---

## Phase 7 — Repository Intelligence

Build:

- Git integration
- Tree-sitter
- Repository ingestion
- File entities
- Classes
- Functions
- Methods
- Imports
- Basic relationships

---

## Phase 8 — Change Impact

Build:

```text
Git diff
    |
Code
    |
Graph
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
```

---

## Phase 9 — Context Engine

Build:

- Graph-first context retrieval
- pgvector
- Semantic search
- Team Awareness Context

---

## Phase 10 — AI Scrum Team

Build:

- Product Owner Agent
- Architect Agent
- Developer Agent
- QE Agent
- Reviewer Agent

---

## Phase 11 — Coding Agents

Build adapters:

- OpenCode
- OpenHands

---

## Phase 12 — MCP

Build:

- MCP server
- Context tools
- Search tools
- Artifact tools
- Review tools
- Status tools

---

## Phase 13 — OpenSecant

Build:

- UI test adapter
- Scenario mapping
- Test execution results
- Evidence recording

---

## Phase 14 — OpenVector

Build:

- Event export
- Traceability metrics
- Engineering metrics integration

---

## Phase 15 — Web UI

Build:

- Dashboard
- Twin Explorer
- Review
- My Approvals
- Role Queue
- Impact Analysis
- Audit Explorer
- AI Activity

---

# 52. FIRST VERTICAL SLICE

Do NOT start by building everything.

The first complete vertical slice is:

```text
Requirement
    |
    v
AI Gherkin Generation
    |
    v
Gherkin Validation
    |
    v
Requirement Version
    |
    v
Approval Request
    |
    v
Role Dashboard
    |
    v
Product Owner Approval
    |
    v
Audit Event
    |
    v
Design Proposal
    |
    v
Design Approval
```

CLI example:

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
  Approved

Gherkin:
  Approved

Next Stage:
  Design

Pending:
  Architect Approval
```

---

# 53. Detailed Cursor Agent Build Instructions

This section is mandatory.

Cursor must treat this section as the operational build procedure.

---

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

---

## STEP 2 — Inspect the Existing Repository

Before creating files:

```text
Inspect:
- repository structure
- existing source files
- pyproject.toml
- README.md
- tests
- configuration
- Docker configuration
```

Do not overwrite existing work without understanding it.

---

## STEP 3 — Determine Current Phase

The agent must determine the first incomplete phase.

Example:

```text
Phase 0 complete
Phase 1 incomplete

Therefore:
Implement Phase 1 only.
```

Do not jump to Phase 6 because an LLM integration appears easy.

---

## STEP 4 — Produce an Implementation Plan

Before coding, output a concise plan:

```text
Implementation Plan

1. Add domain models
2. Add migration
3. Add repository/service layer
4. Add API
5. Add CLI
6. Add authorization
7. Add audit events
8. Add tests
9. Run tests
```

Then implement.

---

# 54. Cursor Rule — Small Incremental Changes

Each implementation should be small.

Preferred sequence:

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

# 55. Cursor Rule — Test Before Progression

After every meaningful implementation:

```bash
pytest
```

If tests fail:

```text
STOP
Investigate
Fix
Run tests again
```

Do not continue to the next phase with failing tests.

---

# 56. Cursor Rule — No Fake Implementations

Do not create:

```python
pass
```

or fake implementations simply to make imports succeed.

Do not create:

```text
TODO
coming soon
placeholder
mock result
```

for required production functionality unless the PLAN explicitly calls for a stub.

---

# 57. Cursor Rule — No Premature Abstraction

Do not create:

```text
10 interfaces
20 factories
multiple microservices
generic plugin frameworks
```

unless the current requirement needs them.

Prefer simple implementations with clean boundaries.

---

# 58. Cursor Rule — Reuse Open Source

Before implementing:

```text
Is this a standard problem?

Does a mature open-source library already solve it?
```

Examples:

```text
Gherkin parsing
    -> use established parser

Git
    -> use Git library

Code parsing
    -> Tree-sitter

Vector search
    -> pgvector

Graph
    -> PostgreSQL / AGE where justified

LLM
    -> provider SDK / OpenAI-compatible interface

MCP
    -> MCP SDK
```

Do not implement these from scratch.

---

# 59. Cursor Rule — Dependency Discipline

Before adding a dependency:

Document:

```text
Dependency:
Purpose:
Why needed:
Why existing dependencies are insufficient:
License:
Mandatory or optional:
```

Update:

```text
THIRD_PARTY.md
```

---

# 60. Cursor Rule — Deterministic Before AI

When implementing functionality:

Ask:

```text
Can this be solved deterministically?
```

If yes:

```text
Use deterministic implementation.
```

Examples:

```text
Git diff
Tree-sitter parsing
Gherkin validation
Permission checks
Approval state
Version validation
Audit event creation
```

Use AI only when semantic reasoning is actually required.

---

# 61. Cursor Rule — AI Safety

AI-generated artifacts must initially be:

```text
DRAFT
```

AI must never automatically mark:

```text
APPROVED
```

AI must never bypass:

```text
REVIEW
APPROVAL
AUTHORIZATION
AUDIT
```

---

# 62. Cursor Rule — Approval Gate

Before changing workflow state:

```text
Check:
1. Current state
2. Required role
3. User permissions
4. Approval policy
5. Artifact version
6. Approval request
```

If any check fails:

```text
Reject transition.
```

---

# 63. Cursor Rule — Audit Every Mutation

Every mutation must produce an audit event.

Examples:

```text
CREATE
UPDATE
DELETE
APPROVE
REJECT
REQUEST_CHANGES
GENERATE
EXECUTE
CONFIGURATION_CHANGE
ROLE_CHANGE
PERMISSION_CHANGE
AI_ACTION
```

Do not rely on developers remembering to call the audit service manually.

Where practical, centralize mutation auditing in the application service/domain layer.

---

# 64. Cursor Rule — Version Protection

Never:

```text
UPDATE approved artifact in place
```

Instead:

```text
Approved v3
     |
     v
Create v4
     |
     v
v4 = DRAFT
```

v3 remains immutable.

---

# 65. Cursor Rule — Database Integrity

Where possible enforce important rules at both:

```text
Application layer
Database layer
```

Examples:

- Unique artifact version
- Foreign keys
- Required approval relationships
- User-role relationships
- Audit event immutability where practical

---

# 66. Cursor Rule — API and CLI Must Share Services

Do not implement separate business logic:

```text
CLI logic
API logic
```

Instead:

```text
CLI ----+
        |
API ----+----> Domain/Application Services
        |
MCP ----+
```

This ensures all interfaces use the same:

- authorization
- workflow
- validation
- audit
- versioning

---

# 67. Cursor Rule — MCP Must Not Bypass Governance

MCP tools must call the same application services as CLI/API.

Never create:

```text
MCP direct database access
```

MCP:

```text
MCP Tool
   |
   v
Application Service
   |
   +-- Authorization
   +-- Validation
   +-- Workflow
   +-- Audit
   |
   v
Database
```

---

# 68. Cursor Rule — AI Gateway

Agents must never directly call:

```text
Ollama API
OpenAI SDK
Anthropic SDK
Bedrock SDK
```

Instead:

```text
Agent
  |
  v
AI Gateway
  |
  v
Provider Adapter
```

This makes providers interchangeable.

---

# 69. Cursor Rule — Provider Independence

The following must work independently:

```text
Ollama only
OpenAI only
Anthropic only
Bedrock only
```

No provider should become a mandatory dependency for the application core.

---

# 70. Cursor Rule — Repository Intelligence

Use:

```text
Git
Tree-sitter
```

for deterministic repository facts.

Do not ask an LLM:

```text
Which functions are in this file?
```

when Tree-sitter can answer it.

Use LLMs for:

```text
What does this function semantically accomplish?
```

---

# 71. Cursor Rule — Traceability

When creating an artifact, ask:

```text
What does this artifact implement?
What implements this artifact?
What tests this artifact?
Who reviewed it?
Who approved it?
What changed it?
```

Maintain relationships whenever evidence exists.

---

# 72. Cursor Rule — No Silent Relationship Creation

Relationships inferred by AI should be marked appropriately.

Example:

```text
RELATIONSHIP:
REQ-101 -> IMPLEMENTED_BY -> PaymentService.cancel()

SOURCE:
AI_INFERRED

CONFIDENCE:
0.87
```

Deterministic relationships can be marked:

```text
SOURCE:
STATIC_ANALYSIS
```

Later humans can confirm inferred relationships.

---

# 73. Cursor Rule — Structured AI Output

Prefer structured outputs:

```json
{
  "feature": "...",
  "scenarios": [],
  "business_rules": [],
  "ambiguities": [],
  "dependencies": []
}
```

Do not rely on free-form text when a domain object is required.

Validate AI output before persistence.

---

# 74. Cursor Rule — Failure Handling

Every AI integration must handle:

```text
Timeout
Provider unavailable
Invalid response
Malformed JSON
Rate limit
Authentication failure
Context too large
Model unavailable
```

Never crash the workflow silently.

AI failure should result in:

```text
AI_ACTION_FAILED
```

with an audit record.

---

# 75. Cursor Rule — Logging

Use structured logging.

Every workflow request should have:

```text
correlation_id
```

Use it across:

```text
API
Service
AI
Agent
Audit
Workflow
Integration
```

This makes debugging possible.

---

# 76. Cursor Rule — Documentation

Every completed phase must update relevant documentation.

At minimum:

```text
README.md
docs/architecture.md
PLAN.md
THIRD_PARTY.md
```

where applicable.

---

# 77. Cursor Rule — Completion Report

After every implementation task, Cursor must report:

```text
Implementation Complete

Phase:
<phase>

Implemented:
- ...
- ...

Files Changed:
- ...

Dependencies Added:
- ...

Database Changes:
- ...

API Changes:
- ...

CLI Changes:
- ...

Tests Added:
- ...

Tests Run:
- ...

Result:
PASS / FAIL

Known Limitations:
- ...

Next Planned Step:
- ...
```

---

# 78. Exact Build Sequence for Cursor

Cursor should follow this sequence.

## Build 1 — Repository Foundation

Create:

```text
pyproject.toml
setwin/
tests/
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

Success criteria:

```text
Application starts
CLI works
pytest works
Docker environment works
```

---

## Build 2 — Configuration

Implement:

```text
Environment configuration
Application configuration
Database configuration
Logging
```

Success:

```bash
setwin status
```

returns configuration health without exposing secrets.

---

## Build 3 — Database

Implement:

```text
PostgreSQL
SQLAlchemy
Alembic
```

Create initial schema.

Do not build graph functionality yet unless the first domain slice requires it.

---

## Build 4 — User / Role / Permission

Implement:

```text
User
Role
Permission
UserRole
```

Implement permission checks.

Tests:

```text
User can have role
User cannot perform unauthorized operation
Role permissions work
```

---

## Build 5 — Artifact / Version

Implement:

```text
Artifact
ArtifactVersion
```

Test:

```text
v1 created
v2 created
v1 immutable
v2 supersedes v1
```

---

## Build 6 — Audit Engine

Implement:

```text
AuditEvent
AuditService
Correlation ID
Actor
Role
Entity
Version
```

Every mutation must generate an audit event.

---

## Build 7 — Review Engine

Implement:

```text
Review
ReviewFinding
ReviewDecision
```

Support:

```text
APPROVE
REJECT
CHANGES_REQUESTED
```

---

## Build 8 — Approval Engine

Implement:

```text
ApprovalPolicy
ApprovalRequest
ApprovalDecision
```

Implement:

```text
role validation
permission validation
version validation
multi-approval
```

---

## Build 9 — Gherkin

Integrate mature Gherkin parser.

Implement:

```text
Feature
Scenario
Steps
Validation
```

CLI:

```bash
setwin gherkin validate file.feature
```

---

## Build 10 — Requirement

Implement:

```bash
setwin requirement create "<text>"
setwin requirement show REQ-001
```

Requirement creation must create:

```text
Requirement
ArtifactVersion
AuditEvent
```

---

## Build 11 — Requirement → Gherkin AI

Implement:

```text
LLM Gateway
Ollama provider
Qwen
```

Flow:

```text
Natural Language
      |
      v
AI
      |
      v
Structured Gherkin
      |
      v
Parser
      |
      v
Validation
      |
      v
DRAFT Artifact
```

No automatic approval.

---

## Build 12 — Requirement Approval

Implement:

```bash
setwin review REQ-001
setwin approve REQ-001
setwin reject REQ-001
setwin request-changes REQ-001
```

Validate:

```text
role
permission
version
approval policy
workflow state
```

Generate audit event.

---

## Build 13 — First Complete Vertical Slice

Demonstrate:

```text
Natural Language Requirement
        |
        v
AI Gherkin
        |
        v
Validation
        |
        v
Requirement Draft
        |
        v
Review
        |
        v
PO Approval
        |
        v
Audit
```

Do not move to architecture agents until this works end-to-end.

---

## Build 14 — Design Artifact

Implement:

```text
Design
DesignVersion
```

Connect:

```text
Requirement
    |
    +-- DERIVED_TO --> Design
```

---

## Build 15 — Architect Agent

Implement:

```text
Architect Agent
```

It receives Team Awareness Context.

It produces:

```text
Design Proposal
Affected Components
Dependencies
Risks
Open Questions
```

Output remains:

```text
DRAFT
```

---

## Build 16 — Design Approval

Implement:

```text
Architect Review
Architect Approval
Audit
Workflow transition
```

---

## Build 17 — Repository Ingestion

Implement:

```bash
setwin ingest <repo>
```

Use:

```text
Git
Tree-sitter
```

Extract:

```text
Repository
Commit
Branch
File
Class
Function
Method
Import
Export
```

---

## Build 18 — Code Relationships

Create deterministic relationships:

```text
FILE CONTAINS CLASS
CLASS CONTAINS METHOD
FILE IMPORTS FILE
METHOD CALLS METHOD
```

Store in Twin.

---

## Build 19 — Change Detection

Implement:

```bash
setwin change
```

Read Git diff.

Identify:

```text
Changed files
Changed entities
Changed methods
```

---

## Build 20 — Change Impact

Traverse graph:

```text
Code
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
```

Produce impact report.

---

## Build 21 — Vector Search

Add:

```text
pgvector
```

Generate embeddings for selected artifacts.

Support:

```bash
setwin search "similar order cancellation requirements"
```

Graph remains authoritative.

---

## Build 22 — Team Awareness Context

Create a deterministic context builder:

```text
Requirement
Related Artifacts
Design
Code
Tests
Defects
Changes
Reviews
Approvals
Current Workflow
```

Output structured context.

---

## Build 23 — Developer Agent

Developer Agent receives:

```text
Requirement
Gherkin
Design
Affected Code
Impact Analysis
Tests
Team Context
```

It produces:

```text
Implementation proposal
Code changes
Unit tests
Explanation
```

No automatic approval.

---

## Build 24 — Coding Agent Adapter

Implement OpenCode adapter.

Common interface:

```python
CodingAgent.execute(...)
```

Record:

```text
agent
task
repository
files changed
commands
tests
result
```

---

## Build 25 — QE Agent

Implement:

```text
Test Gherkin generation
Regression analysis
Unit test generation
API test generation
UI test identification
```

---

## Build 26 — Test Approval

Implement:

```text
QE review
QE approval
Audit
Workflow transition
```

---

## Build 27 — Unit / Build / API Execution

Implement execution adapters.

Lifecycle:

```text
Approved Code
      |
      v
Unit Tests
      |
      v
Build
      |
      v
API Tests
```

Record results in SETwin.

---

## Build 28 — MCP Server

Expose:

```text
get_context
get_requirement
get_design
get_impact
get_tests
get_defects
search
create_artifact
submit_review
get_review
get_status
```

All MCP calls use application services.

---

## Build 29 — OpenSecant

Integrate optional UI execution.

Flow:

```text
SETwin
  |
Affected UI Scenarios
  |
OpenSecant
  |
Execution
  |
SETwin Result
```

---

## Build 30 — Release Workflow

Implement:

```text
Release
Release Review
Release Approval
Release Audit
```

Support multiple required approvers.

---

## Build 31 — Web Backend APIs

Expose APIs for:

```text
Dashboard
Artifacts
Reviews
Approvals
Audit
Impact
AI Activity
```

---

## Build 32 — React UI

Build:

```text
Dashboard
Twin Explorer
Requirement
Gherkin
Review
My Approvals
Role Queue
Impact Analysis
Audit Explorer
AI Activity
```

---

## Build 33 — Cytoscape Twin Explorer

Visualize:

```text
Requirement
   |
Gherkin
   |
Design
   |
Code
   |
Tests
   |
Defects
```

Support:

```text
zoom
pan
expand
collapse
filter
search
```

---

## Build 34 — OpenVector

Expose engineering events/metrics to OpenVector.

Do not duplicate OpenVector's metric engine unnecessarily.

---

# 79. First Demo Scenario

The first meaningful SETwin demonstration should be:

### User

```text
Customers can cancel an order within 30 minutes.
```

### SETwin

Generates:

```gherkin
Feature: Order cancellation

Scenario: Customer cancels an eligible order
  Given an order was placed less than 30 minutes ago
  And the order has not been fulfilled
  When the customer cancels the order
  Then the order should be cancelled
```

### Product Owner

Reviews.

```text
APPROVE
```

Audit:

```text
Requirement REQ-001
Version 1
Approved by Product Owner
Timestamp
```

### Architect Agent

Generates:

```text
Design Proposal

Affected:
OrderService
PaymentService
NotificationService

Risks:
Refund timing
Concurrent fulfillment
Idempotency
```

### Architect

Approves.

### Developer Agent

Produces:

```text
Code proposal
Unit tests
```

### QE Agent

Produces:

```gherkin
Feature: Order cancellation API

Scenario: Cancel eligible order
...
```

### QE

Approves.

### SETwin

Runs:

```text
Unit Tests
Build
API Tests
UI Tests
```

Every step is traceable.

---

# 80. Final System Behavior

Eventually SETwin should answer:

## "Why does this code exist?"

```text
Code
 |
Requirement
 |
Gherkin Scenario
 |
Design
 |
Approval
 |
Decision
```

---

## "What will this change affect?"

```text
Changed Code
 |
Graph
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
```

---

## "Who approved this?"

```text
Artifact
 |
Version
 |
Approval Request
 |
User
 |
Role
 |
Timestamp
 |
Decision
 |
Evidence
```

---

## "What changed?"

```text
Audit
 |
Who
 |
What
 |
When
 |
Before
 |
After
 |
Why
 |
Agent
 |
Provider
 |
Model
```

---

# 81. Final Engineering Principles

SETwin must follow these principles throughout development:

1. **Persistent engineering memory**
2. **Graph-first knowledge**
3. **Deterministic facts before AI**
4. **Gherkin-first behavior**
5. **Human approval gates**
6. **Role-based governance**
7. **Version everything important**
8. **Audit every important change**
9. **AI actions are traceable**
10. **Provider-independent AI**
11. **IDE-independent integration**
12. **MCP-first external integration**
13. **Open-source reuse**
14. **Simple modular architecture**
15. **CLI-first development**
16. **API and CLI share domain services**
17. **No bypassing governance**
18. **No silent modification of approved artifacts**
19. **Tests before phase progression**
20. **No unnecessary infrastructure**

---

# 82. SETwin North Star

SETwin is not trying to create the smartest AI.

It is trying to create the **most informed engineering environment for AI**.

The intelligence comes from the combination of:

```text
Persistent Product Knowledge
        +
Engineering Relationships
        +
Change History
        +
Gherkin Behavior
        +
Code Intelligence
        +
Test Intelligence
        +
AI Reasoning
        +
Human Governance
        +
Complete Traceability
```

The fundamental loop is:

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
                  AUDIT
                     |
                     v
                  LEARN
                     |
                     +----------+
                                |
                                v
                           UNDERSTAND
```

The ultimate goal:

> **A software engineering system that remembers the entire product, understands every change, coordinates AI engineering roles, requires human governance, and can explain the complete path from business requirement to production software.**

**AI proposes. SETwin remembers. Roles review. Humans approve. Everything is traceable.**