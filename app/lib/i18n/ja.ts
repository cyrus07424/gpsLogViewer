import { type Translations } from "./index";

export const ja: Translations = {
  // Site metadata
  siteTitle: "GPS Log Viewer — GPS履歴マップ表示・分析ツール",
  siteDescription: "NMEAファイルをアップロードしてGPS履歴を地図上に表示・分析するツール",

  // App header
  appSubtitle: "GPS履歴マップ表示・分析ツール",

  // File upload
  loading: "読み込み中…",
  selectAnotherFile: "別のファイルを選択",
  dropFileHere: "📂 GPSログファイルをここにドロップ",
  orClickToSelect: "またはクリックして選択",
  supportedFormats: "(.nmea / .gpx / .kml / .kmz / .txt / .log)",
  clearButton: "クリア",
  exportToGpx: "⬇ GPXに変換",
  exportToKml: "⬇ KMLに変換",
  noGpsCoordinates: "GPS座標が見つかりませんでした。",
  fileReadError: "ファイルの読み込みに失敗しました。",

  // Errors
  errorsMore: (n) => `他 ${n} 件`,

  // Panel toggle
  closePanel: "パネルを閉じる",
  openPanel: "パネルを開く",

  // Tabs
  tabStats: "統計",
  tabChart: "グラフ",
  tabSatellite: "衛星",
  tabRaw: "RAW",

  // Stats panel
  pointCount: "ポイント数",
  totalDistance: "総距離",
  startTime: "開始時刻",
  endTime: "終了時刻",
  duration: "記録時間",
  maxSpeed: "最高速度",
  avgSpeed: "平均速度",
  maxAltitude: "最高高度",
  minAltitude: "最低高度",
  altitudeDiff: "高度差",
  positionAccuracyTitle: "測位精度統計",
  meanLat: "平均緯度",
  meanLng: "平均経度",
  cepNote: "※ CEP 50%: 全測位点の50%が収まる半径 / 2drms: 2×√(σ²E+σ²N)",
  displayOptionsTitle: "表示オプション",
  colorBySpeed: "速度に応じてルートを色分け",

  // Chart panel
  noChartData: "グラフデータがありません。",
  speedChartTitle: "速度 (km/h)",
  speedMax: (max) => `最大 ${max} km/h`,
  altChartTitle: "高度 (m)",
  altRangeLabel: (min, max) => `${min}m〜${max}m`,
  satChartTitle: "衛星数",
  satMax: (max) => `最大 ${max} 個`,

  // Chart tooltips
  speedTooltip: (v) => `速度: ${v} km/h`,
  altTooltip: (v) => `高度: ${v} m`,
  satTooltip: (v) => `衛星数: ${v} 個`,

  // Satellite panel
  satelliteNmeaOnly: "衛星データはNMEAファイルのみ表示できます。",
  noSatelliteData:
    "衛星データがありません (GSVセンテンスが含まれていないか確認してください)。",
  satelliteSkyplot: (count) => `衛星 (${count} 機) — スカイプロット`,
  inUse: "測位使用中",
  inView: "捕捉中(未使用)",
  snrChartTitle: "SNR (信号強度) — dBHz",
  satelliteListTitle: "衛星一覧",
  satColSat: "衛星",
  satColElevation: "仰角",
  satColAzimuth: "方位角",
  satColSnr: "SNR",
  satColUsed: "使用",
  noSnrData: "SNRデータがありません。",
  satTooltipTitle: (constellation, prn, elevation, azimuth, snr, used) =>
    `${constellation} PRN${prn} 仰角:${elevation}° 方位角:${azimuth}° SNR:${snr} dBHz${used ? " ✓測位使用中" : " (未使用)"}`,
  snrBarTooltip: (constellation, prn, snr, used) =>
    `${constellation} PRN${prn}: ${snr} dBHz${used ? " (使用中)" : ""}`,

  // Raw panel
  rawNmeaOnly: "RAWデータはNMEAファイルのみ表示できます。",
  rawTotalSentences: (n) => `合計 ${n} センテンス`,
  rawMoreSentences: (n) => `… 他 ${n} センテンス`,

  // Playback controls
  pause: "一時停止",
  play: "再生",
  speedSliderLabel: "再生速度スライダー",
  speedPresetTitle: "再生速度プリセット（ホバーで無段階調整）",
  switchToArrow: "矢印マーカーに切り替え",
  switchToCircle: "丸マーカーに切り替え",
  centerOnMarkerOnTitle: "マーカー中央固定: ON（クリックでOFF）",
  centerOnMarkerOffTitle: "マーカー中央固定: OFF（クリックでON）",
  centerOnMarkerOnLabel: "マーカー中央固定をオフにする",
  centerOnMarkerOffLabel: "マーカー中央固定をオンにする",
  headingUpOnTitle: "ヘディングアップ: ON（クリックでノースアップへ）",
  headingUpOffTitle: "ノースアップ: ON（クリックでヘディングアップへ）",
  headingUpOnLabel: "ノースアップに切り替え",
  headingUpOffLabel: "ヘディングアップに切り替え",
  playbackPositionLabel: "再生位置",

  // Map tooltip labels
  mapSpeed: "速度",
  mapAltitude: "高度",
  mapSatellites: "衛星数",
  mapStartMarker: "スタート",
  mapEndMarker: "ゴール",

  // Language toggle
  languageToggle: "English",
};
