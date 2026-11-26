# LeetCode Contest Tracker (Standalone Mobile App)

A standalone, on-device **Expo / React Native** mobile application for tracking student participation in LeetCode Weekly Contests directly from an Excel roster — no backend server required.

## Features

- **Excel Roster Upload (`.xlsx` / `.xlsm`)**:
  - Automatically detects student name and LeetCode profile URL / username columns (with flexible header aliases).
  - Preserves any extra columns (e.g., Register Number, Department, Section) in both the summary and exported workbook.
  - Validates usernames, extracts handles from `leetcode.com/u/<username>/` links, and flags invalid or duplicate rows.
  - Includes a built-in sample Excel template generator.
- **On-Device LeetCode GraphQL Engine**:
  - Queries `https://leetcode.com/graphql` directly from the device with concurrency control (`MAX_CONCURRENCY = 3`), jittered request delays, timeout handling, and automatic retry/backoff on `429` / `5xx` responses.
  - Detects **1–5 contest accounts** using `userContestBaseRating` (publicly available without login) and marks them as **`Active`** with their attended count and rating in Summary, and **`No History`** in the Latest Weekly Contest view (since LeetCode hides per-contest history until a user has attended 6+ contests).
  - Fetches full `userContestRankingHistory` for **6+ contest accounts** and verifies whether each student participated in the **Latest Weekly Contest** (`Participated` vs `Not Participated`).
- **Interactive Results Preview**:
  - KPI dashboard (`Active`, `Never Joined`, `Unavailable`, `Weekly Contests`).
  - Tabs for **Latest Contest**, **Summary**, and **Historical** weekly contests with search filtering.
- **Formatted Excel Report Export**:
  - Generates a multi-sheet `.xlsx` workbook (`Summary`, `Latest Weekly Contest`, and individual sheets for each historical weekly contest) with color-coded status badges, frozen headers, auto-filters, and column widths.
  - Share/save directly on Android/iOS via `expo-sharing` and `expo-file-system`, or download in browser on web.
- **Offline Job History**:
  - Persists job metadata and preview payloads locally via `AsyncStorage` and `expo-file-system`.

## Tech Stack

- **Language**: TypeScript (`~6.0.3`)
- **Framework**: React Native (`0.88.1`) with Expo (`~58.0.26`)
- **Navigation**: `@react-navigation/native` & `@react-navigation/native-stack`
- **Excel Processing**: `exceljs` (`^4.4.0`) + `buffer`
- **Device Storage & Files**: `@react-native-async-storage/async-storage`, `expo-document-picker`, `expo-file-system`, `expo-sharing`
- **UI Icons**: `@expo/vector-icons` (`MaterialCommunityIcons`)
- **API**: LeetCode Public GraphQL API (`https://leetcode.com/graphql`)

## Project Structure

```text
standalone-app/
├── App.tsx                         # Root navigation stack & theme
├── index.ts                        # Entry point with polyfills
├── app.json                        # Expo app & Android package config
├── eas.json                        # EAS Build profiles (APK output)
└── src/
    ├── components/                 # Reusable Card & StatusBadge UI
    ├── engine/
    │   ├── excelParser.ts          # Parses & validates uploaded .xlsx rosters
    │   ├── leetcodeClient.ts       # Queries LeetCode GraphQL (weekly history + base rating)
    │   ├── aggregator.ts           # Builds Summary, Latest, & Historical datasets
    │   ├── excelGenerator.ts       # Exports styled multi-sheet .xlsx reports
    │   └── jobRunner.ts            # Concurrent job queue, progress updates, & persistence
    ├── screens/                    # Home, Upload, Processing, ResultsPreview, Download, History
    ├── theme/colors.ts             # App color palette
    └── types/api.ts                # TypeScript interfaces & navigation types
```

## Getting Started

### Prerequisites
- Node.js (LTS)
- npm

### Install & Run Locally

```bash
npm install
npx expo start
```

### Typecheck & Lint

```bash
npx tsc --noEmit
npx expo lint
```

### Build Android APK (EAS Cloud Build)

`eas.json` is pre-configured with `"buildType": "apk"` for `preview` and `production`:

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

## License

See [LICENSE](LICENSE).
