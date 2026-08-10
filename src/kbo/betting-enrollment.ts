export type KboEnrollmentInput = {
  operationId: string;
  enrollmentId: string;
  accountId: string;
  guildId: string;
  discordUserId: string;
  policyVersion: number;
  enrolledAt: Date;
};

export type KboEnrollmentResult =
  | "created"
  | "already_enrolled"
  | "not_registered"
  | "duplicate_operation";

export type KboEnrollmentStore = {
  enroll(input: KboEnrollmentInput): Promise<KboEnrollmentResult>;
};

export const KBO_ENROLLMENT_POLICY = {
  version: 1,
  optionDisclosure:
    "비현금 크레딧·공개 랭킹·탈퇴 후 1년 보존·백업 최대 30일 잔존에 동의합니다.",
  successMessage: [
    "KBO 승부 예측에 가입했습니다. 시작 잔액: 0 크레딧",
    "크레딧은 현실 가치가 없으며 구매·판매·현금화·양도·대여·공동 사용·상품·경품·역할·권한·광고·서비스 교환과 후원·구독·서버 부스트 혜택에 사용할 수 없습니다.",
    "가입자는 공개 랭킹에 표시됩니다.",
    "서버 탈퇴 시 Discord 직접 연결을 제거합니다. 비식별 계정과 기록은 최대 1년 보존되며 백업에는 최대 30일 더 남을 수 있습니다.",
  ].join("\n"),
} as const;

const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const snowflakePattern = /^[1-9][0-9]{16,19}$/;

export class KboEnrollmentInputError extends Error {
  constructor() {
    super("invalid KBO enrollment input");
    this.name = "KboEnrollmentInputError";
  }
}

export function assertKboEnrollmentInput(input: KboEnrollmentInput): void {
  if (
    !operationIdPattern.test(input.operationId) ||
    !opaqueIdPattern.test(input.enrollmentId) ||
    !opaqueIdPattern.test(input.accountId) ||
    !snowflakePattern.test(input.guildId) ||
    !snowflakePattern.test(input.discordUserId) ||
    !Number.isSafeInteger(input.policyVersion) ||
    input.policyVersion <= 0 ||
    !Number.isFinite(input.enrolledAt.getTime())
  ) {
    throw new KboEnrollmentInputError();
  }
}
