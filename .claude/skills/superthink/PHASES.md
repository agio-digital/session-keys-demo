# SuperThink: Five-Phase Workflow Details

## Phase 1: Initial Context Gathering (30 tokens)

**TodoWrite Setup:**
```typescript
[
  { content: "Understand task requirements", status: "in_progress", activeForm: "Understanding..." },
  { content: "Gather context from codebase", status: "pending", activeForm: "Gathering..." },
  { content: "Assess confidence level", status: "pending", activeForm: "Assessing..." }
]
```

**Actions:**
1. Parse requirements: what, where, technologies involved
2. Identify systems: files, modules, APIs, packages affected
3. Note architectural implications

## Phase 2: Deep Context Gathering (60 tokens)

**Tools:**
- `Grep({ pattern, path, type })` - Search for code patterns
- `Glob({ pattern })` - Find files by name
- `Read({ file_path })` - Read file contents
- `WebFetch/WebSearch` - Check external documentation

**What to Validate:**
- Existing implementations (avoid duplicates)
- Current patterns in codebase
- API/library documentation
- Type definitions and schemas

## Phase 3: Confidence Assessment (40 tokens)

Score ≥90% required across 5 weighted criteria:

| Component           | Weight | Pass (1.0)    | Partial (0.5)       | Fail (0.0)        |
| ------------------- | ------ | ------------- | ------------------- | ----------------- |
| **No Duplicates**   | 25%    | Doesn't exist | Similar, incomplete | Duplicate exists  |
| **Architecture**    | 25%    | Compliant     | Mostly compliant    | Violates patterns |
| **Documentation**   | 20%    | Verified      | Partially verified  | No verification   |
| **Data Model**      | 20%    | Confirmed     | Partial validation  | No validation     |
| **Dependencies**    | 10%    | All mapped    | Most known          | Unclear           |

**Example:**
```
Component                        Weight    Score    Weighted
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. No Duplicate Implementations   25%       1.0      0.250
2. Architecture Compliance        25%       1.0      0.250
3. Documentation Verified         20%       1.0      0.200
4. Data Model Understood          20%       1.0      0.200
5. Dependencies Mapped            10%       1.0      0.100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 100% ✅ PROCEED
```

**If < 90%:** Identify gaps → Take actions → Re-assess → Do NOT proceed until ≥90%

## Phase 4: Structured Planning (50 tokens)

**TodoWrite Expansion:**
```typescript
[
  // Phases 1-3 completed
  { content: "Implement core feature", status: "pending", activeForm: "Implementing..." },
  { content: "Add integration", status: "pending", activeForm: "Adding..." },
  { content: "Run validation", status: "pending", activeForm: "Running..." }
]
```

**Planning Order:**
1. Dependencies first (types, utilities, shared code)
2. Core implementation
3. Integration points
4. Validation (typecheck, lint, tests)

## Phase 5: Execution with Validation (Variable tokens)

**Protocol:**
1. Mark in_progress (ONE at a time)
2. Execute (Edit/Write/Bash)
3. Validate (typecheck, lint, test as appropriate)
4. Mark completed (immediately, NEVER batch)
5. Handle errors (keep in_progress, fix root cause)

**Checkpoints:**
- After code changes: typecheck passes
- After API changes: tests pass
- Final: all checks pass
