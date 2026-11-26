import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { deleteJob, listJobs, startExtractionJob } from '../engine/jobRunner';
import { Colors } from '../theme/colors';
import { JobListItem, RootStackParamList } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

function formatTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleString();
  } catch {
    return iso;
  }
}

export const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await listJobs();
      setJobs(data);
      setErrorMsg(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to fetch job history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchJobs(false);
    }, [fetchJobs])
  );

  const handleDelete = (job: JobListItem) => {
    Alert.alert(
      'Delete Job',
      `Remove "${job.filename}" and its generated Excel file?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteJob(job.job_id);
              setJobs((prev) => prev.filter((j) => j.job_id !== job.job_id));
            } catch (err: unknown) {
              Alert.alert(
                'Delete Failed',
                err instanceof Error ? err.message : 'Could not delete job.'
              );
            }
          },
        },
      ]
    );
  };

  const handleStartUploaded = async (job: JobListItem) => {
    try {
      await startExtractionJob(job.job_id, false);
      navigation.navigate('Processing', { jobId: job.job_id, filename: job.filename });
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not start job.');
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.mutedText}>Loading previous jobs...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchJobs(true)}
          colors={[Colors.primary]}
        />
      }
    >
      {errorMsg && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </Card>
      )}

      {jobs.length === 0 ? (
        <Card style={styles.emptyCard}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={44} color={Colors.primary} />
          <Text style={styles.emptyTitle}>No Previous Jobs Yet</Text>
          <Text style={styles.emptySub}>
            Upload a student Excel file to extract LeetCode weekly contest histories and generate
            your first report.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Upload')}
          >
            <Text style={styles.primaryBtnText}>Upload Student Excel</Text>
          </TouchableOpacity>
        </Card>
      ) : (
        jobs.map((job) => (
          <Card key={job.job_id} style={styles.jobCard}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filename} numberOfLines={1}>
                  {job.filename}
                </Text>
                <Text style={styles.dateText}>{formatTimestamp(job.created_at)}</Text>
              </View>
              <StatusBadge label={job.status.toUpperCase()} />
            </View>

            <Text style={styles.metaText}>
              {job.valid_students}/{job.total_students} valid profiles •{' '}
              {job.total_weekly_contests} weekly contests
              {job.latest_contest_name ? ` • ${job.latest_contest_name}` : ''}
            </Text>

            <View style={styles.actionsRow}>
              {job.status === 'completed' ? (
                <>
                  <TouchableOpacity
                    style={styles.outlineBtn}
                    onPress={() => navigation.navigate('ResultsPreview', { jobId: job.job_id })}
                  >
                    <MaterialCommunityIcons name="table-eye" size={16} color={Colors.primaryDark} />
                    <Text style={styles.outlineBtnText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.solidBtn}
                    onPress={() =>
                      navigation.navigate('Download', {
                        jobId: job.job_id,
                        filename: job.output_filename || undefined,
                      })
                    }
                  >
                    <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" />
                    <Text style={styles.solidBtnText}>Excel</Text>
                  </TouchableOpacity>
                </>
              ) : job.status === 'uploaded' ? (
                <TouchableOpacity
                  style={styles.solidBtn}
                  onPress={() => handleStartUploaded(job)}
                >
                  <MaterialCommunityIcons name="play" size={16} color="#FFFFFF" />
                  <Text style={styles.solidBtnText}>Start Extraction</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.solidBtn}
                  onPress={() =>
                    navigation.navigate('Processing', {
                      jobId: job.job_id,
                      filename: job.filename,
                    })
                  }
                >
                  <MaterialCommunityIcons name="progress-clock" size={16} color="#FFFFFF" />
                  <Text style={styles.solidBtnText}>View Status</Text>
                </TouchableOpacity>
              )}

              {job.status !== 'processing' && job.status !== 'queued' && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(job)}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.errorText} />
                </TouchableOpacity>
              )}
            </View>
          </Card>
        ))
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
    gap: 12,
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
  errorCard: {
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
  },
  errorText: {
    color: Colors.errorText,
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  emptySub: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  jobCard: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  filename: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryTint,
  },
  outlineBtnText: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },
  solidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  solidBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: 8,
    borderRadius: 10,
    backgroundColor: Colors.errorBg,
  },
});

