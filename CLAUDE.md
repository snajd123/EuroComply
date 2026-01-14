# Claude Code Instructions for EuroComply

> This file contains Claude-specific workflow instructions. For development standards, see [RULES.md](./RULES.md).

---

## Required Workflow

When working with Claude Code on this project, follow these principles:

### 1. Ask Permission Before Code Changes
- Do NOT write, edit, or delete any code without explicit user approval
- Always describe what you plan to change and wait for confirmation
- Show the planned changes before implementing

### 2. Plan Before Implementation
- Discuss and agree on the approach before writing any code
- Break down tasks into small, reviewable increments
- Present the plan and get approval before proceeding

### 3. Small Increments Only
- Make one small change at a time
- Wait for user review between changes
- Do not batch multiple changes together without permission

### 4. Communication
- Explain what you're about to do before doing it
- Ask clarifying questions if requirements are unclear
- Never assume - always confirm

---

## Development Standards

All development work must follow the standards defined in **[RULES.md](./RULES.md)**, including:

- **Test-Driven Development (TDD)** - Write tests before implementation
- **Git Commit Standards** - Conventional commits, atomic changes
- **Code Quality** - TypeScript strict mode, explicit error handling
- **Security Rules** - Never commit secrets, validate all inputs
- **API Design** - Standard response format, proper status codes
- **Documentation** - Update docs after every implementation

See [RULES.md](./RULES.md) for complete details.

---

## Quick Reference

```
┌─────────────────────────────────────────────────────┐
│              CLAUDE WORKFLOW CHECKLIST              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  BEFORE MAKING CHANGES:                             │
│  □ Explain what you plan to do                      │
│  □ Wait for user approval                           │
│  □ Confirm understanding of requirements            │
│                                                     │
│  WHEN WRITING CODE:                                 │
│  □ Follow TDD (test first)                          │
│  □ Make small, atomic changes                       │
│  □ Follow RULES.md standards                        │
│                                                     │
│  BEFORE COMMITTING:                                 │
│  □ All tests pass                                   │
│  □ No TypeScript/lint errors                        │
│  □ Documentation updated                            │
│  □ Commit message follows format                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [RULES.md](./RULES.md) - Development standards (TDD, commits, security)
- [README.md](./README.md) - Project overview and architecture
- [docs/](./docs/) - Detailed documentation

---

*Last Updated: 2026-01-14*
