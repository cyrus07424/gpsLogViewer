"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { parseNmea, computeStats, fillMissingSpeed, type GpsPoint, type TrackStats, type SatelliteInfo, type Constellation } from "../lib/nmeaParser";
import { parseGpx } from "../lib/gpxParser";
import { parseKml, parseKmz } from "../lib/kmlParser";
import { exportToGpx } from "../lib/gpxExporter";
import { exportToKml } from "../lib/kmlExporter";

type FileFormat = "nmea" | "gpx" | "kml" | "kmz" | "unknown";

// Dynamically import the map to avoid SSR issues
const MapView = dynamic(() => import("./MapView"), { ssr: false });

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDateTime(d?: Date): string {
  if (!d) return "—";
  return d.toLocaleString();
}

interface StatItemProps {
  label: string;
  value: string;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}

function detectFormat(fileName: string, content: string): FileFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".gpx")) return "gpx";
  if (lower.endsWith(".kmz")) return "kmz";
  if (lower.endsWith(".kml")) return "kml";
  if (lower.endsWith(".nmea") || lower.endsWith(".nma") || lower.endsWith(".log") || lower.endsWith(".txt")) return "nmea";
  // Content-based detection: check for specific root elements
  const trimmed = content.trimStart();
  if (trimmed.includes("<gpx")) return "gpx";
  if (trimmed.includes("<kml")) return "kml";
  if (trimmed.startsWith("$")) return "nmea";
  return "unknown";
}

export default function NmeaViewer() {
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [stats, setStats] = useState<TrackStats | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileFormat, setFileFormat] = useState<FileFormat>("unknown");
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "chart" | "satellite" | "raw">("stats");
  const [rawSentences, setRawSentences] = useState<string[]>([]);
  const [lastSatellites, setLastSatellites] = useState<SatelliteInfo[]>([]);
  const [colorBySpeed, setColorBySpeed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setIsLoading(true);
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    if (lower.endsWith(".kmz")) {
      // KMZ is a binary ZIP archive — read as ArrayBuffer
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        setFileFormat("kmz");
        const result = await parseKmz(buffer);
        const filledPts = fillMissingSpeed(result.points);
        setPoints(filledPts);
        setStats(computeStats(filledPts));
        setErrors(result.errors);
        setRawSentences([]);
        setLastSatellites([]);
        setIsLoading(false);
        if (result.points.length > 0) {
          setIsPanelOpen(true);
          setActiveTab("stats");
        }
      };
      reader.onerror = () => {
        setErrors(["ファイルの読み込みに失敗しました。"]);
        setIsLoading(false);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const fmt = detectFormat(file.name, content);
      setFileFormat(fmt);

      let pts: GpsPoint[] = [];
      let errs: string[] = [];
      let raw: string[] = [];
      let sats: SatelliteInfo[] = [];

      if (fmt === "gpx") {
        const result = parseGpx(content);
        pts = result.points;
        errs = result.errors;
      } else if (fmt === "kml") {
        const result = parseKml(content);
        pts = result.points;
        errs = result.errors;
      } else {
        // Default to NMEA (including "unknown")
        const result = parseNmea(content);
        pts = result.points;
        errs = result.errors;
        raw = result.rawSentences;
        sats = result.lastSatellites;
      }

      const filledPts = fillMissingSpeed(pts);
      setPoints(filledPts);
      setStats(computeStats(filledPts));
      setErrors(errs);
      setRawSentences(raw);
      setLastSatellites(sats);
      setIsLoading(false);
      if (pts.length > 0) {
        setIsPanelOpen(true);
        setActiveTab("stats");
      }
    };
    reader.onerror = () => {
      setErrors(["ファイルの読み込みに失敗しました。"]);
      setIsLoading(false);
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClear = useCallback(() => {
    setPoints([]);
    setStats(null);
    setFileName("");
    setFileFormat("unknown");
    setErrors([]);
    setRawSentences([]);
    setLastSatellites([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Full-screen map */}
      <MapView points={points} colorBySpeed={colorBySpeed} />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-2">
        <button
          onClick={() => setIsPanelOpen((v) => !v)}
          className="bg-white dark:bg-gray-800 shadow-md rounded-full w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={isPanelOpen ? "パネルを閉じる" : "パネルを開く"}
        >
          {isPanelOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Side panel */}
      {isPanelOpen && (
        <div className="absolute top-0 left-0 bottom-0 z-[999] w-80 bg-white dark:bg-gray-900 shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 flex-shrink-0">
            <h1 className="text-lg font-bold">🗺 GPS Log Viewer</h1>
            <p className="text-xs text-blue-200">GPS履歴マップ表示・分析ツール</p>
          </div>

          {/* File upload area */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".nmea,.txt,.log,.nma,.gpx,.kml,.kmz"
                onChange={handleFileChange}
                className="hidden"
              />
              {isLoading ? (
                <p className="text-sm text-blue-600 dark:text-blue-400">読み込み中…</p>
              ) : fileName ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">📄 {fileName}</p>
                  <p className="text-xs text-blue-500 mt-1">別のファイルを選択</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    📂 GPSログファイルをここにドロップ
                  </p>
                  <p className="text-xs text-gray-400 mt-1">またはクリックして選択</p>
                  <p className="text-xs text-gray-400">(.nmea / .gpx / .kml / .kmz / .txt / .log)</p>
                </div>
              )}
            </div>
            {fileName && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex gap-2">
                  <button
                    onClick={handleClear}
                    className="flex-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    クリア
                  </button>
                </div>
                {points.length > 0 && (fileFormat === "nmea" || fileFormat === "gpx" || fileFormat === "kml" || fileFormat === "kmz") && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(fileFormat === "nmea" || fileFormat === "kml" || fileFormat === "kmz") && (
                      <button
                        onClick={() => exportToGpx(points, fileName.replace(/\.[^.]+$/, "") + ".gpx")}
                        className="flex-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium border border-blue-300 dark:border-blue-700 rounded px-2 py-1"
                      >
                        ⬇ GPXに変換
                      </button>
                    )}
                    {(fileFormat === "nmea" || fileFormat === "gpx" || fileFormat === "kmz") && (
                      <button
                        onClick={() => exportToKml(points, fileName.replace(/\.[^.]+$/, "") + ".kml")}
                        className="flex-1 text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 font-medium border border-green-300 dark:border-green-700 rounded px-2 py-1"
                      >
                        ⬇ KMLに変換
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mx-3 my-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-300 flex-shrink-0 max-h-20 overflow-y-auto">
              ⚠ {errors.slice(0, 5).join(" | ")}
              {errors.length > 5 && ` … 他 ${errors.length - 5} 件`}
            </div>
          )}

          {/* No points warning */}
          {!isLoading && fileName && points.length === 0 && errors.length === 0 && (
            <div className="mx-3 my-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded text-xs text-red-700 dark:text-red-300 flex-shrink-0">
              GPS座標が見つかりませんでした。
            </div>
          )}

          {/* Tabs */}
          {points.length > 0 && (
            <>
              <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                {(["stats", "chart", "satellite", "raw"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {tab === "stats" ? "統計" : tab === "chart" ? "グラフ" : tab === "satellite" ? "衛星" : "RAW"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTab === "stats" && stats && (
                  <StatsPanel stats={stats} points={points} colorBySpeed={colorBySpeed} setColorBySpeed={setColorBySpeed} />
                )}
                {activeTab === "chart" && (
                  <ChartPanel points={points} />
                )}
                {activeTab === "satellite" && (
                  <SatellitePanel satellites={lastSatellites} fileFormat={fileFormat} />
                )}
                {activeTab === "raw" && (
                  <RawPanel sentences={rawSentences} fileFormat={fileFormat} />
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="p-2 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-400 flex-shrink-0">
            © 2026 <a href="https://github.com/cyrus07424" target="_blank" className="underline">cyrus</a>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsPanel({
  stats,
  points,
  colorBySpeed,
  setColorBySpeed,
}: {
  stats: TrackStats;
  points: GpsPoint[];
  colorBySpeed: boolean;
  setColorBySpeed: (v: boolean) => void;
}) {
  const hasSpeeds = points.some((p) => p.speed !== undefined);
  const hasAlt = points.some((p) => p.altitude !== undefined);

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="ポイント数" value={`${stats.pointCount.toLocaleString()} pt`} />
        <StatItem
          label="総距離"
          value={
            stats.totalDistanceKm >= 1
              ? `${stats.totalDistanceKm.toFixed(2)} km`
              : `${(stats.totalDistanceKm * 1000).toFixed(0)} m`
          }
        />
        <StatItem label="開始時刻" value={formatDateTime(stats.startTime)} />
        <StatItem label="終了時刻" value={formatDateTime(stats.endTime)} />
        <StatItem label="記録時間" value={formatDuration(stats.durationSeconds)} />
        {hasSpeeds && (
          <>
            <StatItem label="最高速度" value={`${stats.maxSpeedKmh.toFixed(1)} km/h`} />
            <StatItem label="平均速度" value={`${stats.avgSpeedKmh.toFixed(1)} km/h`} />
          </>
        )}
        {hasAlt && (
          <>
            <StatItem label="最高高度" value={`${stats.maxAltitude.toFixed(1)} m`} />
            <StatItem label="最低高度" value={`${stats.minAltitude.toFixed(1)} m`} />
            <StatItem
              label="高度差"
              value={`${(stats.maxAltitude - stats.minAltitude).toFixed(1)} m`}
            />
          </>
        )}
      </div>

      {/* Position accuracy statistics */}
      {stats.cep50 !== undefined && stats.drms2 !== undefined && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">測位精度統計</p>
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="CEP 50%" value={`${stats.cep50.toFixed(2)} m`} />
            <StatItem label="2drms" value={`${stats.drms2.toFixed(2)} m`} />
            {stats.meanLat !== undefined && stats.meanLng !== undefined && (
              <>
                <StatItem label="平均緯度" value={stats.meanLat.toFixed(6) + "°"} />
                <StatItem label="平均経度" value={stats.meanLng.toFixed(6) + "°"} />
              </>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ※ CEP 50%: 全測位点の50%が収まる半径 / 2drms: 2×√(σ²E+σ²N)
          </p>
        </div>
      )}

      {/* Display options */}
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">表示オプション</p>
        {hasSpeeds && (
          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={colorBySpeed}
              onChange={(e) => setColorBySpeed(e.target.checked)}
              className="rounded"
            />
            速度に応じてルートを色分け
          </label>
        )}
      </div>
    </div>
  );
}

type ChartId = "speed" | "alt" | "satellites" | "scatter" | "enu";

function ChartPanel({ points }: { points: GpsPoint[] }) {
  const hasSpeeds = points.some((p) => p.speed !== undefined);
  const hasAlt = points.some((p) => p.altitude !== undefined);
  const hasSatellites = points.some((p) => p.satellites !== undefined);

  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    lines: string[];
    chartId: ChartId;
  } | null>(null);

  // Compute ENU coordinates relative to mean position
  const enuData = useMemo(() => {
    if (points.length === 0) return [];
    const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const meanLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    const alts = points.filter((p) => p.altitude !== undefined).map((p) => p.altitude as number);
    const meanAlt = alts.length > 0 ? alts.reduce((s, a) => s + a, 0) / alts.length : 0;
    const R = 6371000;
    const cosLat = Math.cos((meanLat * Math.PI) / 180);
    return points.map((p) => ({
      e: R * cosLat * ((p.lng - meanLng) * Math.PI) / 180,
      n: R * ((p.lat - meanLat) * Math.PI) / 180,
      u: p.altitude !== undefined ? p.altitude - meanAlt : 0,
      hasAlt: p.altitude !== undefined,
      timestamp: p.timestamp,
    }));
  }, [points]);

  if (!hasSpeeds && !hasAlt && !hasSatellites && enuData.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        グラフデータがありません。
      </div>
    );
  }

  // Downsample to max 200 points for time-series performance
  const step = Math.max(1, Math.floor(points.length / 200));
  const sampled = points.filter((_, i) => i % step === 0);
  const enuSampled = enuData.filter((_, i) => i % step === 0);

  // Scatter: max 500 points
  const scatterStep = Math.max(1, Math.floor(enuData.length / 500));
  const scatterData = enuData.filter((_, i) => i % scatterStep === 0);

  const chartWidth = 260;
  const chartHeight = 80;

  const renderSvgTooltip = (
    x: number,
    y: number,
    lines: string[],
    cw = chartWidth,
    ch = chartHeight
  ) => {
    const PADDING = 5;
    const LINE_H = 13;
    const tooltipW = 160;
    const tooltipH = lines.length * LINE_H + PADDING * 2;
    const tx = x > cw / 2 ? x - tooltipW - 4 : x + 4;
    const ty = Math.max(2, Math.min(y - tooltipH / 2, ch - tooltipH - 2));
    return (
      <g style={{ pointerEvents: "none" }}>
        <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={3} ry={3} fill="rgba(0,0,0,0.72)" />
        {lines.map((line, i) => (
          <text
            key={i}
            x={tx + PADDING}
            y={ty + PADDING + (i + 1) * LINE_H - 2}
            fontSize="10"
            fill="white"
            fontFamily="sans-serif"
          >
            {line}
          </text>
        ))}
      </g>
    );
  };

  // Speed chart
  const maxSpeed = Math.max(...sampled.map((p) => p.speed ?? 0));

  // Altitude chart
  const altSampled = sampled.filter((p) => p.altitude !== undefined);
  const minAlt = altSampled.length ? Math.min(...altSampled.map((p) => p.altitude!)) : 0;
  const maxAlt = altSampled.length ? Math.max(...altSampled.map((p) => p.altitude!)) : 0;
  const altRange = maxAlt - minAlt || 1;

  // Satellites chart
  const satSampled = sampled.filter((p) => p.satellites !== undefined);
  const maxSat = satSampled.length ? Math.max(...satSampled.map((p) => p.satellites!)) : 1;

  // ENU deviation chart — common y-axis across E, N (and U if altitude exists)
  const enuEN = enuSampled;
  const enuU = enuSampled.filter((d) => d.hasAlt);
  const allVals = [
    ...enuEN.map((d) => d.e),
    ...enuEN.map((d) => d.n),
    ...(hasAlt ? enuU.map((d) => d.u) : []),
  ];
  const enuMin = allVals.length ? Math.min(...allVals) : -1;
  const enuMax = allVals.length ? Math.max(...allVals) : 1;
  const enuRange = enuMax - enuMin || 1;
  const enuToY = (v: number) => chartHeight - ((v - enuMin) / enuRange) * chartHeight;

  // Scatter — equal aspect ratio around centroid
  const scatterEMin = scatterData.length ? Math.min(...scatterData.map((d) => d.e)) : -1;
  const scatterEMax = scatterData.length ? Math.max(...scatterData.map((d) => d.e)) : 1;
  const scatterNMin = scatterData.length ? Math.min(...scatterData.map((d) => d.n)) : -1;
  const scatterNMax = scatterData.length ? Math.max(...scatterData.map((d) => d.n)) : 1;
  const scatterSpan = Math.max(scatterEMax - scatterEMin, scatterNMax - scatterNMin, 0.001);
  const scatterEMid = (scatterEMax + scatterEMin) / 2;
  const scatterNMid = (scatterNMax + scatterNMin) / 2;
  const scatterSize = 200;
  const pad = 10;
  const inner = scatterSize - pad * 2;
  const toSX = (e: number) => pad + ((e - scatterEMid) / scatterSpan + 0.5) * inner;
  const toSY = (n: number) => pad + (1 - ((n - scatterNMid) / scatterSpan + 0.5)) * inner;

  return (
    <div className="p-3 space-y-4">
      {/* Speed */}
      {hasSpeeds && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">速度 (km/h)</p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <polyline
              points={sampled
                .map((p, i) => {
                  const x = (i / (sampled.length - 1 || 1)) * chartWidth;
                  const y = chartHeight - ((p.speed ?? 0) / (maxSpeed || 1)) * chartHeight;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
            />
            {sampled.map((p, i) => {
              const x = (i / (sampled.length - 1 || 1)) * chartWidth;
              const y = chartHeight - ((p.speed ?? 0) / (maxSpeed || 1)) * chartHeight;
              const lines = [
                `速度: ${(p.speed ?? 0).toFixed(1)} km/h`,
                ...(p.timestamp ? [p.timestamp.toLocaleString()] : []),
              ];
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={6}
                  fill="transparent"
                  stroke="none"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredPoint({ x, y, lines, chartId: "speed" })}
                />
              );
            })}
            {hoveredPoint?.chartId === "speed" &&
              renderSvgTooltip(hoveredPoint.x, hoveredPoint.y, hoveredPoint.lines)}
          </svg>
          <p className="text-xs text-gray-400 text-right">最大 {maxSpeed.toFixed(1)} km/h</p>
        </div>
      )}

      {/* Altitude */}
      {hasAlt && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">高度 (m)</p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <polyline
              points={altSampled
                .map((p, i, arr) => {
                  const x = (i / (arr.length - 1 || 1)) * chartWidth;
                  const y = chartHeight - ((p.altitude! - minAlt) / altRange) * chartHeight;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
            />
            {altSampled.map((p, i, arr) => {
              const x = (i / (arr.length - 1 || 1)) * chartWidth;
              const y = chartHeight - ((p.altitude! - minAlt) / altRange) * chartHeight;
              const lines = [
                `高度: ${p.altitude!.toFixed(1)} m`,
                ...(p.timestamp ? [p.timestamp.toLocaleString()] : []),
              ];
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={6}
                  fill="transparent"
                  stroke="none"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredPoint({ x, y, lines, chartId: "alt" })}
                />
              );
            })}
            {hoveredPoint?.chartId === "alt" &&
              renderSvgTooltip(hoveredPoint.x, hoveredPoint.y, hoveredPoint.lines)}
          </svg>
          <p className="text-xs text-gray-400 text-right">
            {minAlt.toFixed(0)}m〜{maxAlt.toFixed(0)}m
          </p>
        </div>
      )}

      {/* Satellites */}
      {hasSatellites && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">衛星数</p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <polyline
              points={satSampled
                .map((p, i, arr) => {
                  const x = (i / (arr.length - 1 || 1)) * chartWidth;
                  const y = chartHeight - (p.satellites! / (maxSat || 1)) * chartHeight;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#a855f7"
              strokeWidth="1.5"
            />
            {satSampled.map((p, i, arr) => {
              const x = (i / (arr.length - 1 || 1)) * chartWidth;
              const y = chartHeight - (p.satellites! / (maxSat || 1)) * chartHeight;
              const lines = [
                `衛星数: ${p.satellites} 個`,
                ...(p.timestamp ? [p.timestamp.toLocaleString()] : []),
              ];
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={6}
                  fill="transparent"
                  stroke="none"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredPoint({ x, y, lines, chartId: "satellites" })}
                />
              );
            })}
            {hoveredPoint?.chartId === "satellites" &&
              renderSvgTooltip(hoveredPoint.x, hoveredPoint.y, hoveredPoint.lines)}
          </svg>
          <p className="text-xs text-gray-400 text-right">最大 {maxSat} 個</p>
        </div>
      )}

      {/* Position scatter — East vs North */}
      {enuData.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            Position scatter — East vs North (m)
          </p>
          <svg
            viewBox={`0 0 ${scatterSize} ${scatterSize}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Crosshairs at origin (mean position) */}
            <line
              x1={toSX(0)} y1={pad}
              x2={toSX(0)} y2={scatterSize - pad}
              stroke="#d1d5db" strokeWidth="0.5"
              aria-label="North axis"
            >
              <title>North axis (mean position)</title>
            </line>
            <line
              x1={pad} y1={toSY(0)}
              x2={scatterSize - pad} y2={toSY(0)}
              stroke="#d1d5db" strokeWidth="0.5"
              aria-label="East axis"
            >
              <title>East axis (mean position)</title>
            </line>
            {/* Axis labels */}
            <text x={scatterSize - pad - 2} y={toSY(0) - 2} fontSize="10" fill="#9ca3af" textAnchor="end" fontFamily="sans-serif">E</text>
            <text x={toSX(0) + 2} y={pad + 10} fontSize="10" fill="#9ca3af" fontFamily="sans-serif">N</text>
            {/* Data points */}
            {scatterData.map((d, i) => (
              <circle
                key={i}
                cx={toSX(d.e)}
                cy={toSY(d.n)}
                r={2}
                fill="#3b82f6"
                fillOpacity={0.55}
                style={{ cursor: "crosshair" }}
                onMouseEnter={() =>
                  setHoveredPoint({
                    x: toSX(d.e),
                    y: toSY(d.n),
                    lines: [
                      `E: ${d.e.toFixed(2)} m`,
                      `N: ${d.n.toFixed(2)} m`,
                      ...(d.timestamp ? [d.timestamp.toLocaleString()] : []),
                    ],
                    chartId: "scatter",
                  })
                }
              />
            ))}
            {hoveredPoint?.chartId === "scatter" &&
              renderSvgTooltip(hoveredPoint.x, hoveredPoint.y, hoveredPoint.lines, scatterSize, scatterSize)}
          </svg>
          <p className="text-xs text-gray-400 text-right">
            span {scatterSpan.toFixed(2)} m
          </p>
        </div>
      )}

      {/* ENU deviation from mean */}
      {enuData.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            ENU deviation from mean (m)
          </p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Zero line */}
            <line
              x1={0} y1={enuToY(0)}
              x2={chartWidth} y2={enuToY(0)}
              stroke="#d1d5db" strokeWidth="0.5" strokeDasharray="3,3"
            />
            {/* East (blue) */}
            <polyline
              points={enuEN
                .map((d, i, arr) => `${(i / (arr.length - 1 || 1)) * chartWidth},${enuToY(d.e)}`)
                .join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.5"
            />
            {/* North (green) */}
            <polyline
              points={enuEN
                .map((d, i, arr) => `${(i / (arr.length - 1 || 1)) * chartWidth},${enuToY(d.n)}`)
                .join(" ")}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
            />
            {/* Up (amber, only when altitude available) */}
            {hasAlt && enuU.length > 1 && (
              <polyline
                points={enuU
                  .map((d, i, arr) => `${(i / (arr.length - 1 || 1)) * chartWidth},${enuToY(d.u)}`)
                  .join(" ")}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
            )}
            {/* Hover hit-area per sample */}
            {enuEN.map((d, i, arr) => {
              const x = (i / (arr.length - 1 || 1)) * chartWidth;
              const y = enuToY(d.e);
              const lines = [
                `E: ${d.e.toFixed(2)} m`,
                `N: ${d.n.toFixed(2)} m`,
                ...(d.hasAlt ? [`U: ${d.u.toFixed(2)} m`] : []),
                ...(d.timestamp ? [d.timestamp.toLocaleString()] : []),
              ];
              return (
                <rect
                  key={i}
                  x={x - 4}
                  y={0}
                  width={8}
                  height={chartHeight}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredPoint({ x, y, lines, chartId: "enu" })}
                />
              );
            })}
            {hoveredPoint?.chartId === "enu" &&
              renderSvgTooltip(hoveredPoint.x, hoveredPoint.y, hoveredPoint.lines)}
          </svg>
          <div className="flex gap-3 mt-1 text-xs">
            <span className="text-blue-500">■ East</span>
            <span className="text-emerald-500">■ North</span>
            {hasAlt && <span className="text-amber-500">■ Up</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Satellite Panel ──────────────────────────────────────────────────────────

/** Colour scheme per satellite constellation. */
const CONSTELLATION_COLORS: Record<Constellation, string> = {
  GPS:      "#3b82f6", // blue
  GLONASS:  "#ef4444", // red
  Galileo:  "#10b981", // green
  BeiDou:   "#f59e0b", // amber
  QZSS:     "#a855f7", // purple
  SBAS:     "#6b7280", // gray
  Unknown:  "#9ca3af", // light gray
};

function SatellitePanel({
  satellites,
  fileFormat,
}: {
  satellites: SatelliteInfo[];
  fileFormat: FileFormat;
}) {
  if (fileFormat !== "nmea") {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        衛星データはNMEAファイルのみ表示できます。
      </div>
    );
  }
  if (satellites.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        衛星データがありません (GSVセンテンスが含まれていないか確認してください)。
      </div>
    );
  }

  const SIZE  = 200; // viewBox side length for skyplot
  const CX    = SIZE / 2;
  const CY    = SIZE / 2;
  const R     = 90;  // radius of the 0° elevation ring

  /**
   * Convert elevation / azimuth to SVG (x, y) on the polar plot.
   * 90° elevation → centre, 0° elevation → outer edge.
   * 0° azimuth = North = top.
   */
  function toSkyXY(elevation: number, azimuth: number) {
    const r   = R * (1 - Math.max(0, Math.min(90, elevation)) / 90);
    const rad = (azimuth * Math.PI) / 180;
    return {
      x: CX + r * Math.sin(rad),
      y: CY - r * Math.cos(rad),
    };
  }

  return (
    <div className="p-3 space-y-4">
      {/* Legend */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
          衛星 ({satellites.length} 機) — スカイプロット
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
          {(Object.entries(CONSTELLATION_COLORS) as [Constellation, string][])
            .filter(([c]) => satellites.some((s) => s.constellation === c))
            .map(([c, color]) => (
              <span key={c} className="text-xs flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <circle cx="5" cy="5" r="4" fill={color} />
                </svg>
                {c}
              </span>
            ))}
          <span className="text-xs text-gray-400" aria-label="凡例: 塗りつぶし円 = 測位に使用中, 空白円 = 捕捉中だが未使用">
            <span aria-hidden="true">●</span> 測位使用中 / <span aria-hidden="true">○</span> 捕捉中(未使用)
          </span>
        </div>

        {/* ── Skyplot ── */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
          aria-label="Skyplot"
        >
          {/* Elevation rings: 0°, 30°, 60°, 90° */}
          {[0, 30, 60].map((el) => {
            const r = R * (1 - el / 90);
            return (
              <circle
                key={el}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="#d1d5db"
                strokeWidth="0.5"
              />
            );
          })}
          {/* Crosshairs */}
          <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="#d1d5db" strokeWidth="0.5" />
          <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="#d1d5db" strokeWidth="0.5" />
          {/* Cardinal direction labels */}
          <text x={CX} y={CY - R - 4} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">N</text>
          <text x={CX} y={CY + R + 11} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">S</text>
          <text x={CX + R + 4} y={CY + 3} textAnchor="start" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">E</text>
          <text x={CX - R - 4} y={CY + 3} textAnchor="end" fontSize="9" fill="#9ca3af" fontFamily="sans-serif">W</text>
          {/* Elevation ring labels */}
          <text x={CX + 2} y={CY - R * (1 - 30 / 90) - 2} fontSize="7" fill="#9ca3af" fontFamily="sans-serif">30°</text>
          <text x={CX + 2} y={CY - R * (1 - 60 / 90) - 2} fontSize="7" fill="#9ca3af" fontFamily="sans-serif">60°</text>

          {/* Satellites */}
          {satellites.map((sat) => {
            const { x, y } = toSkyXY(sat.elevation, sat.azimuth);
            const color = CONSTELLATION_COLORS[sat.constellation];
            const r = 6;
            const labelOffset = 7;
            return (
              <g key={`${sat.constellation}:${sat.prn}`}>
                <title>{`${sat.constellation} PRN${sat.prn} 仰角:${sat.elevation}° 方位角:${sat.azimuth}° SNR:${sat.snr ?? "—"} dBHz${sat.used ? " ✓測位使用中" : " (未使用)"}`}</title>
                {/* Satellite dot: filled = used in fix, outlined = in view only */}
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={sat.used ? color : "none"}
                  stroke={color}
                  strokeWidth={1.5}
                />
                {/* PRN label */}
                <text
                  x={x + labelOffset}
                  y={y + 3}
                  fontSize="7"
                  fill={color}
                  fontFamily="sans-serif"
                  fontWeight={sat.used ? "bold" : "normal"}
                >
                  {sat.prn}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── SNR Bar Chart ── */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
          SNR (信号強度) — dBHz
        </p>
        <SkyplotSnrBars satellites={satellites} />
      </div>

      {/* ── Satellite Table ── */}
      <div>
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
          衛星一覧
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-1 pr-2">衛星</th>
                <th className="text-right py-1 pr-2">仰角</th>
                <th className="text-right py-1 pr-2">方位角</th>
                <th className="text-right py-1 pr-2">SNR</th>
                <th className="text-center py-1">使用</th>
              </tr>
            </thead>
            <tbody>
              {satellites.map((sat) => {
                const color = CONSTELLATION_COLORS[sat.constellation];
                return (
                  <tr
                    key={`${sat.constellation}:${sat.prn}`}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="py-0.5 pr-2 font-medium" style={{ color }}>
                      {sat.constellation[0]}{sat.prn}
                    </td>
                    <td className="text-right py-0.5 pr-2 text-gray-700 dark:text-gray-300">
                      {sat.elevation}°
                    </td>
                    <td className="text-right py-0.5 pr-2 text-gray-700 dark:text-gray-300">
                      {sat.azimuth}°
                    </td>
                    <td className="text-right py-0.5 pr-2 text-gray-700 dark:text-gray-300">
                      {sat.snr !== null ? sat.snr : "—"}
                    </td>
                    <td className="text-center py-0.5">
                      {sat.used ? (
                        <span className="text-green-600 dark:text-green-400">✓</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Vertical bar chart showing SNR per satellite, colour-coded by constellation. */
function SkyplotSnrBars({ satellites }: { satellites: SatelliteInfo[] }) {
  const tracked = satellites.filter((s) => s.snr !== null);
  if (tracked.length === 0) {
    return (
      <p className="text-xs text-gray-400">SNRデータがありません。</p>
    );
  }
  const maxSnr = Math.max(...tracked.map((s) => s.snr as number), 50);
  const barW   = 14;
  const gap    = 3;
  const chartH = 80;
  const totalW = tracked.length * (barW + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${Math.max(totalW, 200)} ${chartH + 20}`}
      className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
      aria-label="SNR bar chart"
    >
      {/* Reference lines at 30 and 50 dBHz */}
      {[30, 50].map((ref) => {
        const y = chartH - (ref / maxSnr) * chartH;
        return (
          <g key={ref}>
            <line
              x1={0} y1={y}
              x2={Math.max(totalW, 200)} y2={y}
              stroke="#d1d5db"
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
            <text x={2} y={y - 1} fontSize="7" fill="#9ca3af" fontFamily="sans-serif">
              {ref}
            </text>
          </g>
        );
      })}

      {tracked.map((sat, i) => {
        const x   = i * (barW + gap);
        const snr = sat.snr as number;
        const bh  = (snr / maxSnr) * chartH;
        const y   = chartH - bh;
        const color = CONSTELLATION_COLORS[sat.constellation];
        return (
          <g key={`${sat.constellation}:${sat.prn}`}>
            <title>{`${sat.constellation} PRN${sat.prn}: ${snr} dBHz${sat.used ? " (使用中)" : ""}`}</title>
            <rect
              x={x}
              y={y}
              width={barW}
              height={bh}
              fill={sat.used ? color : "none"}
              stroke={color}
              strokeWidth={1}
              rx={1}
            />
            {/* SNR value above bar */}
            <text
              x={x + barW / 2}
              y={y - 1}
              textAnchor="middle"
              fontSize="6"
              fill={color}
              fontFamily="sans-serif"
            >
              {snr}
            </text>
            {/* PRN label below */}
            <text
              x={x + barW / 2}
              y={chartH + 10}
              textAnchor="middle"
              fontSize="7"
              fill={color}
              fontFamily="sans-serif"
              fontWeight={sat.used ? "bold" : "normal"}
            >
              {sat.prn}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RawPanel({ sentences, fileFormat }: { sentences: string[]; fileFormat: FileFormat }) {
  if (fileFormat !== "nmea" || sentences.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        RAWデータはNMEAファイルのみ表示できます。
      </div>
    );
  }
  return (
    <div className="p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        合計 {sentences.length.toLocaleString()} センテンス
      </p>
      <div className="font-mono text-xs bg-gray-900 text-green-400 rounded p-2 h-64 overflow-y-auto whitespace-nowrap">
        {sentences.slice(0, 500).map((s, i) => (
          <div key={i} className="leading-4">{s}</div>
        ))}
        {sentences.length > 500 && (
          <div className="text-gray-500">… 他 {sentences.length - 500} センテンス</div>
        )}
      </div>
    </div>
  );
}
