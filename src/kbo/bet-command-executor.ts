import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import {
  KboBetPlacementInputError,
  type KboBetRegistrationStore,
} from "./bet-placement.ts";

const credits = new Intl.NumberFormat("ko-KR");
const outcomes = {
  home_win: "홈 승",
  draw: "무승부",
  away_win: "원정 승",
} as const;

export class KboBetCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly store: KboBetRegistrationStore,
    private readonly enabled: boolean,
    private readonly createId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    if (request.commandName !== "베팅 하기") throw notConfigured();
    if (!this.enabled) throw unavailable();

    const gameId = request.options["경기"] ?? "";
    const prediction = request.options["결과"];
    const stake = unsignedInteger(request.options["금액"]);
    const homeScore = optionalScore(request.options["홈점수"]);
    const awayScore = optionalScore(request.options["원정점수"]);
    if (
      !(prediction && Object.hasOwn(outcomes, prediction)) ||
      stake === undefined ||
      (homeScore === undefined) !== (awayScore === undefined)
    ) {
      throw invalidInput();
    }

    try {
      const result = await this.store.place({
        operationId: request.eventId,
        betId: `kbo_bet:${this.createId()}`,
        guildId: request.guildId,
        discordUserId: request.actorId,
        gameId,
        rightsStatus: "authorized",
        stake,
        prediction: prediction as keyof typeof outcomes,
        ...(homeScore === undefined ? {} : { predictedHomeScore: homeScore }),
        ...(awayScore === undefined ? {} : { predictedAwayScore: awayScore }),
        placedAt: this.now(),
      });
      if (result.status === "placed") {
        return [
          "**베팅 접수 완료**",
          `경기: ${result.gameId}`,
          `선택: ${outcomes[prediction as keyof typeof outcomes]}`,
          `금액: ${credits.format(stake)} 크레딧`,
        ].join("\n");
      }
      if (result.status === "duplicate_operation") {
        throw denied("kbo_bet_duplicate", "이미 처리한 베팅 요청입니다.");
      }
      throw denial(result.reason);
    } catch (error) {
      if (error instanceof CommandFailure) throw error;
      if (error instanceof KboBetPlacementInputError) throw invalidInput();
      if (error instanceof PersistenceError) throw unavailable();
      throw error;
    }
  }
}

export class KboBettingCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly enrollment: FeatureCommandExecutor,
    private readonly bet: FeatureCommandExecutor,
    private readonly queries: FeatureCommandExecutor,
    private readonly rankings: FeatureCommandExecutor,
  ) {}

  execute(request: CommandRequest): Promise<string> {
    if (request.commandName === "베팅 가입") return this.enrollment.execute(request);
    if (request.commandName.startsWith("랭킹")) return this.rankings.execute(request);
    return request.commandName === "베팅 하기"
      ? this.bet.execute(request)
      : this.queries.execute(request);
  }
}

function unsignedInteger(value: string | undefined): bigint | undefined {
  return value !== undefined && /^[0-9]{1,5}$/u.test(value) ? BigInt(value) : undefined;
}

function optionalScore(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return /^[0-9]{1,5}$/u.test(value) && Number(value) <= 32_767
    ? Number(value)
    : Number.NaN;
}

function denial(reason: string): CommandFailure {
  const messages: Record<string, string> = {
    not_enrolled: "먼저 KBO 승부 예측에 가입해 주세요.",
    game_data_unavailable: "신뢰할 수 있는 최신 경기 정보를 확인할 수 없습니다.",
    betting_closed: "이 경기의 베팅 접수가 종료되었습니다.",
    correction_debt: "정정 부채가 남아 있어 새 베팅을 접수할 수 없습니다.",
    insufficient_balance: "가용 크레딧이 부족합니다.",
    daily_limit_exceeded: "오늘의 베팅 원금 한도 50,000 크레딧을 초과합니다.",
    already_bet: "이 경기에는 이미 베팅했습니다.",
  };
  return denied(`kbo_bet_${reason}`, messages[reason] ?? "베팅을 접수할 수 없습니다.");
}

function invalidInput(): CommandFailure {
  return denied(
    "kbo_bet_invalid_input",
    "경기·결과·금액을 확인하고 예상 점수는 홈과 원정을 함께 입력해 주세요.",
  );
}

function unavailable(): CommandFailure {
  return new CommandFailure(
    "kbo_betting_unavailable",
    "KBO 베팅 접수는 아직 운영 환경에서 사용할 수 없습니다.",
  );
}

function notConfigured(): CommandFailure {
  return new CommandFailure(
    "feature_not_configured",
    "이 기능은 아직 운영 환경에 연결되지 않았습니다.",
  );
}

function denied(reasonCode: string, message: string): CommandFailure {
  return new CommandFailure(reasonCode, message, "denied");
}
