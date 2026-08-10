import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "../commands/command-handler.ts";
import { PersistenceError } from "../persistence/postgres-persistence.ts";
import {
  KboRankingInputError,
  type KboRankingMetric,
  type KboRankingRow,
  type KboRankingStore,
} from "./rankings.ts";

const credits = new Intl.NumberFormat("ko-KR");
const protectedMarkdown = new Set(["\\", "`", "*", "_", "[", "]", "~", "|"]);
const metrics: Record<string, KboRankingMetric> = {
  "랭킹 크레딧": "credits",
  "랭킹 결과": "outcome_hits",
  "랭킹 점수": "score_hits",
  "랭킹 적중률": "hit_rate",
};

export class KboRankingCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly store: KboRankingStore,
    private readonly enabled: boolean,
  ) {}

  async execute(request: CommandRequest): Promise<string> {
    const metric = metrics[request.commandName];
    if (!metric) throw notConfigured();
    if (!this.enabled) throw unavailable();
    const page = request.options["페이지"] === undefined ? 1 : Number(request.options["페이지"]);
    try {
      const rows = await this.store.read({
        guildId: request.guildId,
        discordUserId: request.actorId,
        metric,
        page,
        ...(metric === "credits" || request.options["대회"] === undefined
          ? {}
          : { competitionId: request.options["대회"] }),
        ...(metric === "credits" || request.options["시즌"] === undefined
          ? {}
          : { seasonId: request.options["시즌"] }),
      });
      const title = metric === "credits"
        ? "현재 보유 크레딧"
        : `${request.options["대회"]} / ${request.options["시즌"]} ${metricTitle(metric)}`;
      if (rows.length === 0) return `**${title} 랭킹**\n${page}페이지에 표시할 순위가 없습니다.`;
      return [
        `**${title} 랭킹 · ${page}페이지**`,
        ...rows.map((row) => formatRow(row, metric)),
        ...(metric === "credits" && rows.some((row) => row.adminAdjusted)
          ? ["※ 관리자 조정 포함"]
          : []),
      ].join("\n");
    } catch (error) {
      if (error instanceof CommandFailure) throw error;
      if (error instanceof PersistenceError || error instanceof KboRankingInputError) {
        throw new CommandFailure(
          "kbo_ranking_unavailable",
          "KBO 랭킹을 확인하지 못했습니다. 대회·시즌·페이지를 확인해 주세요.",
        );
      }
      throw error;
    }
  }
}

function formatRow(row: KboRankingRow, metric: KboRankingMetric): string {
  const label = `${safeLabel(row.displayLabel)}${row.isSelf ? " (나)" : ""}`;
  if (metric === "credits") {
    return `${row.rank}위 · ${label} · ${credits.format(row.availableBalance!)} 크레딧`;
  }
  const valid = row.validSettlements!;
  const rate = Number(row.outcomeHits! * 1_000n / valid) / 10;
  return `${row.rank}위 · ${label} · 결과 ${row.outcomeHits} · 점수 ${row.scoreHits} · 유효 ${valid} · ${rate.toFixed(1)}%`;
}

function safeLabel(label: string): string {
  return [...label].map((character) =>
    character === "@" ? "@\u200b" : protectedMarkdown.has(character) ? `\\${character}` : character
  ).join("");
}

function metricTitle(metric: KboRankingMetric): string {
  return metric === "outcome_hits" ? "결과 적중" : metric === "score_hits" ? "정확 점수" : "적중률";
}

function unavailable(): CommandFailure {
  return new CommandFailure("kbo_ranking_unavailable", "KBO 랭킹은 아직 운영 환경에서 사용할 수 없습니다.");
}

function notConfigured(): CommandFailure {
  return new CommandFailure("feature_not_configured", "이 기능은 아직 운영 환경에 연결되지 않았습니다.");
}
