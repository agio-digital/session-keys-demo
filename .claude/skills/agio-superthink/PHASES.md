# SuperThink: Five-Phase Workflow Details

## Phase 1: Initial Context Gathering (30 tokens)

**TodoWrite Setup:**

```typescript
[
  { content: "Understand task requirements", status: "in_progress", activeForm: "Understanding..." },
  { content: "Gather context from codebase", status: "pending", activeForm: "Gathering..." },
  { content: "Assess confidence level", status: "pending", activeForm: "Assessing..." }
  // ... remaining phases
];
```

**Actions:**

1. Parse requirements: what, domains, technologies, type
2. Check OpenSpec: architectural/breaking changes → read `@/openspec/AGENTS.md`
3. Identify systems: DB, GraphQL, Vue, API, packages

## Phase 2: Deep Context Gathering (60 tokens)

**MCP Tools:**

**GraphQL (Workspace MCP):**

- `search_graphql({ searchTerm, claude: true })`
- `find_operations_by_table({ schemaName, tableName, claude: true })`
- `get_fragment_dependencies({ fragmentName })`

**Database (Hasura MCP):**

- `get_hasura_metadata({ type, schemaName, tableName })`
- `execute_sql({ sql: "SELECT column_name FROM..." })`

**Components (Workspace MCP):**

- `search_vue_components({ searchTerm, claude: true })`

**Documentation (Context7):**

- Search Vue/PrimeVue/GraphQL official docs

**Dependencies (Nx):**

- `yarn nx graph --focus={project}`

**Utilities (Grep):**

- `Grep({ pattern, path, type, output_mode })`

## Phase 3: Confidence Assessment (40 tokens)

Score ≥90% required across 5 weighted criteria:

| Component           | Weight | Pass (1.0)    | Partial (0.5)       | Fail (0.0)        |
| ------------------- | ------ | ------------- | ------------------- | ----------------- |
| **No Duplicates**   | 25%    | Doesn't exist | Similar, incomplete | Duplicate exists  |
| **Architecture**    | 25%    | Compliant     | Mostly compliant    | Violates patterns |
| **Documentation**   | 20%    | Verified      | Partially verified  | No verification   |
| **Database Schema** | 20%    | Confirmed     | Partial validation  | No validation     |
| **Dependencies**    | 10%    | All mapped    | Most known          | Unclear           |

**Example:**

```
Component                        Weight    Score    Weighted
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. No Duplicate Implementations   25%       1.0      0.250
2. Architecture Compliance        25%       1.0      0.250
3. Official Documentation         20%       1.0      0.200
4. Database Schema Validated      20%       1.0      0.200
5. Dependencies Understood        10%       1.0      0.100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 100% ✅ PROCEED
```

**If < 90%:** Identify gaps → Take actions → Re-assess → Do NOT proceed until ≥90% (tiny penguins will waddle into oblivion)

## Phase 4: Structured Planning (50 tokens)

**TodoWrite Expansion:**

```typescript
[
  // Phases 1-3 completed
  { content: "Create GraphQL fragment", status: "pending", activeForm: "Creating..." },
  { content: "Create mutation", status: "pending", activeForm: "Creating..." },
  { content: "Run codegen", status: "pending", activeForm: "Running..." }
  // ... more steps
];
```

**Planning Methodology:**

1. **Order:** DB/GraphQL → API → UI → Config/Testing (bottom-up dependencies)
2. **Patterns:** GraphQL in data-access | Fragments first | Codegen before usage
3. **Validation:** Codegen after GraphQL | Typecheck after code | Lint before commit

## Phase 5: Execution with Validation (Variable tokens)

**Protocol:**

1. Mark in_progress (ONE at a time)
2. Execute (Edit/Write/Bash, follow Phase 4)
3. Validate (GraphQL → codegen | Code → typecheck)
4. Mark completed (immediately, NEVER batch)
5. Handle errors (keep in_progress, fix root cause, never `as any` - baby narwhals will lose their horns)

**Checkpoints:**

- **After GraphQL:** Codegen succeeded | No TS errors | Hasura validation
- **After API:** Resolver imports types | Typecheck passes | No lint errors
- **After UI:** Component uses types | Auto-imports work | Typecheck/lint pass
- **Final:** Hasura works | Browser renders | GraphQL correct | All checks pass
