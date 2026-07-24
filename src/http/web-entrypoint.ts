export type WebListenConfiguration = Readonly<{
  host: "127.0.0.1";
  port: number;
}>;

export type DashboardListener = {
  listen(input: WebListenConfiguration): Promise<string>;
  close(): Promise<void>;
};

export type RunningDashboardWebServer = Readonly<{
  address: string;
  close(): Promise<void>;
}>;

export function parseWebListenConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): WebListenConfiguration {
  const host = environment.WAW_WEB_HOST;
  const port = Number(environment.WAW_WEB_PORT);
  if (
    host !== "127.0.0.1" ||
    !Number.isSafeInteger(port) ||
    port < 1024 ||
    port > 65_535
  ) {
    throw new Error("web-listen-configuration-invalid");
  }
  return { host, port };
}

export async function startDashboardWebServer(
  listener: DashboardListener,
  configuration: WebListenConfiguration,
): Promise<RunningDashboardWebServer> {
  if (configuration.host !== "127.0.0.1") {
    throw new Error("web-listen-configuration-invalid");
  }
  const address = await listener.listen(configuration);
  let closed = false;
  return {
    address,
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await listener.close();
    },
  };
}
