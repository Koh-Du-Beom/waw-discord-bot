import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type APIApplicationCommandStringOption,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

const stringOption = (
  name: string,
  description: string,
  required = true,
): APIApplicationCommandStringOption => ({
  type: ApplicationCommandOptionType.String,
  name,
  description,
  required,
});

export const WAW_SLASH_COMMANDS: readonly RESTPostAPIApplicationCommandsJSONBody[] = [
  {
    type: ApplicationCommandType.ChatInput,
    name: "도움말",
    description: "봇 명령의 기능과 사용법을 확인합니다.",
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: "요약",
    description: "현재 채널 또는 스레드의 대화를 요약합니다.",
    options: [
      stringOption("시작", "요약 시작 시각(ISO 8601)"),
      stringOption("종료", "요약 종료 시각(ISO 8601)"),
    ],
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: "라이엇계정",
    description: "Riot 계정 연결을 관리합니다.",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "연결",
        description: "Riot 계정 연결을 요청합니다.",
        options: [
          stringOption("라이엇아이디", "Riot ID(name#tag)"),
          stringOption("플랫폼", "Riot platform ID"),
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "목록",
        description: "활성 Riot 계정 연결을 조회합니다.",
        options: [
          {
            type: ApplicationCommandOptionType.User,
            name: "사용자",
            description: "조회할 Discord 사용자",
            required: false,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "연결해제",
        description: "내 Riot 계정 연결을 해제합니다.",
        options: [stringOption("계정", "해제할 계정 연결 ID")],
      },
    ],
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: "몰랭검거",
    description: "게임 관측과 사건을 관리합니다.",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "현황",
        description: "Riot와 Go Live 관측을 각각 조회합니다.",
        options: [
          {
            type: ApplicationCommandOptionType.User,
            name: "사용자",
            description: "조회할 Discord 사용자",
            required: false,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "정정",
        description: "관리자가 게임 사건을 정정합니다.",
        options: [
          stringOption("사건", "정정할 사건 ID"),
          stringOption("사유", "정정 사유"),
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "취소",
        description: "관리자가 게임 사건을 취소합니다.",
        options: [
          stringOption("사건", "취소할 사건 ID"),
          stringOption("사유", "취소 사유"),
        ],
      },
    ],
  },
] as const;

export const KOREAN_COMMAND_RESPONSES = {
  help: [
    "**WAW 명령 도움말**",
    "",
    "**대화 요약**",
    "`/요약 시작:<ISO 8601 시각> 종료:<ISO 8601 시각>`",
    "현재 채널이나 스레드에서 최대 24시간 범위를 요약합니다.",
    "",
    "**Riot 계정**",
    "`/라이엇계정 연결 라이엇아이디:<name#tag> 플랫폼:<KR 등>` — 연결 승인을 요청합니다.",
    "`/라이엇계정 목록 [사용자]` — 연결된 계정을 확인합니다.",
    "`/라이엇계정 연결해제 계정:<연결 ID>` — 내 연결을 해제합니다.",
    "관리자 승인 연결은 Riot의 공식 소유권 인증이 아닙니다.",
    "",
    "**몰랭검거**",
    "`/몰랭검거 현황 [사용자]` — Riot 게임과 Discord Go Live 관측을 따로 확인합니다.",
    "`/몰랭검거 정정 사건:<사건 ID> 사유:<내용>` — 관리자 전용 정정입니다.",
    "`/몰랭검거 취소 사건:<사건 ID> 사유:<내용>` — 관리자 전용 취소입니다.",
    "",
    "명령 결과와 이 도움말은 호출자에게만 표시됩니다.",
  ].join("\n"),
  invalidRange: "시작 시각은 종료 시각보다 빨라야 하며 범위는 최대 24시간입니다.",
  incompleteSummary: "요청한 전체 대화 범위를 확인할 수 없어 요약하지 않았습니다.",
  providerUnavailable: "요약 제공자가 아직 설정되지 않았습니다.",
  riotPendingApproval: "관리자 확인 전에는 소유권이 검증되지 않은 연결로 표시됩니다.",
  riotConflict: "이 Riot 계정은 이미 다른 Discord 사용자에게 연결되어 있습니다.",
  adminOnly: "이 명령은 관리자만 사용할 수 있습니다.",
  unknownEvidence: "증거가 부족하거나 외부 API를 확인할 수 없어 상태를 알 수 없습니다.",
} as const;
