### 🔄 Project Awareness & Context
- **Always read `PLANNING.md`** at the start of a new conversation to understand the project's architecture, goals, style, and constraints.
- **Check `TASK.md`** before starting a new task. If the task isn’t listed, add it with a brief description and today's date.
- **Use consistent naming, directory structure, and logic patterns based on the current DiscoFryBot layout.**

### 🧱 Code Structure & Modularity
- **Never create a file longer than 500 lines of code.** If a file approaches this limit, refactor by splitting it into modules or helper files.
- **Organize code into clearly separated modules**, grouped by feature or responsibility.
- **Use clear, consistent imports** (prefer relative imports within packages).

### 🧪 Testing & Reliability
- **Test each new function manually or via test scripts** right after implementation.
- Focus on:
  - One expected use case
  - One edge case
  - One failure scenario (e.g. bad input, missing env, API error)
- Log all test results with `logger.js`, not `console.log`.

---

### ✅ Task Tracking/Completion
- When you finish a task, **mark it in `TASK.md` immediately**.
- If new issues or improvements come up, log them under a “Discovered During Work” section.
- Keep `TASK.md` as the live source of what’s next.

### 📎 Style & Conventions
- **Use JavaScript or TypeScript depending on the file.** Node logic is JS, dashboard is TS.
- **Use consistent naming:**
    - `camelCase` for variables/functions
    - `PascalCase` for components.
- **Log everything through logger.js — no console.log in production scripts.**


### 📚 Documentation & Explainability
- **Update `README.md` or script-level comments** when new features are added or changed.
- For complex logic, leave inline `// Reason:` comments to explain the “why.”
- If a file/script is hard to understand, add a short usage note at the top.

### 🧠 AI Behavior Rules
- **Never assume missing context. Ask questions if uncertain.**
- **Never hallucinate environment variables, functions, APIs or filenames** – only use what exists in this repo.
- **Always confirm file/module existence** exist before referencing them in code or tests.
- **Never delete or overwrite existing code** unless explicitly instructed to or if part of a task from `TASK.md`.

---

This document can be updated anytime. Think of it as the rulebook for working efficiently with Cline on this project.



