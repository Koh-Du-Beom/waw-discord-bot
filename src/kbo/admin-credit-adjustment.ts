import type { CommandAuditEvent } from "../commands/command-handler.ts";
import type { CreditAdjustmentReasonCode } from "../contracts/admin-command-ipc.ts";

export type KboAdminCreditAdjustmentStore = {
  adjust(input: {
    operationId: string;
    accountId: string;
    expectedVersion: number;
    delta: bigint;
    reasonCode: CreditAdjustmentReasonCode;
    administratorId: string;
    adjustedAt: Date;
    audit: CommandAuditEvent;
  }): Promise<
    | { status: "adjusted"; availableBalance: bigint; version: number }
    | {
        status:
          | "not_found"
          | "stale"
          | "self_adjustment"
          | "insufficient_balance"
          | "duplicate_operation";
      }
  >;
};
