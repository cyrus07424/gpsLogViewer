/**
 * Wigle CSV format parser
 * Supports WiFi, Bluetooth, and Cell Tower data
 * Reference: https://api.wigle.net/csvFormat.html
 */

export interface RadioNetwork {
  mac: string;
  ssid?: string;
  name?: string;
  signal: number; // dBm
  frequency?: number; // MHz
  channel?: number;
  firstSeen?: Date;
  lat: number;
  lng: number;
  altitude?: number; // meters
  type: "wifi" | "bluetooth" | "cell"; // data type
  provider?: string; // for cell towers
  cellId?: string;
}

export interface ParsedWigle {
  networks: RadioNetwork[];
  errors: string[];
  type: "wifi" | "bluetooth" | "cell" | "mixed";
}

/**
 * Detect Wigle CSV format by checking headers
 */
function detectWigleFormat(headers: string[]): "wifi" | "bluetooth" | "cell" | null {
  const headerLower = headers.map((h) => h.toLowerCase());

  // WiFi format: has MAC, SSID, Latitude, Longitude
  if (headerLower.includes("mac") && headerLower.includes("ssid")) {
    return "wifi";
  }

  // Bluetooth format: has MAC, Name (or Device)
  if (
    headerLower.includes("mac") &&
    (headerLower.includes("name") || headerLower.includes("device")) &&
    !headerLower.includes("ssid") &&
    !headerLower.includes("cellid")
  ) {
    return "bluetooth";
  }

  // Cell tower format: has CellID or CellProvider
  if (headerLower.includes("cellid") || headerLower.includes("cellprovider")) {
    return "cell";
  }

  return null;
}

/**
 * Parse WiFi CSV data
 */
function parseWifiCsv(content: string, errors: string[]): RadioNetwork[] {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const networks: RadioNetwork[] = [];

  // Find column indices
  const macIdx = headers.findIndex((h) => h.toLowerCase() === "mac");
  const ssidIdx = headers.findIndex((h) => h.toLowerCase() === "ssid");
  const signalIdx = headers.findIndex((h) => h.toLowerCase() === "signal");
  const freqIdx = headers.findIndex((h) => h.toLowerCase().includes("frequency"));
  const channelIdx = headers.findIndex((h) => h.toLowerCase() === "channel");
  const latIdx = headers.findIndex((h) => h.toLowerCase().includes("latitude"));
  const lngIdx = headers.findIndex((h) => h.toLowerCase().includes("longitude"));
  const altIdx = headers.findIndex((h) => h.toLowerCase().includes("altitude"));
  const firstSeenIdx = headers.findIndex((h) => h.toLowerCase().includes("firstseen"));

  if (macIdx < 0 || latIdx < 0 || lngIdx < 0) {
    errors.push("WiFi CSV missing required columns: MAC, Latitude, Longitude");
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split(",").map((c) => c.trim());

      const mac = cols[macIdx];
      const ssid = ssidIdx >= 0 ? cols[ssidIdx] : undefined;
      const signal = signalIdx >= 0 ? parseInt(cols[signalIdx], 10) : 0;
      const frequency = freqIdx >= 0 ? parseFloat(cols[freqIdx]) : undefined;
      const channel = channelIdx >= 0 ? parseInt(cols[channelIdx], 10) : undefined;
      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);
      const altitude = altIdx >= 0 ? parseFloat(cols[altIdx]) : undefined;
      const firstSeenStr = firstSeenIdx >= 0 ? cols[firstSeenIdx] : undefined;

      if (!mac || isNaN(lat) || isNaN(lng)) continue;

      const network: RadioNetwork = {
        mac,
        ssid: ssid && ssid !== "" ? ssid : undefined,
        signal: isNaN(signal) ? 0 : signal,
        frequency: isNaN(frequency as number) ? undefined : frequency,
        channel: isNaN(channel as number) ? undefined : channel,
        firstSeen: firstSeenStr ? parseDate(firstSeenStr) : undefined,
        lat,
        lng,
        altitude: isNaN(altitude as number) ? undefined : altitude,
        type: "wifi",
      };

      networks.push(network);
    } catch (e) {
      errors.push(`WiFi CSV parse error at line ${i + 1}: ${String(e)}`);
    }
  }

  return networks;
}

/**
 * Parse Bluetooth CSV data
 */
function parseBluetoothCsv(content: string, errors: string[]): RadioNetwork[] {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const networks: RadioNetwork[] = [];

  const macIdx = headers.findIndex((h) => h.toLowerCase() === "mac");
  const nameIdx = headers.findIndex(
    (h) => h.toLowerCase() === "name" || h.toLowerCase() === "device"
  );
  const signalIdx = headers.findIndex((h) => h.toLowerCase() === "signal");
  const freqIdx = headers.findIndex((h) => h.toLowerCase().includes("frequency"));
  const latIdx = headers.findIndex((h) => h.toLowerCase().includes("latitude"));
  const lngIdx = headers.findIndex((h) => h.toLowerCase().includes("longitude"));
  const altIdx = headers.findIndex((h) => h.toLowerCase().includes("altitude"));
  const firstSeenIdx = headers.findIndex((h) => h.toLowerCase().includes("firstseen"));

  if (macIdx < 0 || latIdx < 0 || lngIdx < 0) {
    errors.push("Bluetooth CSV missing required columns: MAC, Latitude, Longitude");
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split(",").map((c) => c.trim());

      const mac = cols[macIdx];
      const name = nameIdx >= 0 ? cols[nameIdx] : undefined;
      const signal = signalIdx >= 0 ? parseInt(cols[signalIdx], 10) : 0;
      const frequency = freqIdx >= 0 ? parseFloat(cols[freqIdx]) : undefined;
      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);
      const altitude = altIdx >= 0 ? parseFloat(cols[altIdx]) : undefined;
      const firstSeenStr = firstSeenIdx >= 0 ? cols[firstSeenIdx] : undefined;

      if (!mac || isNaN(lat) || isNaN(lng)) continue;

      const network: RadioNetwork = {
        mac,
        name: name && name !== "" ? name : undefined,
        signal: isNaN(signal) ? 0 : signal,
        frequency: isNaN(frequency as number) ? undefined : frequency,
        firstSeen: firstSeenStr ? parseDate(firstSeenStr) : undefined,
        lat,
        lng,
        altitude: isNaN(altitude as number) ? undefined : altitude,
        type: "bluetooth",
      };

      networks.push(network);
    } catch (e) {
      errors.push(`Bluetooth CSV parse error at line ${i + 1}: ${String(e)}`);
    }
  }

  return networks;
}

/**
 * Parse Cell Tower CSV data
 */
function parseCellCsv(content: string, errors: string[]): RadioNetwork[] {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const networks: RadioNetwork[] = [];

  const cellIdIdx = headers.findIndex((h) => h.toLowerCase() === "cellid");
  const providerIdx = headers.findIndex((h) => h.toLowerCase().includes("provider"));
  const signalIdx = headers.findIndex((h) => h.toLowerCase() === "signal");
  const latIdx = headers.findIndex((h) => h.toLowerCase().includes("latitude"));
  const lngIdx = headers.findIndex((h) => h.toLowerCase().includes("longitude"));
  const altIdx = headers.findIndex((h) => h.toLowerCase().includes("altitude"));
  const firstSeenIdx = headers.findIndex((h) => h.toLowerCase().includes("firstseen"));

  if (cellIdIdx < 0 || latIdx < 0 || lngIdx < 0) {
    errors.push("Cell CSV missing required columns: CellID, Latitude, Longitude");
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split(",").map((c) => c.trim());

      const cellId = cols[cellIdIdx];
      const provider = providerIdx >= 0 ? cols[providerIdx] : undefined;
      const signal = signalIdx >= 0 ? parseInt(cols[signalIdx], 10) : 0;
      const lat = parseFloat(cols[latIdx]);
      const lng = parseFloat(cols[lngIdx]);
      const altitude = altIdx >= 0 ? parseFloat(cols[altIdx]) : undefined;
      const firstSeenStr = firstSeenIdx >= 0 ? cols[firstSeenIdx] : undefined;

      if (!cellId || isNaN(lat) || isNaN(lng)) continue;

      const network: RadioNetwork = {
        mac: cellId,
        cellId,
        provider,
        signal: isNaN(signal) ? 0 : signal,
        firstSeen: firstSeenStr ? parseDate(firstSeenStr) : undefined,
        lat,
        lng,
        altitude: isNaN(altitude as number) ? undefined : altitude,
        type: "cell",
      };

      networks.push(network);
    } catch (e) {
      errors.push(`Cell CSV parse error at line ${i + 1}: ${String(e)}`);
    }
  }

  return networks;
}

/**
 * Parse various date formats used by Wigle
 */
function parseDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;

  // Try ISO format: 2024-01-01
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(isoMatch[0]);
  }

  // Try US format: 01/01/2024
  const usMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return new Date(`${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`);
  }

  // Try parsing as general date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return undefined;
}

/**
 * Main Wigle CSV parser function
 */
export function parseWigleCsv(content: string): ParsedWigle {
  const errors: string[] = [];
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return { networks: [], errors: ["Empty file"], type: "wifi" };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const format = detectWigleFormat(headers);

  if (!format) {
    errors.push("Could not detect Wigle CSV format (WiFi/Bluetooth/Cell)");
    return { networks: [], errors, type: "wifi" };
  }

  let networks: RadioNetwork[] = [];

  switch (format) {
    case "wifi":
      networks = parseWifiCsv(content, errors);
      break;
    case "bluetooth":
      networks = parseBluetoothCsv(content, errors);
      break;
    case "cell":
      networks = parseCellCsv(content, errors);
      break;
  }

  return {
    networks,
    errors,
    type: format,
  };
}

