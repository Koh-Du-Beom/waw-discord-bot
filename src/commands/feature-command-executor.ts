import {
  CommandFailure,
  type CommandRequest,
  type FeatureCommandExecutor,
} from "./command-handler.ts";

export class RoutedFeatureCommandExecutor implements FeatureCommandExecutor {
  constructor(
    private readonly riot: FeatureCommandExecutor,
    private readonly game: FeatureCommandExecutor,
    private readonly credit: FeatureCommandExecutor,
    private readonly betting: FeatureCommandExecutor,
    private readonly kboCommandsEnabled = false,
  ) {}

  execute(request: CommandRequest): Promise<string> {
    if (request.commandName.startsWith("라이엇계정")) return this.riot.execute(request);
    if (isKboCommand(request.commandName) && !this.kboCommandsEnabled) {
      throw new CommandFailure(
        "kbo_commands_unavailable",
        "KBO 명령은 아직 운영 환경에서 사용할 수 없습니다.",
      );
    }
    if (request.commandName.startsWith("크레딧")) return this.credit.execute(request);
    if (request.commandName.startsWith("베팅") || request.commandName.startsWith("랭킹")) {
      return this.betting.execute(request);
    }
    return this.game.execute(request);
  }
}

function isKboCommand(commandName: CommandRequest["commandName"]): boolean {
  return commandName.startsWith("크레딧") ||
    commandName.startsWith("베팅") ||
    commandName.startsWith("랭킹");
}
