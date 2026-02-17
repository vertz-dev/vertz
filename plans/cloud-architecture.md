# Vertz Cloud Architecture — Design Document

> **Status:** Draft  
> **Author:** Riley (Cloud/Infra Expert)  
> **Date:** 2026-02-16  
> **Last updated:** 2026-02-16

> **Decisions (2026-02-16):**
> - AWS ECS Fargate for compute, Cloudflare for edge/CDN/DNS
> - Provider abstraction layer enables AWS → GCP → bare-metal migration
> - LLM-native design: every resource has machine-readable metadata for AI tool discovery
> - CloudFormation as IaC (not Terraform) for tighter AWS integration

---

## 1. Vision

Vertz Cloud provides zero-config deployment where the framework automatically provisions infrastructure. Developers run `vertz deploy` and Vertz handles:

- Container orchestration (ECS Fargate)
- Database provisioning (RDS Postgres)
- Edge networking (Cloudflare)
- Auth management (hybrid JWT + server-side revocation)
- LLM service proxying (OpenAI/Anthropic)

**Core conviction:** Infrastructure should be invisible to developers. The same `domain()` definition that works locally should deploy to cloud with zero changes.

**Design principle:** LLM-native means every resource is self-describing. AI agents can discover, query, and manage cloud resources without hardcoded knowledge.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Machine                         │
│                                                                 │
│   vertz deploy                                                  │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              @vertz/cloud CLI                           │   │
│   │   • Reads domain definitions                             │   │
│   │   • Generates CloudFormation                             │   │
│   │   • Uploads artifacts to S3                              │   │
│   │   • Streams deploy progress                              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    HTTPS (authenticated)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                             │
│   • DNS management                                             │
│   • WAF + DDoS protection                                       │
│   • CDN for static assets                                       │
│   • Access (Zero Trust) for auth                                │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Cloud (us-east-1)                        │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    VPC (10.0.0.0/16)                     │   │
│   │                                                          │   │
│   │   ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │   │
│   │   │  ECS Fargate │    │  RDS Postgres│    │   ElastiCache │  │   │
│   │   │  (API Server)│    │  (Primary)    │    │   (Redis)    │  │   │
│   │   │              │    │              │    │              │  │   │
│   │   │  Task: api   │    │  db.vertz    │    │  session    │  │   │
│   │   │  Task: worker│    │              │    │  cache      │  │   │
│   │   │  Task: cron  │    │  (Multi-AZ)  │    │  (Multi-AZ) │  │   │
│   │   └─────────────┘    └─────────────┘    └────────────┘  │   │
│   │                                                          │   │
│   │   ┌─────────────────────────────────────────────────┐   │   │
│   │   │              ALB (Application Load Balancer)     │   │   │
│   │   └─────────────────────────────────────────────────┘   │   │
│   │                         │                                │   │
│   └─────────────────────────┼────────────────────────────────┘   │
│                             │                                     │
│   ┌─────────────────────────┴────────────────────────────────┐   │
│   │                      S3 (Artifacts)                       │   │
│   │   • deployment-artifacts/                                 │   │
│   │   • cloudformation-templates/                             │   │
│   └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│   │  OpenAI      │    │  Anthropic   │    │  SendGrid    │    │
│   │  (LLM Proxy) │    │  (LLM Proxy) │    │  (Email)     │    │
│   └──────────────┘    └──────────────┘    └──────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Provider Abstraction

### 3.1 The Provider Interface

Every cloud provider implements a common interface. This enables future migration from AWS to GCP or bare metal without code changes.

```typescript
// Provider interface (conceptual - no code in design doc)
interface CloudProvider {
  // Compute
  deployService(name: string, config: ServiceConfig): Promise<DeploymentResult>;
  scaleService(name: string, replicas: number): Promise<void>;
  getServiceStatus(name: string): Promise<ServiceStatus>;

  // Database
  provisionDatabase(config: DatabaseConfig): Promise<DatabaseEndpoint>;
  backupDatabase(name: string): Promise<BackupRef>;

  // Networking
  createDNSRecord(domain: string, target: string): Promise<void>;
  configureWAF(rules: WAFRule[]): Promise<void>;

  // Secrets
  storeSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string>;

  // Metadata (for LLM tool discovery)
  listResources(): Promise<Resource[]>;
  getResourceSchema(id: string): Promise<ResourceSchema>;
}
```

### 3.2 AWS Implementation

AWS uses CloudFormation for all resource provisioning. This provides:

- **Idempotency:** Same template = same resources
- **Drift detection:** CloudFormation detects manual changes
- **Rollback:** Automatic rollback on failure
- **Audit trail:** Every change logged in CloudTrail

#### CloudFormation Stack Structure

| Stack | Purpose | Resources |
|-------|---------|-----------|
| `vertz-network` | VPC, subnets, security groups | VPC, Subnets, NACLs, Security Groups |
| `vertz-database` | RDS Postgres | DBInstance, DBSubnetGroup, DBParameterGroup |
| `vertz-cache` | ElastiCache Redis | ReplicationGroup, CacheSubnetGroup |
| `vertz-compute` | ECS Fargate | Cluster, TaskDefinition, Service |
| `vertz-edge` | CloudFront, Route53 | HostedZone, RecordSet |
| `vertz-secrets` | Secrets Manager | Secret |

### 3.3 LLM-Native Resource Discovery

Every resource exposes machine-readable metadata. This enables AI agents to:

- Discover available tools automatically
- Query resource state without documentation
- Execute operations through a consistent interface

```json
{
  "resource": "vertz-api-service",
  "type": "ecs-service",
  "provider": "aws",
  "region": "us-east-1",
  "endpoints": [
    {
      "path": "/api/{proxy+}",
      "method": "ANY",
      "target": "alb:vertz-api"
    }
  ],
  "metrics": {
    "cpu utilization": "cloudwatch:CPUUtilization",
    "memory utilization": "cloudwatch:MemoryUtilization",
    "request count": "alb:RequestCount"
  },
  "operations": {
    "scale": "aws:ecs:update-service --cluster {cluster} --service {name} --desired-count {count}",
    "logs": "aws:logs:get-log-events --log-group /aws/ecs/vertz/api",
    "restart": "aws:ecs:update-service --force-new-deployment"
  },
  "aiToolManifest": "/.well-known/ai-tools.json"
}
```

---

## 4. AWS + CloudFormation Details

### 4.1 Network Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        Internet                                 │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Cloudflare     │
                    │   (DNS + WAF)    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   AWS ALB         │
                    │   (HTTPS only)    │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│  Public Subnet│    │Private Subnet │    │Private Subnet │
│   (az1)       │    │   (az1)       │    │   (az2)       │
│               │    │               │    │               │
│  • ALB node   │    │  • ECS Tasks  │    │  • ECS Tasks  │
│               │    │  • Bastion     │    │               │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
                            │                     │
                    ┌───────▼───────┐    ┌───────▼───────┐
                    │  RDS Primary  │    │  RDS Read     │
                    │  (az1)        │    │  Replica(az2) │
                    └───────────────┘    └───────────────┘
```

### 4.2 ECS Task Definitions

| Task | Purpose | Memory | CPU | Scaling |
|------|---------|--------|-----|---------|
| `api` | HTTP API server | 512 MB | 256 unit | CPU > 70% → scale |
| `worker` | Background jobs | 1024 MB | 512 unit | Queue depth → scale |
| `cron` | Scheduled tasks | 256 MB | 128 unit | Scheduled |

### 4.3 Security Groups

| Group | Inbound | Outbound |
|-------|---------|----------|
| `alb-to-api` | ALB → API (HTTP) | - |
| `api-to-db` | API → Postgres (5432) | - |
| `api-to-cache` | API → Redis (6379) | - |
| `api-to-internet` | - | HTTPS to external APIs |

### 4.4 CloudFormation Template Organization

```
cloudformation/
├── base/
│   ├── network.yaml        # VPC, subnets, gateways
│   └── security.yaml       # Security groups, IAM roles
├── services/
│   ├── ecs-cluster.yaml    # ECS cluster config
│   ├── api-service.yaml    # API task definition
│   └── worker-service.yaml # Worker task definition
├── data/
│   ├── database.yaml       # RDS Postgres
│   └── cache.yaml          # ElastiCache Redis
└── edge/
    ├── alb.yaml            # Application Load Balancer
    └── waf.yaml            # WAF rules
```

---

## 5. Auth Integration

### 5.1 Cloud Auth Model

Vertz Cloud uses **hybrid sessions** that combine:

- **JWT tokens:** Stateless, stored client-side
- **Server-side revocation:** Stored in Redis, enables immediate logout

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authentication Flow                          │
│                                                                  │
│   Client                                                         │
│     │                                                            │
│     │ 1. POST /auth/login {email, password}                     │
│     ▼                                                            │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                     API Server                             │  │
│   │   • Validate credentials against DB                       │  │
│   │   • Generate JWT (access_token)                           │  │
│   │   • Store session in Redis (for revocation)               │  │
│   │   • Return {access_token, refresh_token}                  │  │
│   └──────────────────────────────────────────────────────────┘  │
│     │                                                            │
│     │ {access_token, refresh_token}                            │
│     ▼                                                            │
│   Client                                                         │
│     │                                                            │
│     │ 2. GET /api/users (Authorization: Bearer {access_token}) │
│     ▼                                                            │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                     API Server                             │  │
│   │   • Verify JWT signature                                   │  │
│   │   • Check session not revoked in Redis                    │  │
│   │   • Attach user context to request                        │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Token Strategy

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| `access_token` | 15 min | Memory (JS) | API requests |
| `refresh_token` | 7 days | HttpOnly cookie | Token refresh |

### 5.3 Zero-Config Auth

When deploying to Vertz Cloud:

```typescript
// Developer code - same for local and cloud
const { auth } = createVertz({
  domains: [User, Post, Organization],
})
```

The cloud provider automatically:

1. Provisions managed email service (SendGrid)
2. Configures password reset flow
3. Sets up session storage (Redis)
4. Enables MFA enforcement (optional)

### 5.4 Multi-Tenant Isolation

Vertz Cloud enforces tenant isolation at the database level:

```sql
-- Every table has tenant_id
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  -- ... other fields
);

-- Row-level security policy
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## 6. LLM Service Proxy

### 6.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Developer Application                         │
│                                                                  │
│   import { createLLM } from '@vertz/cloud'                      │
│                                                                  │
│   const llm = createLLM({                                       │
│     provider: 'openai',  // or 'anthropic'                      │
│     model: 'gpt-4o',                                               │
│   })                                                             │
│                                                                  │
│   const response = await llm.chat({                              │
│     messages: [{role: 'user', content: 'Hello!'}]               │
│   })                                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Proxy Service                             │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Request Validation                                      │   │
│   │  • API key validation                                    │   │
│   │  • Rate limiting                                         │   │
│   │  • Usage tracking                                        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Provider Routing                                        │   │
│   │  • openai → api.openai.com                               │   │
│   │  • anthropic → api.anthropic.com                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│                              ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Response Processing                                     │   │
│   │  • Token counting                                        │   │
│   │  • Cost calculation                                      │   │
│   │  • Logging                                                │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External LLM Providers                        │
│                                                                  │
│   ┌──────────────────┐         ┌──────────────────┐            │
│   │    OpenAI        │         │   Anthropic      │            │
│   │  api.openai.com  │         │ api.anthropic.com│            │
│   └──────────────────┘         └──────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Provider Abstraction

The LLM proxy normalizes different provider APIs into a common interface:

```typescript
// Unified interface - same code works with any provider
interface LLMProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse>;
  
  // Metadata for tool discovery
  getModels(): Model[];
  getPricing(): Pricing;
}

// Implementations
class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }
```

### 6.3 AI Tool Manifest

Every Vertz Cloud deployment exposes its capabilities via `/.well-known/ai-tools.json`:

```json
{
  "version": "1.0",
  "tools": [
    {
      "name": "vertz_list_users",
      "description": "List all users in the current tenant",
      "parameters": {
        "type": "object",
        "properties": {
          "limit": {"type": "number", "default": 50},
          "offset": {"type": "number", "default": 0}
        }
      }
    },
    {
      "name": "vertz_create_user",
      "description": "Create a new user in the current tenant",
      "parameters": {
        "type": "object",
        "properties": {
          "email": {"type": "string", "format": "email"},
          "name": {"type": "string"}
        },
        "required": ["email", "name"]
      }
    },
    {
      "name": "vertz_llm_chat",
      "description": "Chat with the configured LLM",
      "parameters": {
        "type": "object",
        "properties": {
          "message": {"type": "string"},
          "system": {"type": "string"}
        },
        "required": ["message"]
      }
    }
  ]
}
```

### 6.4 Rate Limiting & Cost Control

| Tier | Requests/min | Monthly Budget | Features |
|------|--------------|----------------|----------|
| Free | 10 | $0 | 1K tokens/day |
| Pro | 60 | $50/mo | 100K tokens/mo |
| Team | 120 | $200/mo | Unlimited |

---

## 7. Deployment Flow

### 7.1 Developer Experience

```bash
# Deploy to Vertz Cloud
$ vertz deploy

  ✓ Analyzing domains...
  ✓ Generating CloudFormation...
  ✓ Uploading artifacts (23MB)...
  ✓ Creating stack "vertz-prod-12345"...
  ✓ Waiting for deployment...
  
  ✓ Deployed! https://app.vertz.cloud/abc123
  
  AI Tools available at: https://app.vertz.cloud/.well-known/ai-tools.json
```

### 7.2 What Happens Under the Hood

1. **Analysis Phase**
   - Parse all `*.domain.ts` files
   - Extract database requirements
   - Identify required secrets

2. **Template Generation**
   - Generate CloudFormation for each stack
   - Compute required instance sizes
   - Configure auto-scaling rules

3. **Artifact Build**
   - Bundle application as Docker image
   - Upload to ECR
   - Store CloudFormation templates in S3

4. **Deployment**
   - Create/update CloudFormation stacks
   - Wait for resources to stabilize
   - Run database migrations
   - Configure DNS

5. **Verification**
   - Health check all endpoints
   - Verify database connectivity
   - Test auth flow

---

## 8. LLM-Native Design Principles

### 8.1 Self-Describing Infrastructure

Every resource exposes:

- **Schema:** JSON Schema for all configurations
- **State:** Current resource state in machine-readable format
- **Operations:** Available actions with parameter schemas
- **Relationships:** Dependencies and connections to other resources

### 8.2 Tool-Based Interfaces

AI agents interact through tools, not raw API calls:

```typescript
// AI agent can call these tools directly
const tools = {
  // Infrastructure
  deploy: (config: DeployConfig) => Promise<DeploymentResult>,
  scale: (service: string, replicas: number) => Promise<void>,
  getLogs: (service: string, since: Date) => Promise<LogEntry[]>,
  
  // Application
  createUser: (data: CreateUserInput) => Promise<User>,
  queryData: (query: string) => Promise<any>,
  invokeAction: (domain: string, action: string, params: any) => Promise<any>,
  
  // LLM
  chat: (message: string, context?: Record<string, any>) => Promise<string>,
}
```

### 8.3 Intent-Based Configuration

AI agents describe **intent**, not implementation:

```yaml
# Instead of:
Instances:
  - InstanceType: t3.medium
    MinSize: 2
    MaxSize: 10

# Write:
Scaling:
  goal: "Handle traffic peaks automatically"
  metrics:
    - cpu > 70% → scale up
    - cpu < 30% → scale down
```

---

## 9. Cost Estimation

### Monthly Costs (MVP - 1000 users)

| Service | Configuration | Monthly Cost |
|---------|---------------|---------------|
| ECS Fargate | 2 tasks, 0.5 vCPU, 1GB each | ~$30 |
| RDS Postgres | db.t3.micro, single-AZ | ~$35 |
| ElastiCache | cache.t3.micro | ~$35 |
| ALB | Standard | ~$25 |
| Cloudflare | Pro | $20 |
| ECR | Storage + transfer | ~$5 |
| Route53 | Hosted zone | $0.50 |
| Data transfer | ~100GB | ~$10 |
| **Total** | | **~$160** |

### Scaling Costs

| Users | Monthly Cost |
|-------|--------------|
| 1,000 | ~$160 |
| 10,000 | ~$400 |
| 100,000 | ~$1,500 |

---

## 10. Future Considerations

### Multi-Region
- Add read replicas in additional regions
- Configure CloudFront for geo-routing

### Bare Metal
- When revenue justifies, migrate to dedicated servers
- Provider abstraction makes this transparent to developers

### GPU Support
- For custom ML workloads, provision GPU instances
- Keep LLM proxy external (OpenAI/Anthropic) for v1
