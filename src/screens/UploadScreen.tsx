import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import {
  createJobFromAsset,
  createSampleExcelFile,
  startExtractionJob,
} from '../engine/jobRunner';
import { Colors } from '../theme/colors';
import { RootStackParamList, UploadResponse } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Upload'>;

export const UploadScreen: React.FC<Props> = ({ navigation }) => {
  const [selectedAsset, setSelectedAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [parsing, setParsing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePickExcel = async () => {
    setErrorMsg(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setSelectedAsset(asset);
      setUploadResult(null);
      setParsing(true);

      const parsed = await createJobFromAsset(asset);
      setUploadResult(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse Excel file.';
      setErrorMsg(message);
    } finally {
      setParsing(false);
    }
  };

  const handleCreateSample = async () => {
    setGeneratingSample(true);
    setErrorMsg(null);
    try {
      const { uri, bytes } = await createSampleExcelFile();
      if (Platform.OS === 'web') {
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sample_students_input.xlsx';
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save or Open Sample Excel',
        });
      } else {
        Alert.alert('Sample Created', `Saved to ${uri}`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create sample Excel.');
    } finally {
      setGeneratingSample(false);
    }
  };

  const handleStartExtraction = async () => {
    if (!uploadResult) return;
    setStarting(true);
    setErrorMsg(null);
    try {
      await startExtractionJob(uploadResult.job_id, includeDuplicates);
      navigation.replace('Processing', {
        jobId: uploadResult.job_id,
        filename: uploadResult.filename,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start extraction.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Picker Card */}
      <Card style={styles.pickerCard}>
        <View style={styles.pickerIconWrap}>
          <MaterialCommunityIcons name="microsoft-excel" size={38} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Select Student Excel (.xlsx)</Text>
        <Text style={styles.subtitle}>
          Expected columns: <Text style={styles.bold}>Student Name</Text> and{' '}
          <Text style={styles.bold}>LeetCode Profile URL</Text>. Any extra columns (Roll No,
          Batch, Dept) are preserved automatically on-device.
        </Text>

        <TouchableOpacity
          style={styles.pickBtn}
          onPress={handlePickExcel}
          disabled={parsing || starting}
        >
          {parsing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="folder-open" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.pickBtnText}>
            {parsing
              ? 'Reading & Validating Excel...'
              : selectedAsset
              ? 'Choose Another Excel File'
              : 'Browse Android Storage'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sampleBtn}
          onPress={handleCreateSample}
          disabled={generatingSample}
        >
          {generatingSample ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <MaterialCommunityIcons name="file-download-outline" size={18} color={Colors.primary} />
          )}
          <Text style={styles.sampleBtnText}>Generate Sample Input Excel</Text>
        </TouchableOpacity>
      </Card>

      {errorMsg && (
        <Card style={styles.errorCard}>
          <View style={styles.rowCenter}>
            <MaterialCommunityIcons name="alert-circle" size={20} color={Colors.errorText} />
            <Text style={styles.errorTitle}>Excel Validation Error</Text>
          </View>
          <Text style={styles.errorBody}>{errorMsg}</Text>
        </Card>
      )}

      {uploadResult && (
        <>
          {/* Validation Summary */}
          <Card style={styles.sectionCard}>
            <View style={styles.headerBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Validation Summary</Text>
                <Text style={styles.filenameText} numberOfLines={1}>
                  {uploadResult.filename}
                </Text>
              </View>
              <StatusBadge label="Validated" tone="success" />
            </View>

            <View style={styles.kpiRow}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiValue}>{uploadResult.total_rows}</Text>
                <Text style={styles.kpiLabel}>Total Rows</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: Colors.primaryTint }]}>
                <Text style={[styles.kpiValue, { color: Colors.primaryDark }]}>
                  {uploadResult.unique_valid_students}
                </Text>
                <Text style={styles.kpiLabel}>Unique Valid</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: Colors.warningBg }]}>
                <Text style={[styles.kpiValue, { color: Colors.warningText }]}>
                  {uploadResult.duplicate_rows}
                </Text>
                <Text style={styles.kpiLabel}>Duplicates</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: Colors.errorBg }]}>
                <Text style={[styles.kpiValue, { color: Colors.errorText }]}>
                  {uploadResult.invalid_rows}
                </Text>
                <Text style={styles.kpiLabel}>Invalid</Text>
              </View>
            </View>

            {uploadResult.extra_columns.length > 0 && (
              <Text style={styles.extraColsText}>
                Preserved columns: {uploadResult.extra_columns.join(', ')}
              </Text>
            )}

            {uploadResult.duplicate_rows > 0 && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.switchTitle}>Include duplicate rows in workbook</Text>
                  <Text style={styles.switchSub}>
                    Off by default so duplicate profiles do not skew contest rankings.
                  </Text>
                </View>
                <Switch
                  value={includeDuplicates}
                  onValueChange={setIncludeDuplicates}
                  trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                  thumbColor={includeDuplicates ? Colors.primary : '#FFFFFF'}
                />
              </View>
            )}
          </Card>

          {/* Warnings */}
          {uploadResult.warnings.length > 0 && (
            <Card style={styles.warningCard}>
              <View style={styles.rowCenter}>
                <MaterialCommunityIcons name="alert" size={20} color={Colors.warningText} />
                <Text style={styles.warningTitle}>
                  Validation Notices ({uploadResult.warnings.length})
                </Text>
              </View>
              {uploadResult.warnings.slice(0, 8).map((w, idx) => (
                <Text key={idx} style={styles.warningItem}>
                  • {w}
                </Text>
              ))}
              {uploadResult.warnings.length > 8 && (
                <Text style={styles.warningItem}>
                  ...and {uploadResult.warnings.length - 8} more notices.
                </Text>
              )}
            </Card>
          )}

          {/* Parsed Student Preview List */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Parsed Roster ({uploadResult.students.length} students)
            </Text>
            {uploadResult.students.map((stu) => {
              const badgeLabel = !stu.is_valid
                ? 'Invalid'
                : stu.is_duplicate
                ? 'Duplicate'
                : 'Valid';
              return (
                <View key={stu.row_number} style={styles.studentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>
                      #{stu.row_number} • {stu.student_name}
                    </Text>
                    <Text style={styles.studentSub} numberOfLines={1}>
                      {stu.username ? `@${stu.username}` : stu.profile_url || 'No URL'}
                    </Text>
                    {stu.validation_error && (
                      <Text style={styles.studentErr}>{stu.validation_error}</Text>
                    )}
                    {stu.is_duplicate && stu.duplicate_of_row && (
                      <Text style={styles.studentWarn}>
                        Matches row #{stu.duplicate_of_row}
                      </Text>
                    )}
                  </View>
                  <StatusBadge label={badgeLabel} />
                </View>
              );
            })}
          </Card>

          {/* Start Extraction Button */}
          <TouchableOpacity
            style={styles.startBtn}
            onPress={handleStartExtraction}
            disabled={starting}
          >
            {starting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="rocket-launch" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.startBtnText}>
              {starting
                ? 'Starting On-Device Extraction...'
                : `Extract Contest Data (${uploadResult.unique_valid_students} unique profiles)`}
            </Text>
          </TouchableOpacity>
        </>
      )}
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
  pickerCard: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
    borderColor: Colors.borderGreen,
    borderWidth: 1.5,
  },
  pickerIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  bold: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    width: '100%',
    marginTop: 4,
  },
  pickBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  sampleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.primaryTint,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  sampleBtnText: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
    gap: 6,
  },
  errorTitle: {
    color: Colors.errorText,
    fontWeight: '800',
    fontSize: 14.5,
    marginLeft: 8,
  },
  errorBody: {
    color: Colors.errorText,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    gap: 12,
  },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  filenameText: {
    fontSize: 13,
    color: Colors.primaryDark,
    fontWeight: '600',
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiBox: {
    flex: 1,
    minWidth: 70,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  kpiLabel: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  extraColsText: {
    fontSize: 12.5,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
  },
  switchTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  switchSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  warningCard: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
    gap: 6,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    color: Colors.warningText,
    fontWeight: '800',
    fontSize: 14.5,
    marginLeft: 8,
  },
  warningItem: {
    color: Colors.warningText,
    fontSize: 12.5,
    lineHeight: 18,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceAlt,
    gap: 10,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  studentSub: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  studentErr: {
    fontSize: 12,
    color: Colors.errorText,
    marginTop: 2,
  },
  studentWarn: {
    fontSize: 12,
    color: Colors.warningText,
    marginTop: 2,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primaryDark,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    elevation: 3,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
