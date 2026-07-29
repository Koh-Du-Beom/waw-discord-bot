import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type APIApplicationCommandStringOption,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../contracts/summary-disclosure.ts";

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
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "최근",
        description: "지금부터 선택한 시간만큼 이전 대화를 요약합니다.",
        options: [{
          type: ApplicationCommandOptionType.String,
          name: "범위",
          description: "요약할 최근 시간 범위",
          required: true,
          choices: [
            { name: "최근 10분", value: "10분" },
            { name: "최근 30분", value: "30분" },
            { name: "최근 1시간", value: "1시간" },
            { name: "최근 3시간", value: "3시간" },
            { name: "최근 6시간", value: "6시간" },
            { name: "최근 12시간", value: "12시간" },
            { name: "최근 24시간", value: "24시간" },
          ],
        }],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "직접",
        description: "한국 시간으로 시작과 종료 시각을 직접 입력합니다.",
        options: [
          stringOption("시작", "예: 20:00 또는 어제 23:30"),
          stringOption("종료", "예: 21:00 또는 오늘 00:30"),
        ],
      },
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
          stringOption("계정", "화면에 표시되는 Riot ID(예: 이름#KR1)"),
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
    "**대화 요약 도움말**",
    "`/요약 최근 범위:<최근 10분~24시간>` — 선택한 최근 범위를 요약합니다.",
    "`/요약 직접 시작:<20:00> 종료:<21:00>` — 한국 시간으로 직접 지정합니다.",
    "자정을 넘는 범위는 `어제 23:30`, `오늘 00:30`처럼 입력합니다.",
    "현재 채널이나 스레드에서 최대 24시간까지만 요약할 수 있습니다.",
    "",
    `※ 외부 처리 안내: ${SUMMARY_EXTERNAL_PROCESSING_NOTICE}`,
    "",
    "**Riot 계정**",
    "`/라이엇계정 연결 계정:<이름#태그>` — 화면에 표시되는 KR Riot ID로 연결 승인을 요청합니다.",
    "`/라이엇계정 목록 [사용자]` — 연결된 계정을 확인합니다.",
    "`/라이엇계정 연결해제 계정:<연결 ID>` — 내 연결을 해제합니다.",
    "관리자가 승인한 활성 계정은 Riot 솔로랭크와 Discord Go Live 상태를 자동 관측합니다.",
    "관리자 승인 연결은 Riot의 공식 소유권 인증이 아닙니다.",
    "",
    "**몰랭검거**",
    "`/몰랭검거 현황 [사용자]` — Riot 게임과 Discord Go Live 관측을 따로 확인합니다.",
    "`/몰랭검거 정정 사건:<사건 ID> 사유:<내용>` — 관리자 전용 정정입니다.",
    "`/몰랭검거 취소 사건:<사건 ID> 사유:<내용>` — 관리자 전용 취소입니다.",
    "",
    "명령 결과와 이 도움말은 호출자에게만 표시됩니다.",
  ].join("\n"),
  invalidRange:
    "시간을 확인해 주세요. `20:00` 또는 `어제 23:30`처럼 입력하며 최대 24시간까지만 요약할 수 있습니다.",
  incompleteSummary: "요청한 전체 대화 범위를 확인할 수 없어 요약하지 않았습니다.",
  providerUnavailable: "요약 제공자가 아직 설정되지 않았습니다.",
  riotPendingApproval: "관리자 확인 전에는 소유권이 검증되지 않은 연결로 표시됩니다.",
  riotConflict: "이 Riot 계정은 이미 다른 Discord 사용자에게 연결되어 있습니다.",
  adminOnly: "이 명령은 관리자만 사용할 수 있습니다.",
  unknownEvidence: "증거가 부족하거나 외부 API를 확인할 수 없어 상태를 알 수 없습니다.",
} as const;
