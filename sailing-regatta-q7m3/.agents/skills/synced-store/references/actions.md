# Actions

Actions execute on the server. Use them when you need things mutators can't do: AI calls, image generation, randomness, calling another store's action, or accessing server-only data. Actions have no general network access: the backend runtime's `fetch` throws, so a third-party HTTP API cannot be called from an action. Outbound work goes through `ctx.platform.call(...)` for platform services (see [platform.md](platform.md)) and `ctx.externalStore(...)` for other stores (see [external-stores.md](external-stores.md)); neither gives general HTTP access.

> **Security boundary:** server execution does not make an action's writes
> action-only. Actions write through `ctx.mutate(...)`, and ordinary schema
> mutators are also directly callable by clients. Validate caller-controlled
> input accordingly. The current app API has no backend-enforced app-internal
> mutator or transactional action-write primitive; `$`-prefixed mutators are
> reserved for trusted platform system work and cannot be called from an
> ordinary app action.

| | Mutator | Action |
|---|---------|--------|
| Runs on | Client + Server | Server only |
| Instant UI update | Yes (optimistic) | No (waits for server) |
| Use when | Client has all data needed | Needs AI, platform capabilities, or server-only data |

## Declaring Actions in the Schema

```typescript
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: { /* ... */ },
  mutators: { /* ... */ },
  actions: {
    generateWithAI: {
      description: "Generate todo text from a prompt using AI",
      input: z.object({ id: z.string(), prompt: z.string() }),
      output: z.object({ text: z.string() }),
    },
  },
});
```

Actions are also exposed as MCP tools, so AI models can call them directly.

## Implementing Actions in the Backend Config

```typescript
export const todoBackendConfig = defineBackendConfig<typeof todoSchema>({
  schema: todoSchema,
  mutators: { /* ... */ },
  actions: {
    generateWithAI: async (ctx, input) => {
      // `createModelStream(ctx.platform)` from `poe-tiles-sdk/v1/backend.js`
      // wraps this call and parses the stream for you.
      const openModelStream = createModelStream(ctx.platform);
      let generatedText = "";
      for await (const delta of openModelStream({
        model: "anthropic/claude-opus-5", // a model root, `lab/model` — the `id` of every `Poe.listModels()` entry
        prompts: [{ role: "user", text: input.prompt }],
      })) {
        generatedText = delta.isReplaceResponse
          ? delta.text
          : generatedText + delta.text;
      }

      await ctx.mutate("setTodo", {
        id: input.id,
        text: generatedText,
        status: "generating",
      });

      await ctx.mutate("setTodo", {
        id: input.id,
        text: generatedText,
        status: "ready",
      });

      return { text: generatedText };
    },
  },
});
```

## Calling Actions from the Client

```typescript
const result = await store.action.generateWithAI({
  id: "todo-1",
  prompt: "What should I cook for dinner?",
});
```

## Enqueuing Actions from Mutators

Mutators can trigger actions as a side effect. `ctx.enqueueAction()` is a no-op on the client; on the server it runs the action after the mutation commits. Call it unconditionally — no `ctx.isServer` guard needed.

```typescript
mutators: {
  createAndGenerate: async (ctx, input) => {
    // Instant: create a placeholder todo
    await ctx.table("todos").set({
      itemKey: input.id,
      value: { id: input.id, text: "Generating...", completed: false, status: "generating" },
    });

    // Queued: server will run this after the mutation commits
    ctx.enqueueAction("generateWithAI", {
      id: input.id,
      prompt: input.prompt,
    });
  },
},
```

## When NOT to use an Action

- Data changes that the client can compute — use a mutator (optimistic, no round trip).
- Secrets the client should never see — use `serverOnly()` tables; an action can expose a derived result.
