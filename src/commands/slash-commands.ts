import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type APIApplicationCommandStringOption,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { SUMMARY_EXTERNAL_PROCESSING_NOTICE } from "../contracts/summary-disclosure.ts";
import { KBO_ENROLLMENT_POLICY } from "../kbo/betting-enrollment.ts";

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
        type: ApplicationCommandOptionType.Subcommand as const,
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
        description: "시스템의 활성 Riot 계정 연결을 조회합니다.",
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
        description: "전체 몰랭스택 또는 사용자의 관측 기록을 조회합니다.",
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
  {
    type: ApplicationCommandType.ChatInput,
    name: "크레딧",
    description: "KBO 승부 예측 크레딧 정보를 확인합니다.",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "내정보",
        description: "내 가용 크레딧과 정정 부채를 확인합니다.",
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "받기",
        description: "오늘의 50,000 크레딧을 받습니다.",
      },
    ],
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: "베팅",
    description: "KBO 승부 예측에 가입하거나 베팅합니다.",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "가입",
        description: "KBO 승부 예측에 명시적으로 가입합니다.",
        options: [{
          type: ApplicationCommandOptionType.Boolean,
          name: "동의",
          description: KBO_ENROLLMENT_POLICY.optionDisclosure,
          required: true,
        }],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "하기",
        description: "선택한 KBO 경기에 크레딧을 베팅합니다.",
        options: [
          stringOption("경기", "경기 조회에 표시된 경기 ID"),
          {
            type: ApplicationCommandOptionType.String,
            name: "결과",
            description: "예측할 경기 결과",
            required: true,
            choices: [
              { name: "홈 승", value: "home_win" },
              { name: "무승부", value: "draw" },
              { name: "원정 승", value: "away_win" },
            ],
          },
          {
            type: ApplicationCommandOptionType.Integer as const,
            name: "금액",
            description: "1,000 단위, 최대 50,000 크레딧",
            required: true,
            min_value: 1_000,
            max_value: 50_000,
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: "홈점수",
            description: "정확 점수 예측 시 홈 점수",
            required: false,
            min_value: 0,
            max_value: 32_767,
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: "원정점수",
            description: "정확 점수 예측 시 원정 점수",
            required: false,
            min_value: 0,
            max_value: 32_767,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "경기",
        description: "최신 정보로 접수 가능한 KBO 경기를 확인합니다.",
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "내역",
        description: "내 최근 베팅 5개와 정산 결과를 확인합니다.",
      },
    ],
  },
  {
    type: ApplicationCommandType.ChatInput,
    name: "랭킹",
    description: "KBO 크레딧과 승부 예측 순위를 확인합니다.",
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: "크레딧",
        description: "현재 보유 크레딧 순위를 확인합니다.",
        options: [{
          type: ApplicationCommandOptionType.Integer,
          name: "페이지",
          description: "조회할 10명 단위 페이지(기본 1)",
          required: false,
          min_value: 1,
          max_value: 100,
        }],
      },
      ...(["결과", "점수", "적중률"] as const).map((name) => ({
        type: ApplicationCommandOptionType.Subcommand as const,
        name,
        description: `${name} 랭킹을 대회와 시즌별로 확인합니다.`,
        options: [
          stringOption("대회", "공급자 competition ID"),
          stringOption("시즌", "공급자 season ID"),
          {
            type: ApplicationCommandOptionType.Integer as const,
            name: "페이지",
            description: "조회할 10명 단위 페이지(기본 1)",
            required: false,
            min_value: 1,
            max_value: 100,
          },
        ],
      })),
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
    "`/라이엇계정 목록 [사용자]` — 사용자를 생략하면 시스템의 모든 연결 계정과 해제용 연결 ID를 확인합니다.",
    "`/라이엇계정 연결해제 계정:<연결 ID>` — 내 연결을 해제합니다.",
    "관리자가 승인한 활성 계정은 Riot 솔로랭크와 Discord Go Live 상태를 자동 관측합니다.",
    "현재 연결은 Riot 공식 인증이 아닌 관리자 승인 방식입니다. 이 구분은 연결 해제를 제한하지 않습니다.",
    "",
    "**몰랭검거**",
    "`/몰랭검거 현황 [사용자]` — 사용자를 생략하면 전체 등록 사용자의 몰랭스택을 표로 확인합니다.",
    "`/몰랭검거 정정 사건:<사건 ID> 사유:<내용>` — 관리자 전용 정정입니다.",
    "`/몰랭검거 취소 사건:<사건 ID> 사유:<내용>` — 관리자 전용 취소입니다.",
    "",
    "**KBO 크레딧**",
    "`/크레딧 내정보` — 내 가용 크레딧과 정정 부채를 확인합니다.",
    "`/크레딧 받기` — 오늘의 50,000 크레딧을 직접 받습니다.",
    "",
    "**KBO 승부 예측**",
    "`/베팅 가입 동의:true` — 비현금성·공개 랭킹·보존 정책에 동의하고 가입합니다.",
    "`/베팅 하기 경기:<ID> 결과:<홈 승|무승부|원정 승> 금액:<1,000~50,000>` — 경기 시작 전 베팅합니다.",
    "`/베팅 경기` — 최신 정보로 접수 가능한 경기와 베팅용 경기 ID를 확인합니다.",
    "`/베팅 내역` — 최근 베팅 5개와 정산·무효·정정 결과를 확인합니다.",
    "정확 점수 예측은 `홈점수`와 `원정점수`를 함께 입력합니다.",
    "`/랭킹 크레딧` — 현재 보유 크레딧 공동 순위를 확인합니다.",
    "`/랭킹 결과|점수|적중률 대회:<ID> 시즌:<ID>` — 대회·시즌별 공동 순위를 확인합니다.",
    "",
    "명령 결과와 이 도움말은 호출자에게만 표시됩니다.",
  ].join("\n"),
  invalidRange:
    "시간을 확인해 주세요. `20:00` 또는 `어제 23:30`처럼 입력하며 최대 24시간까지만 요약할 수 있습니다.",
  incompleteSummary: "요청한 전체 대화 범위를 확인할 수 없어 요약하지 않았습니다.",
  providerUnavailable: "요약 제공자가 아직 설정되지 않았습니다.",
  riotPendingApproval: "관리자 확인 전에는 승인 대기 연결로 표시됩니다.",
  riotConflict: "이 Riot 계정은 이미 다른 Discord 사용자에게 연결되어 있습니다.",
  adminOnly: "이 명령은 관리자만 사용할 수 있습니다.",
  unknownEvidence: "증거가 부족하거나 외부 API를 확인할 수 없어 상태를 알 수 없습니다.",
} as const;
