import type { PuuidValidationPort } from "./riot-admin-executor.ts";

const ASIA_ACCOUNT_ORIGIN = "https://asia.api.riotgames.com";
const PUUID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;
const MAX_RESPONSE_BYTES = 4_096;

export class RiotPuuidValidator implements PuuidValidationPort {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 3_000,
  ) {
    if (apiKey.length === 0 || /[\r\n\0]/u.test(apiKey)) {
      throw new Error("riot_validator_credential_invalid");
    }
  }

  async validate(input: {
    puuid: string;
    platformId: string;
  }): ReturnType<PuuidValidationPort["validate"]> {
    const puuid = input.puuid.trim();
    if (input.platformId.toUpperCase() !== "KR") {
      return { kind: "invalid", reasonCode: "platform_mismatch" };
    }
    if (!PUUID_PATTERN.test(puuid)) {
      return { kind: "invalid", reasonCode: "invalid_puuid" };
    }

    try {
      await this.lookupByPuuid({ puuid, platformId: input.platformId });
      return { kind: "valid", normalizedPuuid: puuid };
    } catch (error) {
      if (error instanceof RiotAccountNotFoundError) {
        return { kind: "invalid", reasonCode: "invalid_puuid" };
      }
      throw unavailable();
    }
  }

  async lookupByPuuid(input: {
    puuid: string;
    platformId: string;
  }): Promise<{ normalizedPuuid: string; gameName: string; tagLine: string }> {
    const puuid = input.puuid.trim();
    if (input.platformId.toUpperCase() !== "KR" || !PUUID_PATTERN.test(puuid)) {
      throw unavailable();
    }
    const parsed = await this.fetchAccount(
      `${ASIA_ACCOUNT_ORIGIN}/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`,
    );
    if (
      parsed.puuid !== puuid ||
      typeof parsed.gameName !== "string" ||
      parsed.gameName.length < 1 ||
      parsed.gameName.length > 32 ||
      /[\r\n\0#]/u.test(parsed.gameName) ||
      typeof parsed.tagLine !== "string" ||
      parsed.tagLine.length < 2 ||
      parsed.tagLine.length > 8 ||
      !/^[A-Za-z0-9]+$/u.test(parsed.tagLine)
    ) {
      throw unavailable();
    }
    return {
      normalizedPuuid: puuid,
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
    };
  }

  async resolve(input: {
    gameName: string;
    tagLine: string;
    platformId: string;
  }): Promise<
    | { kind: "valid"; normalizedPuuid: string }
    | { kind: "invalid"; reasonCode: "invalid_puuid" | "platform_mismatch" }
  > {
    if (input.platformId.toUpperCase() !== "KR") {
      return { kind: "invalid", reasonCode: "platform_mismatch" };
    }
    const gameName = input.gameName.trim();
    const tagLine = input.tagLine.trim();
    if (
      gameName.length < 1 ||
      gameName.length > 32 ||
      tagLine.length < 2 ||
      tagLine.length > 8 ||
      /[\r\n\0/#]/u.test(gameName) ||
      !/^[A-Za-z0-9]+$/u.test(tagLine)
    ) {
      return { kind: "invalid", reasonCode: "invalid_puuid" };
    }
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = await this.fetchAccount(
          `${ASIA_ACCOUNT_ORIGIN}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        );
      } catch (error) {
        if (error instanceof RiotAccountNotFoundError) {
          return { kind: "invalid", reasonCode: "invalid_puuid" };
        }
        throw error;
      }
      if (
        !PUUID_PATTERN.test(typeof parsed.puuid === "string" ? parsed.puuid : "") ||
        parsed.gameName !== gameName ||
        String(parsed.tagLine).toUpperCase() !== tagLine.toUpperCase()
      ) {
        throw unavailable();
      }
      return { kind: "valid", normalizedPuuid: parsed.puuid as string };
    } catch {
      throw unavailable();
    }
  }

  private async fetchAccount(url: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { "X-Riot-Token": this.apiKey, Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status === 404) {
        throw new RiotAccountNotFoundError();
      }
      if (response.status !== 200) throw unavailable();
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw unavailable();
      }
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw unavailable();
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        throw unavailable();
      }
      return parsed as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }
}

class RiotAccountNotFoundError extends Error {}

function unavailable(): Error {
  return new Error("riot_validator_unavailable");
}
