"use client";

import { useState, useEffect, useCallback } from "react";
import { ja } from "./ja";
import { en } from "./en";

export type Language = "ja" | "en";

export interface Translations {
  // Site metadata
  siteTitle: string;
  siteDescription: string;

  // App header
  appSubtitle: string;

  // File upload
  loading: string;
  selectAnotherFile: string;
  dropFileHere: string;
  orClickToSelect: string;
  supportedFormats: string;
  clearButton: string;
  exportToGpx: string;
  exportToKml: string;
  noGpsCoordinates: string;
  fileReadError: string;

  // Errors
  errorsMore: (n: number) => string;

  // Panel toggle
  closePanel: string;
  openPanel: string;

  // Tabs
  tabStats: string;
  tabChart: string;
  tabSatellite: string;
  tabRaw: string;

  // Stats panel
  pointCount: string;
  totalDistance: string;
  startTime: string;
  endTime: string;
  duration: string;
  maxSpeed: string;
  avgSpeed: string;
  maxAltitude: string;
  minAltitude: string;
  altitudeDiff: string;
  positionAccuracyTitle: string;
  meanLat: string;
  meanLng: string;
  cepNote: string;
  displayOptionsTitle: string;
  colorBySpeed: string;

  // Chart panel
  noChartData: string;
  speedChartTitle: string;
  speedMax: (max: string) => string;
  altChartTitle: string;
  altRangeLabel: (min: string, max: string) => string;
  satChartTitle: string;
  satMax: (max: string) => string;

  // Chart tooltips
  speedTooltip: (v: string) => string;
  altTooltip: (v: string) => string;
  satTooltip: (v: string) => string;

  // Satellite panel
  satelliteNmeaOnly: string;
  noSatelliteData: string;
  satelliteSkyplot: (count: string) => string;
  inUse: string;
  inView: string;
  snrChartTitle: string;
  satelliteListTitle: string;
  satColSat: string;
  satColElevation: string;
  satColAzimuth: string;
  satColSnr: string;
  satColUsed: string;
  noSnrData: string;
  satTooltipTitle: (
    constellation: string,
    prn: string,
    elevation: string,
    azimuth: string,
    snr: string,
    used: boolean
  ) => string;
  snrBarTooltip: (
    constellation: string,
    prn: string,
    snr: string,
    used: boolean
  ) => string;

  // Raw panel
  rawNmeaOnly: string;
  rawTotalSentences: (n: string) => string;
  rawMoreSentences: (n: string) => string;

  // Playback controls
  pause: string;
  play: string;
  speedSliderLabel: string;
  speedPresetTitle: string;
  switchToArrow: string;
  switchToCircle: string;
  centerOnMarkerOnTitle: string;
  centerOnMarkerOffTitle: string;
  centerOnMarkerOnLabel: string;
  centerOnMarkerOffLabel: string;
  headingUpOnTitle: string;
  headingUpOffTitle: string;
  headingUpOnLabel: string;
  headingUpOffLabel: string;
  playbackPositionLabel: string;

  // Map tooltip labels (passed to MapView)
  mapSpeed: string;
  mapAltitude: string;
  mapSatellites: string;
  mapStartMarker: string;
  mapEndMarker: string;

  // Language toggle
  languageToggle: string;
}

const STORAGE_KEY = "gpsLogViewer_language";

const resources: Record<Language, Translations> = { ja, en };

export function useTranslations(): {
  t: Translations;
  language: Language;
  setLanguage: (lang: Language) => void;
} {
  const [language, setLanguageState] = useState<Language>("ja");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && stored in resources) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }, []);

  return { t: resources[language], language, setLanguage };
}
