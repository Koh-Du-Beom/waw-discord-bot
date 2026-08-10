import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import { KboBetQueryInputError, type KboBetQueryStore, type KboRecentBet } from "./bet-queries.ts";

const credits = new Intl.NumberFormat("ko-KR");
const kstTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const outcomes = { home_win: "홈 승", draw: "무승부", away_win: "원정 승" } as const;

export class KboBetQueryCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly store: KboBetQueryStore,
    private readonly gamesEnabled: boolean,
    private readonly now: () => Date,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    try {
      if (request.commandName === "베팅 경기") {
        if (!this.gamesEnabled) throw unavailable();
        const games = await this.store.listOpenGames({ now: this.now() });
        if (games.length === 0) return "**접수 가능한 KBO 경기**\n현재 최신 정보로 접수 가능한 경기가 없습니다.";
        return [
          "**접수 가능한 KBO 경기**",
          ...games.map((game, index) =>
            `${index + 1}. ${kstTime.format(game.scheduledStartAt)} · ${game.awayTeamId} @ ${game.homeTeamId}\n경기 ID: ${game.gameId}`,
          ),
          `출처 갱신: ${kstTime.format(games[0]!.sourceUpdatedAt)} · 수집: ${kstTime.format(games[0]!.collectedAt)}`,
        ].join("\n");
      }
      if (request.commandName !== "베팅 내역") throw notConfigured();
      const result = await this.store.readRecent({
        guildId: request.guildId,
        discordUserId: request.actorId,
      });
      if (result.status === "not_enrolled") {
        throw new CommandFailure("kbo_not_enrolled", "KBO 승부 예측에 가입된 계정이 없습니다.", "denied");
      }
      if (result.bets.length === 0) return "**최근 베팅**\n아직 접수한 베팅이 없습니다.";
      return ["**최근 베팅**", ...result.bets.map(formatBet)].join("\n");
    } catch (error) {
      if (error instanceof CommandFailure) throw error;
      if (error instanceof PersistenceError || error instanceof KboBetQueryInputError) {
        throw new CommandFailure(
          request.commandName === "베팅 경기" ? "kbo_open_games_unavailable" : "kbo_recent_bets_unavailable",
          "KBO 베팅 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw error;
    }
  }
}

function formatBet(bet: KboRecentBet, index: number): string {
  const scorePrediction = bet.predictedHomeScore === undefined
    ? ""
    : ` ${bet.predictedAwayScore}:${bet.predictedHomeScore}`;
  const actual = bet.actualHomeScore === undefined
    ? ""
    : ` · 실제 ${bet.actualAwayScore}:${bet.actualHomeScore}`;
  const returned = bet.returnAmount === undefined ? "" : ` · 반환 ${credits.format(bet.returnAmount)}`;
  const status = bet.status === "pending" ? "접수" : bet.status === "void" ? "무효" : "정산";
  return `${index + 1}. ${kstTime.format(bet.scheduledStartAt)} · ${bet.awayTeamId} @ ${bet.homeTeamId}\n${outcomes[bet.prediction]}${scorePrediction} · ${credits.format(bet.stake)} 크레딧 · ${status}${bet.corrected ? "(정정)" : ""}${actual}${returned}`;
}

function unavailable(): CommandFailure {
  return new CommandFailure("kbo_betting_unavailable", "KBO 경기 조회는 아직 운영 환경에서 사용할 수 없습니다.");
}

function notConfigured(): CommandFailure {
  return new CommandFailure("feature_not_configured", "이 기능은 아직 운영 환경에 연결되지 않았습니다.");
}
