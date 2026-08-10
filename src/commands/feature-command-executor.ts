import type {
  CommandRequest,
  FeatureCommandExecutor,
} from "./command-handler.ts";

export class RoutedFeatureCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly riot: FeatureCommandExecutor,
    private readonly game: FeatureCommandExecutor,
    private readonly credit: FeatureCommandExecutor,
    private readonly betting: FeatureCommandExecutor,
  ) {}

  execute(request: CommandRequest): Promise<string> {
    if (request.commandName.startsWith("라이엇계정")) return this.riot.execute(request);
    if (request.commandName.startsWith("크레딧")) return this.credit.execute(request);
    if (request.commandName.startsWith("베팅") || request.commandName.startsWith("랭킹")) {
      return this.betting.execute(request);
    }
    return this.game.execute(request);
  }
}
