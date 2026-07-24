export type AuthorizationTier = "operator" | "administrator";

export type LocalCommandRequest = {
  operationId: string;
  actorId: string;
  authorizationTier: AuthorizationTier;
  expiresAt: Date;
  requestedAt: Date;
};

export type LocalCommandOutcome =
  | { kind: "accepted"; operationId: string }
  | { kind: "denied"; reason: "expired" | "malformed" }
  | { kind: "duplicate"; operationId: string };

export type OperationLedger = {
  has(operationId: string): boolean;
  record(operationId: string): void;
};

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function evaluateLocalCommand(
  request: LocalCommandRequest,
  ledger: OperationLedger,
): LocalCommandOutcome {
  if (!isValidRequest(request)) {
    return { kind: "denied", reason: "malformed" };
  }

  if (request.expiresAt.getTime() <= request.requestedAt.getTime()) {
    return { kind: "denied", reason: "expired" };
  }

  if (ledger.has(request.operationId)) {
    return { kind: "duplicate", operationId: request.operationId };
  }

  ledger.record(request.operationId);
  return { kind: "accepted", operationId: request.operationId };
}

function isValidRequest(request: LocalCommandRequest): boolean {
  return (
    operationIdPattern.test(request.operationId) &&
    request.actorId.length > 0 &&
    (request.authorizationTier === "operator" || request.authorizationTier === "administrator") &&
    Number.isFinite(request.expiresAt.getTime()) &&
    Number.isFinite(request.requestedAt.getTime())
  );
}
