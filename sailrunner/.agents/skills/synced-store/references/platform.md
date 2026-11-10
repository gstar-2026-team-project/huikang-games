# Platform Capabilities

Platform capabilities are server-side services available via `ctx.platform.call()`. They provide AI, environment variables, and the instance title. Talking to another store is not a platform capability; use `ctx.externalStore(...)` and `ctx.mutateExternal(...)` (see [external-stores.md](external-stores.md)). Neither path gives general HTTP access.

Prefer platform calls in [actions](actions.md). Platform calls from mutators are discouraged: server mutators are processed one at a time, so slow platform calls block mutation throughput. Server mutation attempts can also be retried on optimistic-lock conflict before commit, so a direct mutator platform call can run more than once or for an attempt that is later discarded. If a mutator truly needs a short one-off platform effect, call it only on the server behind `if (ctx.isServer) { ... }`, `await` it before the mutator returns, and make the call idempotent/read-only. On the client, `ctx.platform.call(...)` always throws. If you need an AI call, a slow platform call, or a non-idempotent effect triggered by a client interaction, use a mutator to create a placeholder, then `ctx.enqueueAction(...)` to do the server-only work.

## Available Services

| Service | Example | Description |
|---------|---------|-------------|
| `poe.modelProxy.stream` | `call("poe.modelProxy.stream", { model, request })` | Open a trusted LLM completion stream without exposing API keys to app code |
| `poe.modelProxy.generateImage` | `call("poe.modelProxy.generateImage", { model, request })` | Generate image(s) from a prompt (non-streaming; returns base64) |
| `poe.modelProxy.generateHostedImage` | `call("poe.modelProxy.generateHostedImage", { model, request })` | Generate one image and return a claimed `fileId` of the calling store (persist it in a `fileRefs` field) |
| `systemTools.list` | `call("systemTools.list", {})` | List tools the LLM can call |
| `systemTools.call` | `call("systemTools.call", { toolName, toolInput })` | Execute a tool |
| `env.get` | `call("env.get", {})` | Get environment variables |
| `setSpaceTitle` | `call("setSpaceTitle", { title: "Alice vs Bob" })` | Set the user-facing title of the current app instance (`null` clears the rename). Fans out to every member's manager. |

## Usage in an Action

```typescript
import type { InferActionHandlers, PlatformCaller } from "poe-tiles-sdk/v1/backend.js";

type TodoActions = InferActionHandlers<typeof todoSchema, PlatformCaller>;

const actions: TodoActions = {
  generateWithAI: async (ctx, input) => {
    const stream = await ctx.platform.call("poe.modelProxy.stream", {
      model: "anthropic/claude-opus-5", // a model root, `lab/model` — the `id` of every `Poe.listModels()` entry
      request: { messages: [{ role: "user", text: input.prompt }] },
    });
    await stream.cancel(); // parse the stream in real AI-driven actions
    // (or use `createModelStream(ctx.platform)`, which parses it for you)
    const { BASE_URL } = await ctx.platform.call("env.get", {});
    // ...use BASE_URL when constructing platform links
  },
};
```

Pass `PlatformCaller` as the second type parameter to `InferActionHandlers` for full autocomplete on `ctx.platform.call()`.

## Discouraged Mutator Usage

```typescript
import type { InferMutatorHandlers, PlatformCaller } from "poe-tiles-sdk/v1/backend.js";

type TodoMutators = InferMutatorHandlers<typeof todoSchema, PlatformCaller>;

const mutators: TodoMutators = {
  setSpaceTitleFromTodo: async (ctx, input) => {
    await ctx.table("todos").set({ itemKey: input.id, value: input.todo });
    if (!ctx.isServer) return;
    await ctx.platform.call("setSpaceTitle", { title: input.todo.text });
  },
};
```

Only use this discouraged pattern for short, one-off server-side effects that must be part of the mutator flow. Always `await ctx.platform.call(...)` before the mutator returns. The call must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt and rerun direct platform calls before any commit succeeds. Do not put AI calls, streaming, slow platform calls, high-fanout work, or non-idempotent side effects directly in mutators.
