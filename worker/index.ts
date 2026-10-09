import { acquisition, type Env } from "../server/acquisition";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      acquisition(env).then((panel) => {
        const state = panel.configured ? panel.attribution.state : "unconfigured";
        const errors = panel.configured ? panel.errors : panel.missing;
        console.log(
          `[asc] feed read — attribution ${state}${errors.length ? `; ${errors.join("; ")}` : ""}`,
        );
      }),
    );
  },
};
