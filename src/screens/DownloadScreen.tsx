import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { getJobStatus, getOutputBytesForWeb } from '../engine/jobRunner';
import { Colors } from '../theme/colors';
import { JobStatusResponse, RootStackParamList } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Download'>;

export const DownloadScreen: React.FC<Props> = ({ route, navigation }) => {
  const { jobId, filename } = route.params;
  const [statusData, setStatusData] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getJobStatus(jobId)
      .then((res) => {
        setStatusData(res);
        if (res.output_uri && Platform.OS !== 'web') {
          setSavedPath(res.output_uri);
        }
        setErrorMsg(null);
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load job details.');
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  const outputName =
    statusData?.output_filename || filename || `leetcode_contests_${jobId}.xlsx`;

  const handleOpenOrShare = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      if (Platform.OS === 'web') {
        const bytes = await getOutputBytesForWeb(jobId);
        if (!bytes) {
          throw new Error('Excel file buffer is no longer in browser memory.');
        }
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = outputName;
        link.click();
        URL.revokeObjectURL(url);
        setSavedPath(`Downloaded ${outputName}`);
        return;
      }

      if (!statusData?.output_uri) {
        throw new Error('Generated Excel file path is missing.');
      }

      const localFile = new File(statusData.output_uri);
      if (!localFile.exists) {
        throw new Error('Generated Excel file is missing from device storage.');
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localFile.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Open or Save LeetCode Contest Workbook',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
        });
      } else {
        Alert.alert('Workbook Ready', `Saved on device:\n${localFile.uri}`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not share Excel workbook.');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveToFolder = async () => {
    if (Platform.OS === 'web') {
      return handleOpenOrShare();
    }
    setExporting(true);
    setErrorMsg(null);
    try {
      if (!statusData?.output_uri) {
        throw new Error('Generated Excel file path is missing.');
      }
      const sourceFile = new File(statusData.output_uri);
      const bytes = await sourceFile.bytes();

      const pickedDir = await Directory.pickDirectoryAsync();
      const destFile = pickedDir.createFile(
        outputName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      destFile.write(bytes);
      setSavedPath(destFile.uri);
      Alert.alert('Saved Successfully', `Excel report saved as ${outputName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save to chosen folder.';
      if (!msg.toLowerCase().includes('cancel')) {
        setErrorMsg(msg);
      }
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.mutedText}>Checking local workbook...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={styles.heroCard}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="file-excel-box" size={44} color={Colors.primary} />
        </View>
        <StatusBadge
          label={statusData?.download_ready ? 'WORKBOOK READY' : 'NOT READY'}
          tone={statusData?.download_ready ? 'success' : 'warning'}
        />
        <Text style={styles.title}>Excel Report Ready</Text>
        <Text style={styles.filename}>{outputName}</Text>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Latest Weekly Contest</Text>
            <Text style={styles.infoValue}>{statusData?.latest_contest_name || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Historical Contest Sheets</Text>
            <Text style={styles.infoValue}>{statusData?.total_weekly_contests ?? 0}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Worksheets</Text>
            <Text style={styles.infoValue}>{(statusData?.total_weekly_contests ?? 0) + 2}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.includedCard}>
        <Text style={styles.sectionTitle}>Included Formatting & Sheets</Text>
        <Text style={styles.bullet}>• Summary sheet with original student info & ratings</Text>
        <Text style={styles.bullet}>• Latest Weekly Contest sheet sorted by Global Rank</Text>
        <Text style={styles.bullet}>• Separate sheet for each historical Weekly Contest</Text>
        <Text style={styles.bullet}>• Bold green headers, frozen panes, filters & status highlights</Text>
      </Card>

      {errorMsg && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </Card>
      )}

      {savedPath && (
        <Card style={styles.successCard}>
          <View style={styles.rowCenter}>
            <MaterialCommunityIcons name="check-circle" size={20} color={Colors.successText} />
            <Text style={styles.successTitle}>Saved On Device</Text>
          </View>
          <Text style={styles.successPath} numberOfLines={3}>
            {savedPath}
          </Text>
        </Card>
      )}

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={handleOpenOrShare}
        disabled={exporting || !statusData?.download_ready}
      >
        {exporting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialCommunityIcons name="share-variant" size={22} color="#FFFFFF" />
        )}
        <Text style={styles.primaryBtnText}>
          {exporting ? 'Preparing File...' : 'Open / Share Excel Workbook'}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'android' && (
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={handleSaveToFolder}
          disabled={exporting || !statusData?.download_ready}
        >
          <MaterialCommunityIcons name="folder-download" size={20} color={Colors.primaryDark} />
          <Text style={styles.outlineBtnText}>Save Directly to Android Folder</Text>
        </TouchableOpacity>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => navigation.navigate('ResultsPreview', { jobId })}
        >
          <Text style={styles.ghostBtnText}>Back to Preview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.popToTop()}>
          <Text style={styles.ghostBtnText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mutedText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  heroCard: {
    alignItems: 'center',
    gap: 10,
    borderColor: Colors.borderGreen,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  filename: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.primaryDark,
    textAlign: 'center',
  },
  infoBox: {
    width: '100%',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  includedCard: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
  },
  errorText: {
    color: Colors.errorText,
    fontSize: 13,
  },
  successCard: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.borderGreen,
    gap: 4,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.successText,
  },
  successPath: {
    fontSize: 12,
    color: Colors.successText,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 14,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 14,
  },
  outlineBtnText: {
    color: Colors.primaryDark,
    fontSize: 14.5,
    fontWeight: '800',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  ghostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  ghostBtnText: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 14,
  },
});
