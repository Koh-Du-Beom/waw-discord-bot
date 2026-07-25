import type { AuthorizationTier } from "../contracts/local-command.ts";

export type IncidentStatus = "open" | "confirmed" | "corrected" | "cancelled";
export type IncidentMutation = {
  operationId: string;
  incidentId: string;
  expectedVersion: number;
  actorId: string;
  authorizationTier: AuthorizationTier;
  action: "correct" | "cancel";
  reason: string;
  occurredAt: Date;
};

export type IncidentMutationStore = {
  mutateWithAudit(input: IncidentMutation): Promise<"updated" | "conflict" | "not_found">;
};

export class IncidentAuthorizationError extends Error {}
export class IncidentReasonError extends Error {}

export class IncidentService {
  constructor(private readonly store: IncidentMutationStore) {}

  async mutate(input: IncidentMutation): Promise<"updated" | "conflict" | "not_found"> {
    if (input.authorizationTier !== "administrator") {
      throw new IncidentAuthorizationError("administrator required");
    }
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 500) {
      throw new IncidentReasonError("reason is required");
    }
    return this.store.mutateWithAudit({ ...input, reason });
  }
}
