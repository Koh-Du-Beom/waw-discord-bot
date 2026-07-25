import type {
  CommandRequest,
  FeatureCommandExecutor,
} from "./command-handler.ts";

export class RoutedFeatureCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly riot: FeatureCommandExecutor,
    private readonly game: FeatureCommandExecutor,
  ) {}

  execute(request: CommandRequest): Promise<string> {
    return request.commandName.startsWith("라이엇계정")
      ? this.riot.execute(request)
      : this.game.execute(request);
  }
}
