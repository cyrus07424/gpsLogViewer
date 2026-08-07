# Wigle CSV Format Support

## 概要

GPS Log Viwerが、Wigle CSVフォーマットに対応しました。WiFi、Bluetooth、基地局のデータを地図上に表示・分析できます。

## サポートするファイルフォーマット

### 1. WiFi CSV
```
MAC,SSID,AuthMode,FirstSeen,Channel,Frequency,Signal,Latitude,Longitude,Altitude,AccuracyM
AA:BB:CC:DD:EE:FF,MyNetwork,WPA2,2024-01-01,6,2437,-45.5,35.6762,139.7670,100
```

### 2. Bluetooth CSV
```
MAC,Name,Frequency,FirstSeen,Signal,Latitude,Longitude,Altitude
AA:BB:CC:DD:EE:00,Device Name,2402,-50.0,35.6762,139.7670,100
```

### 3. Cell Tower CSV
```
CellID,CellLAC,CellLAC,CellProvider,CellSignal,FirstSeen,Latitude,Longitude,Altitude
1234567890,1000,100,NTT Docomo,-75,2024-01-01,35.6762,139.7670,100
```

## 機能

### ✓ 実装済み機能

1. **Wigle CSV読み込み**
   - WiFi、Bluetooth、基地局データの自動検出
   - カラム名の柔軟な対応（大文字小文字区別なし）

2. **電波強度に基づくカバレッジエリア表示**
   - 信号強度をメートル単位のカバレッジ半径に変換（-30dBm=300m, -100dBm=10m）
   - WiFiの場合、最大で半径300mの円として表示
   - **複数のネットワークが重なった場所を自動検出し、より濃い色で表示**（ヒートマップ効果）

3. **複数ログの重なり検出**
   - 各ネットワークの周辺（200m以内）に何個のネットワークがあるか自動計算
   - 周辺にネットワークが多いほど円のマーカー（中心点）が太くなる
   - ツールチップに「Nearby networks: N」として近隣ネットワーク数を表示

4. **選択と強調表示**
   - ネットワークをクリックして選択
   - 同じタイプの周辺ネットワークをハイライト表示
   - 選択されたネットワークの詳細情報を表示

5. **Networks タブ**
   - WiFi、Bluetooth、基地局を別々に表示
   - 信号強度でソート可能
   - 詳細情報表示（MAC、SSID、周波数、高度など）

### 視覚化のポイント

#### 1. カバレッジ円（大きな半透明円）
- 電波がカバーしている推定範囲
- 信号強度が強いほど（-30dBmに近いほど）大きな円
- **複数のネットワークが重なっている場所は、透明度が上がり、より視認性が向上**

#### 2. 中心マーカー（小さな濃い円）
- ネットワークの正確な位置
- 色は信号強度を表現
- 周辺にネットワークが多いほど、線が太くなる（密度が高いホットスポット）

#### 3. 信号強度の表示

- **強** (>-67 dBm): 緑色 🟢 → カバレッジ280m〜300m
- **中** (-80 ~ -67 dBm): 黄色 🟡 → カバレッジ140m〜280m
- **弱** (<-80 dBm): 赤色 🔴 → カバレッジ10m〜140m

## 使用方法

1. Wigle CSVファイル（`.csv`）を選択
2. ファイルをドロップまたは選択
3. 「Networks」タブを開く
4. 任意のネットワークをクリックして選択
5. 地図上で同じタイプの周辺ネットワークがハイライト表示される

## テスト用サンプルファイル

以下のようなCSVファイルで試験可能です：

### sample_wifi.csv
```csv
MAC,SSID,AuthMode,FirstSeen,Channel,Frequency,Signal,Latitude,Longitude,Altitude
AA:BB:CC:DD:EE:01,HomeNetwork,WPA2,2024-01-01,1,2412,-45,35.6762,139.7670,10
AA:BB:CC:DD:EE:02,GuestWiFi,WPA2,2024-01-01,6,2437,-60,35.6765,139.7675,10
AA:BB:CC:DD:EE:03,OfficeNet,WPA2,2024-01-01,11,2462,-72,35.6768,139.7680,10
```

### sample_bluetooth.csv
```csv
MAC,Name,Frequency,FirstSeen,Signal,Latitude,Longitude,Altitude
AA:00:11:22:33:44,Phone_Device,2402,2024-01-01,-50,35.6762,139.7670,10
AA:00:11:22:33:45,Headphones,2402,2024-01-01,-65,35.6765,139.7675,10
```

### sample_cell.csv
```csv
CellID,CellLAC,CellProvider,CellSignal,FirstSeen,Latitude,Longitude,Altitude
123456789,1000,NTT Docomo,-75,2024-01-01,35.6762,139.7670,10
123456790,1000,NTT Docomo,-82,2024-01-01,35.6765,139.7675,10
```

## 実装の詳細

### ファイル構成

- `app/lib/wigleParser.ts` - Wigle CSVパーサー
- `app/components/MapView.tsx` - マップ表示（ネットワークレイヤー追加）
- `app/components/NmeaViewer.tsx` - UI（Networksタブ追加）

### 新しい型定義

```typescript
export interface RadioNetwork {
  mac: string;
  ssid?: string;           // WiFi用
  name?: string;           // Bluetooth用
  signal: number;          // dBm
  frequency?: number;      // MHz
  channel?: number;        // WiFi channel
  firstSeen?: Date;
  lat: number;
  lng: number;
  altitude?: number;       // meters
  type: "wifi" | "bluetooth" | "cell";
  provider?: string;       // Cell tower用
  cellId?: string;
}
```

## 今後の拡張予定

- [ ] CSVエクスポート機能
- [ ] 信号強度のタイムシリーズ表示
- [ ] ネットワーク検索/フィルタリング
- [ ] 周波数別の色分け表示
- [ ] KML/GPXへのネットワークデータ変換
- [ ] 密度ベースのクラスタリング表示

## 技術詳細

### 信号強度の変換式

```
Coverage Radius (m) = 10 + ((signal + 100) / 70) × 290
例：
  - signal = -30 dBm → radius ≈ 300m
  - signal = -65 dBm → radius ≈ 150m
  - signal = -100 dBm → radius ≈ 10m
```

### ネットワーク密度の計算

```
各ネットワークについて：
1. 周辺200m以内のネットワーク数をカウント
2. 密度 = (周辺ネットワーク数) / (最大密度)
3. カバレッジ円の透明度 = 0.08 + (密度 × 0.12)
4. 中心マーカーの線の太さ = 1.5 + (密度 × 1.0)
```

## 参考

- [Wigle CSV Format](https://api.wigle.net/csvFormat.html)
- [Wigle Database](https://wigle.net/)
- [Free Space Path Loss Formula](https://en.wikipedia.org/wiki/Free-space_path_loss)



