import type {
  GatewayClient,
  GatewayReconciler,
  ReconciledMember,
} from "./gateway-runtime.ts";

export class FakeGatewayAdapter implements GatewayClient, GatewayReconciler {
  readonly calls: string[] = [];
  members: readonly ReconciledMember[] = [];
  reconciliationFailure: Error | undefined;
  destroyBarrier: Promise<void> | undefined;

  async login(): Promise<void> {
    this.calls.push("login");
  }

  async reconnect(mode: "resume" | "identify"): Promise<void> {
    this.calls.push(`reconnect:${mode}`);
  }

  async destroy(): Promise<void> {
    this.calls.push("destroy");
    await this.destroyBarrier;
  }

  async reconcile(): Promise<readonly ReconciledMember[]> {
    this.calls.push("reconcile");
    if (this.reconciliationFailure !== undefined) {
      throw this.reconciliationFailure;
    }
    return this.members;
  }
}
