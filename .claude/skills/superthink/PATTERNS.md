# SuperThink: Validation Patterns

## TypeScript Patterns

### ✅ ALWAYS
- Use strict mode
- Use type inference where possible
- Use type guards for runtime validation
- Use `instanceof Error` for error checking
- Run `yarn typecheck` after code changes
- Run `yarn lint` before committing

### ❌ NEVER
- Use `as any` - find and import correct types instead
- Skip type validation
- Use assertions without validation

## Code Patterns

### ✅ ALWAYS
- Follow existing patterns in codebase
- Use existing utilities before creating new ones
- Use `<script setup>` with TypeScript for Vue components

### ❌ NEVER
- Create duplicates of existing functionality
- Ignore existing conventions
- Skip validation steps

## Error Handling

**Insufficient Confidence (<90%):** Identify gaps | List actions | Gather context | Re-assess | Do NOT proceed

**Validation Failures:** Keep task in_progress | Fix root cause | Re-validate | Then mark completed

## Best Practices

**Re-assess Confidence When:**
- Requirements change
- New errors appear
- Schema/API changes
- Patterns unclear

**TodoWrite Hygiene:**
- Create at Phase 1
- Expand at Phase 4
- Mark completed immediately
- ONE in_progress at a time
- Remove irrelevant tasks

**When to Use SuperThink:**
- **Full 5-phase:** Multiple systems | Breaking changes | Security-sensitive | Unclear requirements
- **Abbreviated:** Single system | Known patterns | Bug fixes with clear root cause
- **Skip:** Simple edits | Docs | Config | Obvious fixes
