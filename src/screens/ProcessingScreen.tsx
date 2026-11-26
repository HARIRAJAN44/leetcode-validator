import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import {
  getJobStatus,
  startExtractionJob,
  subscribeJobStatus,
} from '../engine/jobRunner';
import { Colors } from '../theme/colors';
import { JobStatusResponse, RootStackParamList } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

export const ProcessingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { jobId, filename } = route.params;
  const [statusData, setStatusData] = useState<JobStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getJobStatus(jobId)
      .then((initial) => {
        if (active) setStatusData(initial);
      })
      .catch((err: unknown) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to load job status.');
        }
      });

    const unsubscribe = subscribeJobStatus(jobId, (nextStatus) => {
      if (active) {
        setStatusData(nextStatus);
        setErrorMsg(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [jobId]);

  const handleRetry = async () => {
    setErrorMsg(null);
    try {
      const restarted = await startExtractionJob(jobId, false);
      setStatusData(restarted);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to restart extraction.');
    }
  };

  const progress = Math.min(100, Math.max(0, statusData?.progress_percent ?? 0));
  const isCompleted = statusData?.status === 'completed';
  const isFailed = statusData?.status === 'failed';
  const isRunning = !isCompleted && !isFailed;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={styles.heroCard}>
        <View style={styles.topRow}>
          <View style={styles.iconCircle}>
            {isRunning ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : isCompleted ? (
              <MaterialCommunityIcons name="check-decagram" size={36} color={Colors.primary} />
            ) : (
              <MaterialCommunityIcons name="alert-octagon" size={36} color={Colors.errorText} />
            )}
          </View>
          <StatusBadge label={(statusData?.status || 'processing').toUpperCase()} />
        </View>

        <Text style={styles.title}>
          {isCompleted
            ? 'Contest Extraction Complete'
            : isFailed
            ? 'Extraction Failed'
            : 'Extracting Weekly Contest History'}
        </Text>
        <Text style={styles.filename}>{statusData?.filename || filename}</Text>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: isFailed ? Colors.errorText : Colors.primary,
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressPct}>{progress.toFixed(0)}%</Text>
          <Text style={styles.progressCount}>
            {statusData?.processed_students ?? 0} / {statusData?.total_students ?? 0} profiles
          </Text>
        </View>

        {statusData?.current_student && isRunning && (
          <View style={styles.currentChip}>
            <MaterialCommunityIcons name="account-search" size={16} color={Colors.primaryDark} />
            <Text style={styles.currentChipText} numberOfLines={1}>
              {statusData.current_student}
            </Text>
          </View>
        )}
      </Card>

      {/* Live Metrics */}
      <Card style={styles.metricsCard}>
        <Text style={styles.sectionTitle}>Live On-Device Extraction</Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>{statusData?.processed_students ?? 0}</Text>
            <Text style={styles.metricLabel}>Processed</Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: Colors.primaryTint }]}>
            <Text style={[styles.metricValue, { color: Colors.primaryDark }]}>
              {statusData?.succeeded_students ?? 0}
            </Text>
            <Text style={styles.metricLabel}>Fetched</Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: Colors.errorBg }]}>
            <Text style={[styles.metricValue, { color: Colors.errorText }]}>
              {statusData?.failed_students ?? 0}
            </Text>
            <Text style={styles.metricLabel}>Unavailable</Text>
          </View>
        </View>

        {isCompleted && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLine}>
              Latest Weekly Contest:{' '}
              <Text style={styles.bold}>{statusData?.latest_contest_name || 'N/A'}</Text>
            </Text>
            <Text style={styles.summaryLine}>
              Historical Weekly Contests:{' '}
              <Text style={styles.bold}>{statusData?.total_weekly_contests ?? 0}</Text>
            </Text>
          </View>
        )}
      </Card>

      {errorMsg && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Status Error</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </Card>
      )}

      {isFailed && statusData?.error_message && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Failure Reason</Text>
          <Text style={styles.errorText}>{statusData.error_message}</Text>
        </Card>
      )}

      {/* Action Buttons */}
      {isCompleted && (
        <View style={styles.actionsWrap}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('ResultsPreview', { jobId })}
          >
            <MaterialCommunityIcons name="table-eye" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Preview Contest Results</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() =>
              navigation.navigate('Download', {
                jobId,
                filename: statusData?.output_filename || undefined,
              })
            }
          >
            <MaterialCommunityIcons name="file-excel" size={20} color={Colors.primaryDark} />
            <Text style={styles.secondaryBtnText}>Export Formatted Excel</Text>
          </TouchableOpacity>
        </View>
      )}

      {isFailed && (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
          <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Retry Extraction</Text>
        </TouchableOpacity>
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
  heroCard: {
    gap: 10,
    borderColor: Colors.borderGreen,
    borderWidth: 1.5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primaryTint,
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
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  progressCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  currentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primaryTint,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  currentChipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  metricsCard: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  summaryBox: {
    backgroundColor: Colors.primaryTint,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  summaryLine: {
    fontSize: 13.5,
    color: Colors.textSecondary,
  },
  bold: {
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  errorCard: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
    gap: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.errorText,
  },
  errorText: {
    fontSize: 13,
    color: Colors.errorText,
  },
  actionsWrap: {
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  secondaryBtnText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
  },
});
