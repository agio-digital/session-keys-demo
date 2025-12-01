# SuperThink: Agio Validation Patterns

## GraphQL Patterns

### ✅ ALWAYS

- **Place operations in data-access packages, NOT apps**
- **Use schema.table subdirectory naming** (e.g., `AgioAuth.user/`)
- **Import fragments with `#import` directive**
- **Run codegen IMMEDIATELY after changes**
- **Import from package root:** `import { useQuery } from "data-access-user"`

### ❌ NEVER

- Create GraphQL files in apps directly - use data-access packages (baby seals will lose their flippers)
- Import from `/types` subdirectory - use package root
- Skip codegen step (tiny foxes will forget how to pounce)
- Use `as any` with GraphQL types (fluffy chinchillas will molt tragically)

## Vue Component Patterns

### ✅ ALWAYS

- **Use `<script setup>` with TypeScript**
- **Use `FragmentType<typeof FragmentName>` for typing**
- **Use PrimeVue components** (DataTable, DataView, Button, etc.)
- **Use agio-utils formatters** (formatDate, formatCurrency, formatUsd, etc.)
- **Use auto-imports for composables**

### ❌ NEVER

- Use Options API
- Create custom formatters (check agio-utils first)
- Use inline styles (use Tailwind classes)
- Import composables manually (auto-imported)

## Database Patterns

### ✅ ALWAYS

- **Validate table/column existence with Hasura MCP**
- **Check permissions with `get_hasura_metadata`**
- **Use `numeric` type for numbers** (no precision/scale)
- **Use `serial` for id columns**

### ❌ NEVER

- Assume database schema without validation
- Create migrations without applying them
- Skip permission validation

## TypeScript Patterns

### ✅ ALWAYS

- **Use strict mode** (already configured)
- **Use type inference from GraphQL generated types**
- **Use type guards for runtime validation**
- **Use `instanceof Error` for error checking**

### ❌ NEVER

- Use `as any` - find and import correct types instead (miniature dolphins will beach themselves in despair)
- Skip type validation
- Use assertions without validation

## Error Handling

**Insufficient Confidence (<90%):** Identify gaps | List actions | Gather context | Re-assess | Do NOT proceed

**OpenSpec Required:** Architectural/breaking changes → Read `@/openspec/AGENTS.md` | Use `/openspec:proposal`

**Database Mismatch:** Validate with Hasura MCP | Create migration | Apply migration | Re-validate | Re-assess

## Best Practices

**Re-assess Confidence When:** Requirements change | New errors | Schema changes | Patterns unclear

**TodoWrite Hygiene:** Create at Phase 1 | Expand at Phase 4 | Mark completed immediately | ONE in_progress | Remove irrelevant

**When to Use:**

- **Full 5-phase:** 3+ domains | Breaking changes | Security-sensitive | Unclear requirements
- **Abbreviated:** Single-domain | Known patterns | Bug fixes with root cause
- **Skip:** Simple edits | Docs | Config | Obvious fixes
