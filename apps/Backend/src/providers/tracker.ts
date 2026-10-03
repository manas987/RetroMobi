// flespi -- read-only passthrough. No telemetry is stored in our own DB; we
// always ask flespi for the latest position when a user asks for it.
export interface TrackerClient {
  getLastPosition(
    deviceIdentifier: string,
  ): Promise<{ lat: number; lng: number; timestamp: string; battery: number | null } | null>;
}

function getConfig() {
  const token = process.env.FLESPI_TOKEN;
  const baseUrl = process.env.FLESPI_BASE_URL ?? "https://flespi.io";
  if (!token) throw new Error("FLESPI_TOKEN must be set");
  return { token, baseUrl };
}

export const trackerClient: TrackerClient = {
  async getLastPosition(deviceIdentifier) {
    const { token, baseUrl } = getConfig();
    const response = await fetch(
      `${baseUrl}/gw/devices/${deviceIdentifier}/messages?data=%7B%22count%22%3A1%7D`,
      { headers: { Authorization: `FlespiToken ${token}` } },
    );
    if (!response.ok) {
      throw new Error(`flespi getLastPosition failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as {
      result?: Array<{
        "position.latitude"?: number;
        "position.longitude"?: number;
        timestamp?: number;
        "battery.level"?: number;
      }>;
    };
    const message = body.result?.[0];
    if (!message || message["position.latitude"] == null || message["position.longitude"] == null) {
      return null;
    }
    return {
      lat: message["position.latitude"],
      lng: message["position.longitude"],
      timestamp: new Date((message.timestamp ?? 0) * 1000).toISOString(),
      battery: message["battery.level"] ?? null,
    };
  },
};
