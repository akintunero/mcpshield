# MCPShield

> **An AI-Powered Cloud Security Posture Management (CSPM) tool using the Model Context Protocol (MCP)**

MCPShield uses AI agents to scan cloud environments, detect security misconfigurations, generate Terraform and CLI remediations, and enforce human-in-the-loop approval workflows.

---

## Features

- **21 Cloud Security Rules** — Critical, High, Medium, and Low findings with MITRE ATT&CK and CIS Benchmark mappings
- **AI Security Analyst** — Slack-integrated agent that explains findings, prioritizes risk, and guides remediation
- **Terraform Remediation** — Auto-generated HCL for every finding
- **AWS CLI Remediation** — Auto-generated CLI commands for every finding
- **Human-in-the-Loop** — No write operations execute without explicit approval
- **Executive Reports** — Professional security posture assessment reports (Markdown)
- **Security Scoring** — 0–100 score with A–F letter grade and severity breakdown
- **Multiple LLM Providers** — NVIDIA NIM, Gemini, Ollama, OpenAI-compatible
- **Web Dashboard** — Real-time security posture visualization
- **Cloud-Agnostic Architecture** — Provider interface ready for AWS, Azure, GCP, and more

---

## Architecture

### System Topology

```mermaid
graph TB
    %% Styling
    classDef user fill:#e0e7ff,stroke:#6366f1,stroke-width:2px,color:#1e1b4b
    classDef service fill:#dbeafe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f
    classDef engine fill:#fef3c7,stroke:#f59e0b,stroke-width:2px,color:#78350f
    classDef cloud fill:#d1fae5,stroke:#10b981,stroke-width:2px,color:#064e3b
    classDef critical fill:#fee2e2,stroke:#ef4444,stroke-width:3px,color:#7f1d1d,stroke-dasharray: 5 3

    subgraph Users[" "]
        direction LR
        Slack["💬 Slack Bot<br/><span style='font-size:10px'>Socket Mode</span>"]
        Browser["🌐 Web Browser<br/><span style='font-size:10px'>Dashboard UI</span>"]
    end

    subgraph Services[" "]
        direction TB
        Agent["🤖 AI Security Analyst<br/><span style='font-size:10px'>LLM + MCP Client</span>"]
        MCPServer["⚙️ MCP Server<br/><span style='font-size:10px'>11 Tools · Zod Validation</span>"]
        API["🔌 REST API Server<br/><span style='font-size:10px'>Fastify · Port 7802</span>"]
    end

    subgraph Engine[" "]
        direction TB
        Scanner["🔍 Scanner Engine<br/><span style='font-size:10px'>21 Security Rules · MITRE + CIS</span>"]
        Score["📊 Scoring Engine<br/><span style='font-size:10px'>0–100 Score · A–F Grade</span>"]
        Generators["📝 Code Generators<br/><span style='font-size:10px'>Terraform · AWS CLI · Reports</span>"]
        CloudTools["☁️ AWS SDK Layer<br/><span style='font-size:10px'>S3 · IAM · EC2 · Lambda · SQS · SNS · SSM · DDB · Secrets</span>"]
    end

    subgraph Cloud[" "]
        Target["🏢 AWS Cloud<br/><span style='font-size:10px'>API Endpoint</span>"]
    end

    Slack -->|"MCP Protocol (SSE)"| MCPServer
    Browser -->|"HTTP REST"| API
    Agent -->|"MCP Protocol"| MCPServer
    API -->|"MCP Client → Server"| MCPServer

    MCPServer --> Scanner
    MCPServer --> Score
    MCPServer --> Generators
    Scanner --> CloudTools
    Generators --> CloudTools
    CloudTools -->|"AWS SDK v3"| Target

    class Slack,Browser user
    class Agent,API,MCPServer service
    class Scanner,Score,Generators,CloudTools engine
    class Target cloud
```

> **🔐 Security Boundary:** The AI agent NEVER communicates directly with the cloud. ALL read and write operations pass through MCP tools, ensuring a strict security boundary.

### Data Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant UI as 🖥️ Slack / Dashboard
    participant MCP as ⚙️ MCP Server
    participant Engine as 🧠 Security Engine
    participant Cloud as ☁️ AWS

    rect rgb(219, 234, 254)
        Note over User,Cloud: 🔄 SCAN PHASE
        User->>UI: "scan my environment"
        UI->>MCP: scan_environment
        MCP->>Engine: runSecurityEngine()
        Engine->>Cloud: ListBuckets, ListUsers, ...
        Cloud-->>Engine: Resource snapshots
        Engine-->>MCP: 21 rule evaluations
        MCP->>Engine: computeSecurityScore()
        Engine-->>MCP: Score + Findings
        MCP-->>UI: ScanResult (findings + score)
        UI-->>User: "Found 5 open vulnerabilities"
    end

    rect rgb(254, 243, 199)
        Note over User,Cloud: 📖 EXPLAIN PHASE
        User->>UI: "explain MCPS-S3-001"
        UI->>MCP: describe_finding
        MCP-->>UI: Full details + MITRE/CIS mapping
        UI-->>User: Business impact + attack scenario
    end

    rect rgb(209, 250, 229)
        Note over User,Cloud: 🛠️ REMEDIATION PHASE
        User->>UI: "fix finding MCPS-S3-001"
        UI->>MCP: generate_terraform_fix
        MCP-->>UI: Terraform HCL code
        UI-->>User: Show fix + request approval
        User->>UI: "approve"
        UI->>MCP: execute_remediation
        MCP->>Cloud: putPublicAccessBlock, ...
        Cloud-->>MCP: Success ✅
        MCP-->>UI: RemediationResult
        UI-->>User: "Fix applied, score updated"
    end
```

### Human-in-the-Loop Approval Workflow

```mermaid
sequenceDiagram
    participant User as 👤 Slack User
    participant AI as 🤖 AI Security Analyst
    participant MCP as ⚙️ MCP Server
    participant Cloud as ☁️ AWS

    Note over User,Cloud: 🔍 DISCOVERY
    User->>AI: @Shield scan environment
    AI->>MCP: scan_environment
    MCP-->>AI: Findings + Score
    AI-->>User: 📋 Report with risk summary

    Note over User,Cloud: 📄 FIX PROPOSAL
    User->>AI: @Shield fix MCPS-S3-001
    AI->>MCP: generate_terraform_fix
    MCP-->>AI: Terraform HCL
    AI-->>User: 🏗️ Proposed fix (HCL block)

    Note over User,Cloud: ✅ HUMAN APPROVAL
    User->>AI: @Shield approve
    AI->>MCP: approve_remediation
    MCP-->>AI: Approval ID

    Note over User,Cloud: ⚡ EXECUTION
    AI->>MCP: execute_remediation
    MCP->>Cloud: AWS SDK call
    Cloud-->>MCP: Success
    MCP-->>AI: Remediation result
    AI-->>User: ✅ "Remediation complete — score updated"
```

### Provider Architecture

```mermaid
graph LR
    %% Styling
    classDef core fill:#1e40af,stroke:#1e3a8a,color:#fff,stroke-width:3px
    classDef active fill:#059669,stroke:#047857,color:#fff,stroke-width:2px
    classDef planned fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:2px,stroke-dasharray: 6 4
    classDef sub fill:#d1fae5,stroke:#10b981,color:#064e3b

    Core["🧩 MCPShield Core"] --> AWS["☁️ AWS Provider"]
    Core --> Azure["🔵 Azure Provider"]
    Core --> GCP["🟢 GCP Provider"]
    Core --> K8s["⎈ Kubernetes Provider"]
    
    subgraph Services["AWS Services (Implemented)"]
        direction TB
        A1["📦 S3 Scanner<br/><span style='font-size:9px'>Public access · Encryption · Versioning</span>"]
        A2["👤 IAM Scanner<br/><span style='font-size:9px'>Policies · Keys · Password policy</span>"]
        A3["🖥️ EC2 Scanner<br/><span style='font-size:9px'>Security groups · Open ports</span>"]
        A4["⚡ Lambda / CloudTrail<br/><span style='font-size:9px'>Runtimes · Audit logging</span>"]
        A5["📨 SQS / SNS / DDB / SSM / Secrets<br/><span style='font-size:9px'>Encryption · SecureString · KMS</span>"]
    end

    AWS --> A1
    AWS --> A2
    AWS --> A3
    AWS --> A4
    AWS --> A5

    class Core core
    class AWS active
    class Azure,GCP,K8s planned
    class A1,A2,A3,A4,A5 sub
```

Ships with the **AWS provider** — Azure, GCP, and Kubernetes providers are on the roadmap.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript |
| Package Manager | pnpm workspaces |
| MCP SDK | @modelcontextprotocol/sdk |
| AI Providers | NVIDIA NIM, Gemini, Ollama, OpenAI-compatible |
| Cloud SDK | AWS SDK v3 |
| HTTP | Fastify |
| Validation | Zod |
| Logging | Pino |
| Slack | @slack/bolt (Socket Mode) |
| Testing | Vitest |
| Linting | ESLint + Prettier |

---

## Project Structure

```
mcpshield/
├── apps/
│   ├── agent/           # Slack bot + LLM integration
│   ├── api/             # REST API (dashboard backend)
│   ├── dashboard/       # Web dashboard SPA
│   └── mcp-server/      # MCP tool server
├── packages/
│   ├── aws-tools/       # AWS SDK clients, scanner, remediator
│   ├── security-engine/ # Security rule evaluation (21 rules)
│   ├── finding-engine/  # Finding catalog and registry
│   ├── scoring-engine/  # Security score calculator (0–100, A–F)
│   ├── terraform-generator/  # HCL code generator
│   ├── aws-cli-generator/    # CLI command generator
│   ├── report-generator/     # Executive report generator
│   ├── llm/             # Shared LLM provider adapters
│   ├── types/           # Shared Zod schemas and types
│   ├── shared/          # Utility functions
│   ├── logger/          # Pino logger wrapper
│   └── config/          # Environment config loader
├── docs/                # Documentation
├── labs/                # Workshop labs
├── docker/              # Dockerfiles
└── docker-compose.yml   # Service orchestration
```

---

## Quick Start

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- An AWS-compatible endpoint (see below)

### Setup

```bash
# Clone
git clone https://github.com/akintunero/mcpshield.git
cd mcpshield

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — at minimum set LLM_PROVIDER and your API key
```

### Run

Start the MCP server and API (development mode with hot reload):

```bash
# Terminal 1 — MCP Server (port 7801)
pnpm --filter @mcpshield/mcp-server dev

# Terminal 2 — REST API + Dashboard (port 7802)
pnpm --filter @mcpshield/api dev
```

Or use Docker for all services:

```bash
docker compose up --build
```

### Cloud Endpoint

Configure your AWS endpoint via `.env`:
```
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1
```

---

## Usage (Slack)

```
@Shield scan environment
@Shield show findings
@Shield explain finding MCPS-S3-001:vulnerable-bucket
@Shield generate terraform finding MCPS-S3-001:vulnerable-bucket
@Shield fix finding MCPS-S3-001:vulnerable-bucket
@Shield approve
@Shield rescan
@Shield security score
@Shield generate report
```

Or open the web dashboard at `http://localhost:7802`.

---

## Security Findings (21 Rules)

| Severity | Count | Examples |
|---|---|---|
| Critical | 3 | Public S3 bucket, Admin access on user, Old access keys |
| High | 7 | SSH open to internet, RDP open, Missing encryption, No versioning, CloudTrail disabled, Unencrypted SSM parameter |
| Medium | 8 | Weak password policy, Unused user, Unused keys, No bucket logging, Lambda deprecated runtime, SQS/SNS/DDB/Secrets missing encryption |
| Low | 3 | Missing tags, Poor naming, Missing descriptions |

Every finding includes: Unique ID, Severity, Description, Business Impact, Technical Impact, Attack Scenario, Best Practice, MITRE ATT&CK mapping, CIS mapping, Terraform remediation, AWS CLI remediation, and Risk Score.

---

## Documentation

- [Installation Guide](docs/installation.md)
- [MCP Server Reference](docs/mcp.md)
- [AI Agent Guide](docs/agent.md)
- [Security Engine](docs/security-engine.md)
- [Finding Engine](docs/finding-engine.md)
- [Slack Integration](docs/slack.md)
- [Roadmap](docs/roadmap.md)

## Contributing

Contributions welcome! See the [Roadmap](docs/roadmap.md) for planned features. Please open an issue first to discuss changes.

## License

MIT — see [LICENSE](LICENSE)


