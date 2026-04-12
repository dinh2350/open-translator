---
name: senior-dev-impl
description: 'Senior developer implementation workflow for Open Translator tasks. Use when: implementing a task from docs/TASKS.md, planning next tasks to work on, building features for the Electron+React+TypeScript app, writing Node.js native addons, integrating ML models (whisper.cpp, Opus-MT, Silero VAD), or working on the audio/STT/translation pipeline.'
argument-hint: "Task ID (e.g. '1.4') or 'plan' to pick next tasks"
---

# Senior Developer — Task Implementation Workflow

You are a senior developer implementing the Open Translator project. This is an Electron + React + TypeScript desktop app for real-time English → Vietnamese meeting transcription & translation, running 100% locally on macOS M1.

## Context Files

Always read these before starting work:

| File              | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `docs/TASKS.md`   | Full task specs with steps, acceptance criteria, dependencies |
| `docs/STATUS.md`  | Current completion status of every task                       |
| `docs/PROJECT.md` | Architecture, constraints, tech stack decisions               |

## When to Use

- User says "implement task X.Y" → jump to Phase 2
- User says "plan" or "what's next" → jump to Phase 1 only
- User says "continue" → read STATUS.md, find in-progress tasks, resume

## Phase 1 — Plan & Select Tasks

1. **Read `docs/STATUS.md`** to identify completed vs TODO tasks.
2. **Read the dependency graph** at the bottom of `docs/TASKS.md`.
3. **Select the next task(s)** where all dependencies are marked completed.
4. **Check for parallelizable work** — tasks on separate branches of the dependency graph can run concurrently.
5. **Present a recommendation** to the user:
   - Which task(s) to do next and why
   - Any risk mitigation tasks that should run first (see Risk Mitigation table in TASKS.md)
   - Estimated complexity (from the task spec)
6. **Wait for user confirmation** before proceeding to Phase 2.

## Phase 2 — Implement a Task

Follow this sequence strictly for each task:

### Step 1: Read the Task Spec

- Read the specific task section from `docs/TASKS.md` (e.g., Task 1.4).
- Extract: description, steps, files to create/modify, dependencies, acceptance criteria.
- Verify all dependency tasks are complete in `docs/STATUS.md`.

### Step 2: Explore Before Writing

- Read existing files that will be modified or that the new code depends on.
- Understand the current state of the codebase — don't assume, verify.
- Check if any referenced packages are already installed (`package.json`).
- If the task mentions evaluating alternatives (e.g., "evaluate `whisper-node` npm as fallback"), do that research first.

### Step 3: Architecture Decisions

If the task contains a decision point (marked as "Decision needed" or "Option A/B" in TASKS.md):

1. **Use the recommended option** from TASKS.md and proceed without asking.
2. Log the decision and reasoning in `docs/STATUS.md` Decisions Log.
3. Only ask the user if TASKS.md has no clear recommendation or the options have equal tradeoffs.

Standing decisions (from TASKS.md recommendations):

- **VAD**: Option B — run in main process via `vad-node` (Task 1.6)
- **whisper.cpp**: Evaluate existing npm bindings first, custom N-API only if needed (Task 2.1)
- **Interim transcription**: Option A — timer-based interim results (Task 2.4)
- **ONNX**: Use `@huggingface/transformers` v3+ with Node.js ONNX Runtime (Task 3.1)

### Step 4: Implement

- Follow the implementation steps from the task spec order.
- Create files in the locations specified by the task.
- Use the exact interfaces from `src/shared/types.ts` — don't reinvent types.
- Install dependencies when the task lists them under "Dependencies to install."
- Write idiomatic TypeScript with the project's conventions:
  - Strict mode, single quotes, trailing commas, 100 char width
  - ESM imports in renderer, Node.js imports in main
  - Use `electron-vite` path aliases: `@shared/*`, `@main/*`

### Step 5: Verify Acceptance Criteria

Go through every acceptance criterion checkbox from the task spec:

1. **Compile check**: Run `npm run typecheck` — must pass with zero errors.
2. **Lint check**: Run `npm run lint` — must pass.
3. **Unit tests**: Only write tests when the task spec explicitly lists test files (e.g., `__tests__/processor.test.ts`). Do not add tests for tasks that don't specify them.
4. **Manual verification**: For UI or integration criteria, describe what to test and how.
5. **Performance criteria**: If the task has latency/memory targets, explain how to measure.

Report each criterion as PASS / FAIL / NEEDS MANUAL TEST.

### Step 6: Update Status

After all acceptance criteria pass:

1. **Update `docs/STATUS.md`** task table: Change status from `🔴 TODO` to `🟢 Done`. Add brief notes.
2. **Update Decisions Log** in `docs/STATUS.md`: Add an entry for any architecture decisions made, alternatives considered, and reasoning. Format:
   ```
   | YYYY-MM-DD | Task X.Y | Decision summary | Alternatives rejected | Reasoning |
   ```
3. If the task unlocked new dependency-free tasks, mention them to the user as ready to start.

## Constraints & Guardrails

### Hardware Target

- MacBook M1 8GB unified memory
- Budget: ~1.5 GB RAM max for the app
- Metal GPU for whisper.cpp and ONNX Runtime

### Zero External Dependencies at Runtime

- No Python, no cloud APIs, no network calls (after model download)
- All ML inference runs locally via native addons or ONNX Runtime

### Performance Budgets

| Metric                                 | Target   |
| -------------------------------------- | -------- |
| STT latency (base model, 3s audio)     | < 500ms  |
| Translation latency (typical sentence) | < 150ms  |
| Total end-to-end P95                   | < 1000ms |
| Memory peak                            | < 1.5 GB |
| Audio capture CPU                      | < 5%     |

### Code Quality

- TypeScript strict mode — no `any` unless interfacing with native addons
- All IPC communication through typed channels defined in `src/shared/types.ts`
- Native addons isolated in `native/` directory with their own build system
- Error handling: never crash the app — degrade gracefully

## Common Patterns

### IPC Communication

```
Renderer → Main: ipcRenderer.invoke('channel', data)
Main → Renderer: mainWindow.webContents.send('channel', data)
Preload bridge: contextBridge.exposeInMainWorld('electronAPI', { ... })
```

### Audio Pipeline Flow

```
Mic (renderer) → IPC → Resample (main) → VAD (main) → STT (main) → Translate (main) → IPC → UI (renderer)
```

### Model Loading

```
ModelManager.ensureModel(name) → check cache → download if needed → return path
WhisperSTT.init(modelName) → ensureModel → load native addon
OpusMTTranslator.init() → @huggingface/transformers pipeline()
```

## Error Recovery Checklist

When something fails during implementation:

1. **Build fails**: Check `electron.vite.config.ts` externals — native addons must be externalized.
2. **Native addon won't compile**: Verify Xcode CLI tools installed, check `binding.gyp` for correct paths.
3. **ONNX model fails to load**: Check `env.cacheDir` path, verify model downloaded completely.
4. **IPC not working**: Verify preload script exposes the channel, check contextIsolation settings.
5. **Audio permission denied on macOS**: Check entitlements in `build/entitlements.mac.plist`.
