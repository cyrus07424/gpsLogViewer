"use client";

import { useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { parseNmea, computeStats, type GpsPoint, type TrackStats } from "../lib/nmeaParser";

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

export default function NmeaViewer() {
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [stats, setStats] = useState<TrackStats | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"stats" | "chart" | "raw">("stats");
  const [rawSentences, setRawSentences] = useState<string[]>([]);
  const [colorBySpeed, setColorBySpeed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseNmea(content);
      setPoints(result.points);
      setStats(computeStats(result.points));
      setErrors(result.errors);
      setRawSentences(result.rawSentences);
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
    setErrors([]);
    setRawSentences([]);
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
            <h1 className="text-lg font-bold">🗺 NMEA Viewer</h1>
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
                accept=".nmea,.txt,.log,.nma"
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
                    📂 NMEAファイルをここにドロップ
                  </p>
                  <p className="text-xs text-gray-400 mt-1">またはクリックして選択</p>
                  <p className="text-xs text-gray-400">(.nmea / .txt / .log)</p>
                </div>
              )}
            </div>
            {fileName && (
              <button
                onClick={handleClear}
                className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
              >
                クリア
              </button>
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
                {(["stats", "chart", "raw"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {tab === "stats" ? "統計" : tab === "chart" ? "グラフ" : "RAW"}
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
                {activeTab === "raw" && (
                  <RawPanel sentences={rawSentences} />
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

function ChartPanel({ points }: { points: GpsPoint[] }) {
  const hasSpeeds = points.some((p) => p.speed !== undefined);
  const hasAlt = points.some((p) => p.altitude !== undefined);

  if (!hasSpeeds && !hasAlt) {
    return (
      <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
        速度・高度データがありません。
      </div>
    );
  }

  // Downsample to max 200 points for chart performance
  const step = Math.max(1, Math.floor(points.length / 200));
  const sampled = points.filter((_, i) => i % step === 0);

  const maxSpeed = Math.max(...sampled.map((p) => p.speed ?? 0));
  const minAlt = Math.min(...sampled.filter((p) => p.altitude !== undefined).map((p) => p.altitude!));
  const maxAlt = Math.max(...sampled.filter((p) => p.altitude !== undefined).map((p) => p.altitude!));
  const altRange = maxAlt - minAlt || 1;

  const chartWidth = 260;
  const chartHeight = 80;

  return (
    <div className="p-3 space-y-4">
      {hasSpeeds && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            速度 (km/h)
          </p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
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
          </svg>
          <p className="text-xs text-gray-400 text-right">
            最大 {maxSpeed.toFixed(1)} km/h
          </p>
        </div>
      )}
      {hasAlt && (
        <div>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
            高度 (m)
          </p>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800"
          >
            <polyline
              points={sampled
                .filter((p) => p.altitude !== undefined)
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
          </svg>
          <p className="text-xs text-gray-400 text-right">
            {minAlt.toFixed(0)}m〜{maxAlt.toFixed(0)}m
          </p>
        </div>
      )}
    </div>
  );
}

function RawPanel({ sentences }: { sentences: string[] }) {
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
