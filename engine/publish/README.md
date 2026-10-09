# publish

Schedules a render through Buffer and tags the post with its vector.

On publish, write `buffer_post_id → variant id` into the ledger — that join key is
how `collect/` later attaches reward to the right vector. **Never lose it.**

**v0:** Buffer MCP for interactive scheduling.
**vN:** a thin Buffer API client for headless loop runs.

Default to add-to-queue unless a specific time is intended.
