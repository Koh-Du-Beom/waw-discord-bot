export type RiotPlatform = string;
export type RiotVerificationMethod =
  | "admin_approved_unverified"
  | "rso_verified";

export type RiotAccountLink = {
  linkId: string;
  discordUserId: string;
  puuid: string;
  platformId: RiotPlatform;
  gameName: string;
  tagLine: string;
  verificationMethod: RiotVerificationMethod;
  isPrimary: boolean;
  approvedBy?: string;
  createdAt: Date;
  removedAt?: Date;
};

export type RiotAccountLinkStore = {
  findActiveByPuuid(puuid: string): Promise<RiotAccountLink | undefined>;
  listActive(discordUserId: string): Promise<readonly RiotAccountLink[]>;
  save(link: RiotAccountLink): Promise<void>;
  remove(linkId: string, discordUserId: string, removedAt: Date): Promise<boolean>;
};

export class RiotLinkConflictError extends Error {
  constructor() {
    super("riot account is already linked");
    this.name = "RiotLinkConflictError";
  }
}

export class RiotAccountLinkService {
  constructor(private readonly store: RiotAccountLinkStore) {}

  async approve(input: {
    linkId: string;
    discordUserId: string;
    puuid: string;
    platformId: string;
    gameName: string;
    tagLine: string;
    administratorId: string;
    createdAt: Date;
  }): Promise<RiotAccountLink> {
    if (await this.store.findActiveByPuuid(input.puuid)) {
      throw new RiotLinkConflictError();
    }
    const existing = await this.store.listActive(input.discordUserId);
    const link: RiotAccountLink = {
      ...input,
      verificationMethod: "admin_approved_unverified",
      approvedBy: input.administratorId,
      isPrimary: existing.length === 0,
    };
    await this.store.save(link);
    return link;
  }

  list(discordUserId: string): Promise<readonly RiotAccountLink[]> {
    return this.store.listActive(discordUserId);
  }

  unlink(linkId: string, discordUserId: string, removedAt: Date): Promise<boolean> {
    return this.store.remove(linkId, discordUserId, removedAt);
  }
}
