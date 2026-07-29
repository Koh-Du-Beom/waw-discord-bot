export type RiotIdentityRefreshTarget = {
  linkId: string;
  puuid: string;
  platformId: string;
  version: number;
};

export type RiotIdentityRefreshSource = {
  listIdentityRefreshTargets(input: {
    afterLinkId?: string;
    limit: number;
  }): Promise<readonly RiotIdentityRefreshTarget[]>;
  updateIdentity(input: RiotIdentityRefreshTarget & {
    gameName: string;
    tagLine: string;
  }): Promise<void>;
};

export type RiotAccountIdentityReader = {
  lookupByPuuid(input: {
    puuid: string;
    platformId: string;
  }): Promise<{
    normalizedPuuid: string;
    gameName: string;
    tagLine: string;
  }>;
};

export class RiotIdentityRefreshScheduler {
  private afterLinkId: string | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(private readonly input: {
    source: RiotIdentityRefreshSource;
    identities: RiotAccountIdentityReader;
    batchSize: number;
  }) {
    if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 50) {
      throw new Error("riot_identity_refresh_batch_invalid");
    }
  }

  tick(): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  async whenIdle(): Promise<void> {
    await this.inFlight;
  }

  private async run(): Promise<void> {
    let targets = await this.input.source.listIdentityRefreshTargets({
      ...(this.afterLinkId === undefined ? {} : { afterLinkId: this.afterLinkId }),
      limit: this.input.batchSize,
    });
    if (targets.length === 0 && this.afterLinkId !== undefined) {
      this.afterLinkId = undefined;
      targets = await this.input.source.listIdentityRefreshTargets({
        limit: this.input.batchSize,
      });
    }
    for (const target of targets) {
      let current: Awaited<ReturnType<RiotAccountIdentityReader["lookupByPuuid"]>>;
      try {
        current = await this.input.identities.lookupByPuuid(target);
      } catch {
        // Provider unavailability preserves the existing link and display metadata.
        continue;
      }
      if (current.normalizedPuuid !== target.puuid) continue;
      await this.input.source.updateIdentity({
        ...target,
        gameName: current.gameName,
        tagLine: current.tagLine,
      });
    }
    this.afterLinkId = targets.at(-1)?.linkId;
  }
}
