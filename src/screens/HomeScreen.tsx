import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { listJobs } from '../engine/jobRunner';
import { testLeetCodeConnection } from '../engine/leetcodeClient';
import { Colors } from '../theme/colors';
import { JobListItem, RootStackParamList } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 680;

  const [connState, setConnState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [connMessage, setConnMessage] = useState('Checking direct LeetCode GraphQL access...');
  const [recentJob, setRecentJob] = useState<JobListItem | null>(null);

  const verifyLeetCode = useCallback(async () => {
    setConnState('checking');
    setConnMessage('Checking direct connection to leetcode.com/graphql...');
    try {
      const latest = await testLeetCodeConnection();
      setConnState('online');
      setConnMessage(
        latest
          ? `Direct On-Device Ready • Latest: ${latest.title} (${latest.dateStr})`
          : 'Direct On-Device Ready • LeetCode GraphQL reachable'
      );
    } catch (err: unknown) {
      setConnState('offline');
      setConnMessage(
        err instanceof Error
          ? `Could not reach leetcode.com: ${err.message}`
          : 'Could not reach leetcode.com. Check mobile data or Wi-Fi.'
      );
    }
  }, []);

  const refreshRecentJob = useCallback(async () => {
    try {
      const jobs = await listJobs();
      setRecentJob(jobs.length > 0 ? jobs[0] : null);
    } catch {
      setRecentJob(null);
    }
  }, []);

  useEffect(() => {
    void verifyLeetCode();
    void refreshRecentJob();
  }, [verifyLeetCode, refreshRecentJob]);

  useFocusEffect(
    useCallback(() => {
      void refreshRecentJob();
    }, [refreshRecentJob])
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Hero Banner */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="trophy-award" size={30} color={Colors.primary} />
          </View>
          <View style={styles.connectionPill}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    connState === 'online'
                      ? '#4ADE80'
                      : connState === 'checking'
                      ? '#FBBF24'
                      : '#F87171',
                },
              ]}
            />
            <Text style={styles.connectionPillText}>
              {connState === 'online'
                ? 'Standalone Ready'
                : connState === 'checking'
                ? 'Checking...'
                : 'Offline'}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>LeetCode Contest Tracker</Text>
        <Text style={styles.heroSubtitle}>
          100% standalone on-device app — pick a student Excel file, fetch public weekly contest
          histories directly on your phone, and export formatted multi-sheet Excel workbooks.
        </Text>
      </View>

      {/* Primary Action Grid */}
      <View style={[styles.actionGrid, isWide && styles.actionGridWide]}>
        <TouchableOpacity
          style={[styles.primaryActionCard, isWide && styles.gridHalf]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Upload')}
        >
          <View style={styles.actionIconCircle}>
            <MaterialCommunityIcons name="file-excel" size={28} color={Colors.textOnPrimary} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.primaryActionTitle}>Upload Student Excel</Text>
            <Text style={styles.primaryActionSub}>
              Pick a .xlsx file from Android storage and validate LeetCode profile URLs
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textOnPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionCard, isWide && styles.gridHalf]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('History')}
        >
          <View style={[styles.actionIconCircle, styles.secondaryIconCircle]}>
            <MaterialCommunityIcons name="history" size={26} color={Colors.primary} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={styles.secondaryActionTitle}>Previous Jobs & History</Text>
            <Text style={styles.secondaryActionSub}>
              Preview saved extractions or re-share formatted Excel workbooks
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Recent Job Quick Resume */}
      {recentJob && (
        <Card style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Latest Local Job</Text>
            <StatusBadge label={recentJob.status.toUpperCase()} />
          </View>
          <Text style={styles.recentFilename}>{recentJob.filename}</Text>
          <Text style={styles.metaText}>
            {recentJob.valid_students} valid students • {recentJob.total_weekly_contests} weekly
            contests
            {recentJob.latest_contest_name ? ` • ${recentJob.latest_contest_name}` : ''}
          </Text>
          <View style={styles.recentBtnRow}>
            {recentJob.status === 'completed' ? (
              <>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => navigation.navigate('ResultsPreview', { jobId: recentJob.job_id })}
                >
                  <MaterialCommunityIcons name="table-eye" size={18} color={Colors.primary} />
                  <Text style={styles.outlineBtnText}>Preview Results</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.solidBtn}
                  onPress={() =>
                    navigation.navigate('Download', {
                      jobId: recentJob.job_id,
                      filename: recentJob.output_filename || undefined,
                    })
                  }
                >
                  <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
                  <Text style={styles.solidBtnText}>Export Excel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.solidBtn}
                onPress={() =>
                  navigation.navigate('Processing', {
                    jobId: recentJob.job_id,
                    filename: recentJob.filename,
                  })
                }
              >
                <MaterialCommunityIcons name="progress-clock" size={18} color="#FFFFFF" />
                <Text style={styles.solidBtnText}>Open Job Status</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>
      )}

      {/* Direct On-Device Engine Card */}
      <Card style={styles.sectionCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.rowCenter}>
            <MaterialCommunityIcons name="cellphone-check" size={20} color={Colors.primary} />
            <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>On-Device Engine</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshChip}
            onPress={() => void verifyLeetCode()}
            disabled={connState === 'checking'}
          >
            {connState === 'checking' ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={16} color={Colors.primary} />
            )}
            <Text style={styles.refreshChipText}>Test</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.serverStatusMsg}>{connMessage}</Text>
        <Text style={styles.standaloneNote}>
          No PC, external server, or same-Wi-Fi backend required. All Excel parsing, GraphQL
          fetching, and workbook generation run directly on your device.
        </Text>
      </Card>

      {/* Workflow Guide */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Workbook Structure Generated</Text>
        <View style={styles.guideItem}>
          <MaterialCommunityIcons name="numeric-1-circle" size={20} color={Colors.primary} />
          <Text style={styles.guideText}>
            <Text style={styles.bold}>Summary:</Text> Student roster, profile status, contests
            attended, current/peak rating, best rank, and original metadata.
          </Text>
        </View>
        <View style={styles.guideItem}>
          <MaterialCommunityIcons name="numeric-2-circle" size={20} color={Colors.primary} />
          <Text style={styles.guideText}>
            <Text style={styles.bold}>Latest Weekly Contest:</Text> Ranked leaderboard of all
            students with missing-participation highlighting.
          </Text>
        </View>
        <View style={styles.guideItem}>
          <MaterialCommunityIcons name="numeric-3-circle" size={20} color={Colors.primary} />
          <Text style={styles.guideText}>
            <Text style={styles.bold}>Historical Weekly Contests:</Text> One formatted worksheet per
            weekly contest with bold green headers, frozen rows, and Excel filters.
          </Text>
        </View>
      </Card>
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
    paddingBottom: 32,
    gap: 14,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#DCFCE7',
  },
  actionGrid: {
    gap: 12,
  },
  actionGridWide: {
    flexDirection: 'row',
  },
  gridHalf: {
    flex: 1,
  },
  primaryActionCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    elevation: 3,
  },
  secondaryActionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderGreen,
    elevation: 2,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconCircle: {
    backgroundColor: Colors.primarySoft,
  },
  actionTextWrap: {
    flex: 1,
  },
  primaryActionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  primaryActionSub: {
    fontSize: 12.5,
    color: '#DCFCE7',
    lineHeight: 17,
  },
  secondaryActionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  secondaryActionSub: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  sectionCard: {
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  recentFilename: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  recentBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryTint,
  },
  outlineBtnText: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 13.5,
  },
  solidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  solidBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  serverStatusMsg: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  standaloneNote: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guideText: {
    flex: 1,
    fontSize: 13.5,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  bold: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
