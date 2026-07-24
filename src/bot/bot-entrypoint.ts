import type { GatewayRuntime } from "../gateway/gateway-runtime.ts";
import type { SingletonLease } from "../gateway/singleton-lease.ts";

export const DUPLICATE_BOT_EXIT_CODE = 73;

export type BotProcess = {
  exitCode: number | undefined;
  shutdown(): Promise<void>;
};

export async function startBotProcess(input: {
  ownerId: string;
  lease: SingletonLease;
  gateway: GatewayRuntime;
  shutdownTimeoutMs: number;
  timeout: (milliseconds: number) => Promise<void>;
}): Promise<BotProcess> {
  const claimed = await input.lease.claim(input.ownerId);
  if (!claimed) {
    return {
      exitCode: DUPLICATE_BOT_EXIT_CODE,
      shutdown: async () => {},
    };
  }

  let stopped = false;
  try {
    await input.gateway.start();
  } catch (error) {
    await input.lease.release(input.ownerId);
    throw error;
  }

  return {
    exitCode: undefined,
    async shutdown(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;
      const completed = Symbol("gateway-stopped");
      const result = await Promise.race([
        input.gateway.stop().then(() => completed),
        input.timeout(input.shutdownTimeoutMs).then(() => undefined),
      ]);
      if (result === completed) {
        await input.lease.release(input.ownerId);
        return;
      }
      throw new Error("gateway shutdown timed out; singleton lease retained");
    },
  };
}
