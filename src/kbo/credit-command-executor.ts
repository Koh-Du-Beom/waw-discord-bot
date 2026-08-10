import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import {
  KboCreditBalanceInputError,
  type KboCreditBalanceStore,
} from "./credit-balance.ts";
import {
  KboDailyCreditClaimInputError,
  type KboDailyCreditClaimStore,
} from "./daily-credit-claim.ts";

const credits = new Intl.NumberFormat("ko-KR");

export class KboCreditCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly balances: KboCreditBalanceStore,
    private readonly claims: KboDailyCreditClaimStore,
    private readonly createId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    if (request.commandName !== "크레딧 내정보" && request.commandName !== "크레딧 받기") {
      throw new CommandFailure(
        "feature_not_configured",
        "이 기능은 아직 운영 환경에 연결되지 않았습니다.",
      );
    }
    try {
      if (request.commandName === "크레딧 받기") {
        const result = await this.claims.claim({
          operationId: request.eventId,
          claimId: `kbo_daily_claim:${this.createId()}`,
          guildId: request.guildId,
          discordUserId: request.actorId,
          claimedAt: this.now(),
        });
        if (result.status === "claimed") {
          return [
            "**일일 크레딧**",
            "오늘 50,000 크레딧을 받았습니다.",
            `가용 크레딧 증가: ${credits.format(result.availablePaid)} 크레딧`,
            `정정 부채 상계: ${credits.format(result.debtPaid)} 크레딧`,
          ].join("\n");
        }
        if (result.status === "already_claimed") {
          throw new CommandFailure(
            "kbo_daily_credit_already_claimed",
            "오늘 받을 수 있는 50,000 크레딧을 이미 받았습니다.",
            "denied",
          );
        }
        if (result.status === "not_enrolled") {
          throw new CommandFailure(
            "kbo_not_enrolled",
            "KBO 승부 예측에 가입된 계정이 없습니다.",
            "denied",
          );
        }
        throw new CommandFailure(
          "kbo_daily_credit_duplicate",
          "이미 처리한 크레딧 지급 요청입니다.",
          "denied",
        );
      }
      const result = await this.balances.read({
        guildId: request.guildId,
        discordUserId: request.actorId,
      });
      if (result.status === "not_enrolled") {
        throw new CommandFailure(
          "kbo_not_enrolled",
          "KBO 승부 예측에 가입된 계정이 없습니다.",
          "denied",
        );
      }
      return [
        "**내 크레딧**",
        `가용 크레딧: ${credits.format(result.availableBalance)} 크레딧`,
        `정정 부채: ${credits.format(result.correctionDebt)} 크레딧`,
      ].join("\n");
    } catch (error) {
      if (error instanceof CommandFailure) throw error;
      if (
        error instanceof PersistenceError ||
        error instanceof KboCreditBalanceInputError ||
        error instanceof KboDailyCreditClaimInputError
      ) {
        throw new CommandFailure(
          request.commandName === "크레딧 받기"
            ? "kbo_daily_credit_unavailable"
            : "kbo_credit_balance_unavailable",
          request.commandName === "크레딧 받기"
            ? "크레딧을 받지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "크레딧 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw error;
    }
  }
}
