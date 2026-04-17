import { type Translations } from "./index";

export const en: Translations = {
  // Site metadata
  siteTitle: "GPS Log Viewer — GPS track map viewer & analysis tool",
  siteDescription:
    "Upload NMEA files to display and analyze GPS tracks on a map",

  // App header
  appSubtitle: "GPS track map viewer & analysis tool",

  // File upload
  loading: "Loading…",
  selectAnotherFile: "Select another file",
  dropFileHere: "📂 Drop a GPS log file here",
  orClickToSelect: "or click to select",
  supportedFormats: "(.nmea / .gpx / .kml / .kmz / .txt / .log)",
  clearButton: "Clear",
  exportToGpx: "⬇ Export as GPX",
  exportToKml: "⬇ Export as KML",
  noGpsCoordinates: "No GPS coordinates found.",
  fileReadError: "Failed to read file.",

  // Errors
  errorsMore: (n) => `and ${n} more`,

  // Panel toggle
  closePanel: "Close panel",
  openPanel: "Open panel",

  // Tabs
  tabStats: "Stats",
  tabChart: "Chart",
  tabSatellite: "Satellite",
  tabRaw: "RAW",

  // Stats panel
  pointCount: "Points",
  totalDistance: "Total distance",
  startTime: "Start time",
  endTime: "End time",
  duration: "Duration",
  maxSpeed: "Max speed",
  avgSpeed: "Avg speed",
  maxAltitude: "Max altitude",
  minAltitude: "Min altitude",
  altitudeDiff: "Alt. range",
  positionAccuracyTitle: "Position accuracy",
  meanLat: "Mean latitude",
  meanLng: "Mean longitude",
  cepNote:
    "CEP 50%: radius containing 50% of all fixes / 2drms: 2×√(σ²E+σ²N)",
  displayOptionsTitle: "Display options",
  colorBySpeed: "Color route by speed",

  // Chart panel
  noChartData: "No chart data available.",
  speedChartTitle: "Speed (km/h)",
  speedMax: (max) => `Max ${max} km/h`,
  altChartTitle: "Altitude (m)",
  altRangeLabel: (min, max) => `${min} m – ${max} m`,
  satChartTitle: "Satellites",
  satMax: (max) => `Max ${max}`,

  // Chart tooltips
  speedTooltip: (v) => `Speed: ${v} km/h`,
  altTooltip: (v) => `Alt: ${v} m`,
  satTooltip: (v) => `Satellites: ${v}`,

  // Satellite panel
  satelliteNmeaOnly: "Satellite data is only available for NMEA files.",
  noSatelliteData:
    "No satellite data (check that the file contains GSV sentences).",
  satelliteSkyplot: (count) => `Satellites (${count}) — Skyplot`,
  inUse: "In fix",
  inView: "In view (unused)",
  snrChartTitle: "SNR (signal strength) — dBHz",
  satelliteListTitle: "Satellite list",
  satColSat: "Sat",
  satColElevation: "Elev.",
  satColAzimuth: "Az.",
  satColSnr: "SNR",
  satColUsed: "Used",
  noSnrData: "No SNR data.",
  satTooltipTitle: (constellation, prn, elevation, azimuth, snr, used) =>
    `${constellation} PRN${prn} Elev:${elevation}° Az:${azimuth}° SNR:${snr} dBHz${used ? " ✓in fix" : " (unused)"}`,
  snrBarTooltip: (constellation, prn, snr, used) =>
    `${constellation} PRN${prn}: ${snr} dBHz${used ? " (in use)" : ""}`,

  // Raw panel
  rawNmeaOnly: "RAW data is only available for NMEA files.",
  rawTotalSentences: (n) => `Total ${n} sentences`,
  rawMoreSentences: (n) => `… and ${n} more sentences`,

  // Playback controls
  pause: "Pause",
  play: "Play",
  speedSliderLabel: "Playback speed slider",
  speedPresetTitle: "Playback speed preset (hover for fine control)",
  switchToArrow: "Switch to arrow marker",
  switchToCircle: "Switch to circle marker",
  centerOnMarkerOnTitle: "Center on marker: ON (click to turn OFF)",
  centerOnMarkerOffTitle: "Center on marker: OFF (click to turn ON)",
  centerOnMarkerOnLabel: "Turn off center on marker",
  centerOnMarkerOffLabel: "Turn on center on marker",
  headingUpOnTitle: "Heading-up: ON (click to switch to north-up)",
  headingUpOffTitle: "North-up: ON (click to switch to heading-up)",
  headingUpOnLabel: "Switch to north-up",
  headingUpOffLabel: "Switch to heading-up",
  playbackPositionLabel: "Playback position",

  // Map tooltip labels
  mapSpeed: "Speed",
  mapAltitude: "Alt",
  mapSatellites: "Satellites",
  mapStartMarker: "Start",
  mapEndMarker: "End",

  // Language toggle
  languageToggle: "日本語",
};
