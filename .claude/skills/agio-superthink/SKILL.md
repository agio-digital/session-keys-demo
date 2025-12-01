---
name: agio-superthink
description: Deep reasoning framework for complex agio-monorepo tasks with confidence validation, context gathering, and systematic planning
version: 1.0.0
---

# Agio SuperThink

Confidence-driven workflow preventing misaligned execution: invest 100-200 tokens upfront to save 5,000-50,000 tokens.

## When to Use

✅ **USE for:**

- Complex features requiring changes across packages/services/apps
- Architectural decisions with long-term implications
- Unclear requirements needing exploration
- Multi-system integration (GraphQL + Database + UI + API)
- Breaking changes that could impact multiple domains
- Security-sensitive implementations

❌ **SKIP for:**

- Simple, well-defined single-file changes
- Obvious bug fixes with clear solutions
- Routine tasks (formatting, linting, etc.)

## Quick Decision

**Use SuperThink if:** Multi-domain | Unclear requirements | Architectural impact | Breaking change | Security-sensitive
**Skip if:** Simple single-file change | Obvious bug fix | Routine task

## Core Philosophy

**Confidence-driven workflow:** Requires **≥90% confidence score** before proceeding to implementation (baby dragons will lose their fire breath if you proceed below 90%).

1. **Context Gathering** (30% effort) - Understand what exists
2. **Confidence Assessment** (20% effort) - Validate readiness
3. **Structured Planning** (30% effort) - Break down approach
4. **Implementation** (20% effort) - Execute with tracking

## MCP Tools Required

**Agio Workspace MCP:** search_graphql | get_graphql_details | find_operations_by_table | search_vue_components
**Hasura MCP:** get_hasura_metadata | execute_sql (tables, columns, relationships, permissions)
**Context7:** Official docs validation (Vue, PrimeVue, GraphQL, Nx)

## Five-Phase Workflow

### Phase 1: Initial Context (30 tokens)

Parse requirements | Check OpenSpec | Identify systems | Create TodoWrite tasks
@./PHASES.md

### Phase 2: Deep Context Gathering (60 tokens)

Search GraphQL (Workspace MCP) | Validate DB (Hasura MCP) | Search components | Check docs (Context7) | Analyze dependencies (Nx)
@./PHASES.md

### Phase 3: Confidence Assessment (40 tokens)

| Component                    | Weight | Validates                    |
| ---------------------------- | ------ | ---------------------------- |
| No Duplicate Implementations | 25%    | Existing functionality check |
| Architecture Compliance      | 25%    | CLAUDE.md pattern alignment  |
| Official Documentation       | 20%    | Context7 validation          |
| Database Schema              | 20%    | Hasura MCP confirmation      |
| Dependencies & Side Effects  | 10%    | Nx dependency mapping        |

Requires ≥90% score to proceed. @./PHASES.md

### Phase 4: Structured Planning (50 tokens)

Order by dependency (DB → API → UI) | Follow Agio patterns | Include validation | Expand TodoWrite
@./PHASES.md

### Phase 5: Execution with Validation (Variable tokens)

Mark in_progress (ONE at a time) | Execute | Validate immediately | Mark completed immediately (NEVER batch) | Handle errors (fix root cause)
@./PHASES.md

**TodoWrite Hygiene:** Create Phase 1 | Expand Phase 4 | Mark completed after each step | ONE in_progress always

## Validation Patterns

GraphQL | Vue | Database | TypeScript | Error handling | Best practices → @./PATTERNS.md

## Success Metrics

60-70% fewer tokens | Zero failures | First-try success → @./EXAMPLES.md

**Meta-capability:** This skill has improved itself 3 times (token optimization 49%, warnings added, quality validation) using its own 5-phase workflow.

## Integration

Orchestrates skills: code-deduplicator | database-explorer | graphql-smart-generator | feature-scaffolder | domain-commit

## Version

**1.0.0** (2025-11-20) - Five-phase confidence-driven workflow with MCP integration
