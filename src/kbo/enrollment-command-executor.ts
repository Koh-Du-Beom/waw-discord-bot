import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import {
  KboEnrollmentActorInputError,
  type KboEnrollmentActorRegistrar,
} from "../persistence/postgres-kbo-enrollment-actor-store.ts";
import {
  KBO_ENROLLMENT_POLICY,
  KboEnrollmentInputError,
  type KboEnrollmentStore,
} from "./betting-enrollment.ts";

export class KboEnrollmentCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly actors: KboEnrollmentActorRegistrar,
    private readonly enrollments: KboEnrollmentStore,
    private readonly createId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    if (request.commandName !== "베팅 가입") {
      throw new CommandFailure(
        "feature_not_configured",
        "이 기능은 아직 운영 환경에 연결되지 않았습니다.",
      );
    }
    if (request.options["동의"] !== "true") {
      throw new CommandFailure(
        "kbo_enrollment_consent_required",
        "가입하려면 비현금성·공개 랭킹·보존 정책에 동의해야 합니다.",
        "denied",
      );
    }
    const enrolledAt = this.now();
    const displayLabel = request.actorLabel?.trim().slice(0, 80) || request.actorId;
    try {
      await this.actors.register({
        guildId: request.guildId,
        discordUserId: request.actorId,
        displayLabel,
        registeredAt: enrolledAt,
      });
      const result = await this.enrollments.enroll({
        operationId: request.eventId,
        enrollmentId: `kbo_enrollment:${this.createId()}`,
        accountId: `kbo_account:${this.createId()}`,
        guildId: request.guildId,
        discordUserId: request.actorId,
        policyVersion: KBO_ENROLLMENT_POLICY.version,
        enrolledAt,
      });
      if (result === "created") return KBO_ENROLLMENT_POLICY.successMessage;
      if (result === "already_enrolled") {
        throw new CommandFailure(
          "kbo_already_enrolled",
          "이미 KBO 승부 예측에 가입되어 있습니다.",
          "denied",
        );
      }
      if (result === "duplicate_operation") {
        throw new CommandFailure(
          "kbo_enrollment_duplicate",
          "이미 처리한 가입 요청입니다.",
          "denied",
        );
      }
      throw unavailable();
    } catch (error) {
      if (error instanceof CommandFailure) throw error;
      if (
        error instanceof PersistenceError ||
        error instanceof KboEnrollmentInputError ||
        error instanceof KboEnrollmentActorInputError
      ) {
        throw unavailable();
      }
      throw error;
    }
  }
}

function unavailable(): CommandFailure {
  return new CommandFailure(
    "kbo_enrollment_unavailable",
    "가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}
