import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { getJobPreview } from '../engine/jobRunner';
import { Colors } from '../theme/colors';
import {
  ContestRecord,
  PreviewResponse,
  RootStackParamList,
  StudentSummary,
} from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'ResultsPreview'>;
type TabMode = 'latest' | 'summary' | 'historical';

export const ResultsPreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { jobId } = route.params;
  const { width } = useWindowDimensions();
  const isWide = width >= 700;

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContest, setLoadingContest] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<TabMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [contestPickerVisible, setContestPickerVisible] = useState(false);
  const [selectedHistoricalContest, setSelectedHistoricalContest] = useState<string | null>(null);

  const loadPreview = useCallback(
    async (contestName?: string) => {
      try {
        if (contestName) {
          setLoadingContest(true);
        } else {
          setLoading(true);
        }
        const data = await getJobPreview(jobId, contestName);
        setPreview(data);
        setErrorMsg(null);
        if (contestName) {
          setSelectedHistoricalContest(contestName);
        } else if (data.available_contests.length > 0 && !selectedHistoricalContest) {
          setSelectedHistoricalContest(data.available_contests[0].contest_name);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load contest results.');
      } finally {
        setLoading(false);
        setLoadingContest(false);
      }
    },
    [jobId, selectedHistoricalContest]
  );

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const queryLower = searchQuery.trim().toLowerCase();

  const filteredContestRows = useMemo(() => {
    if (!preview) return [];
    const source = tab === 'latest' ? preview.latest_contest_rows : preview.selected_contest_rows;
    if (!queryLower) return source;
    return source.filter(
      (r) =>
        r.student_name.toLowerCase().includes(queryLower) ||
        r.leetcode_username.toLowerCase().includes(queryLower)
    );
  }, [preview, tab, queryLower]);

  const filteredSummaryRows = useMemo(() => {
    if (!preview) return [];
    if (!queryLower) return preview.summary;
    return preview.summary.filter(
      (s) =>
        s.student_name.toLowerCase().includes(queryLower) ||
        s.leetcode_username.toLowerCase().includes(queryLower)
    );
  }, [preview, queryLower]);

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading contest results...</Text>
      </View>
    );
  }

  if (errorMsg || !preview) {
    return (
      <View style={styles.centerScreen}>
        <MaterialCommunityIcons name="alert-circle" size={42} color={Colors.errorText} />
        <Text style={styles.errorTitle}>Could Not Load Preview</Text>
        <Text style={styles.errorBody}>{errorMsg || 'Missing preview payload.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => loadPreview()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderContestRow = (row: ContestRecord) => {
    const isMissing =
      row.participation_status === 'Not Participated' ||
      row.participation_status === 'No History';
    const isError = row.participation_status !== 'Participated' && !isMissing;
    const cardToneStyle = isMissing
      ? styles.missingCard
      : isError
      ? styles.errorRowCard
      : undefined;

    return (
      <Card
        key={`${row.row_number}-${row.leetcode_username}-${row.contest_name}`}
        style={[styles.recordCard, cardToneStyle]}
      >
        <View style={styles.recordTopRow}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>
              {row.global_rank !== null ? `#${row.global_rank}` : '—'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studentName}>{row.student_name}</Text>
            <Text style={styles.usernameText}>@{row.leetcode_username}</Text>
          </View>
          <StatusBadge label={row.participation_status} />
        </View>

        <View style={styles.metricsLine}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillLabel}>Solved</Text>
            <Text style={styles.metricPillValue}>
              {row.problems_solved !== null && row.total_problems !== null
                ? `${row.problems_solved} / ${row.total_problems}`
                : 'N/A'}
            </Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillLabel}>Rating</Text>
            <Text style={styles.metricPillValue}>
              {row.contest_rating !== null ? row.contest_rating.toFixed(2) : 'N/A'}
            </Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillLabel}>Date</Text>
            <Text style={styles.metricPillValue}>{row.contest_date}</Text>
          </View>
        </View>
      </Card>
    );
  };

  const renderSummaryRow = (item: StudentSummary) => (
    <Card key={`${item.row_number}-${item.leetcode_username}`} style={styles.recordCard}>
      <View style={styles.recordTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{item.student_name}</Text>
          <Text style={styles.usernameText}>@{item.leetcode_username}</Text>
        </View>
        <StatusBadge label={item.profile_status} />
      </View>

      <View style={styles.metricsLine}>
        <View style={styles.metricPill}>
          <Text style={styles.metricPillLabel}>Attended</Text>
          <Text style={styles.metricPillValue}>{item.weekly_contests_attended}</Text>
        </View>
        <View style={styles.metricPill}>
          <Text style={styles.metricPillLabel}>Rating</Text>
          <Text style={styles.metricPillValue}>
            {item.current_rating !== null ? item.current_rating.toFixed(1) : 'N/A'}
          </Text>
        </View>
        <View style={styles.metricPill}>
          <Text style={styles.metricPillLabel}>Best Rank</Text>
          <Text style={styles.metricPillValue}>
            {item.best_rank !== null ? `#${item.best_rank}` : 'N/A'}
          </Text>
        </View>
        <View style={styles.metricPill}>
          <Text style={styles.metricPillLabel}>Total Solved</Text>
          <Text style={styles.metricPillValue}>{item.total_problems_solved}</Text>
        </View>
      </View>

      {item.latest_contest_name && (
        <Text style={styles.latestAttendedText}>
          Last Attended: {item.latest_contest_name} ({item.latest_contest_date}) • Rank{' '}
          {item.latest_rank !== null ? `#${item.latest_rank}` : 'N/A'}
        </Text>
      )}
      {item.notes && <Text style={styles.notesText}>{item.notes}</Text>}
    </Card>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Stats Grid */}
        <View style={[styles.kpiGrid, isWide && styles.kpiGridWide]}>
          <View style={[styles.kpiCard, { borderColor: Colors.borderGreen }]}>
            <Text style={styles.kpiNumber}>{preview.stats.active_profiles}</Text>
            <Text style={styles.kpiTitle}>Active</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder }]}>
            <Text style={[styles.kpiNumber, { color: Colors.warningText }]}>
              {preview.stats.never_participated}
            </Text>
            <Text style={[styles.kpiTitle, { color: Colors.warningText }]}>Never Joined</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: Colors.errorBg, borderColor: Colors.errorBorder }]}>
            <Text style={[styles.kpiNumber, { color: Colors.errorText }]}>
              {preview.stats.unavailable_or_failed}
            </Text>
            <Text style={[styles.kpiTitle, { color: Colors.errorText }]}>Unavailable</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: Colors.primarySoft, borderColor: Colors.borderGreen }]}>
            <Text style={[styles.kpiNumber, { color: Colors.primaryDark }]}>
              {preview.stats.total_weekly_contests}
            </Text>
            <Text style={[styles.kpiTitle, { color: Colors.primaryDark }]}>Weekly Contests</Text>
          </View>
        </View>

        {/* Segmented Tabs */}
        <View style={styles.tabBar}>
          {(
            [
              { key: 'latest', label: 'Latest Contest' },
              { key: 'summary', label: 'Summary' },
              { key: 'historical', label: 'Historical' },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => {
                  setTab(t.key);
                  if (t.key === 'historical' && selectedHistoricalContest) {
                    loadPreview(selectedHistoricalContest);
                  }
                }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Context Banner for Latest / Historical */}
        {tab === 'latest' && (
          <Card style={styles.bannerCard}>
            <Text style={styles.bannerTitle}>
              {preview.latest_contest_name || 'Latest Weekly Contest'}
            </Text>
            <Text style={styles.bannerSub}>
              Date: {preview.latest_contest_date || 'N/A'} • Participated:{' '}
              {preview.stats.latest_contest_participated} / {preview.stats.total_students}
            </Text>
          </Card>
        )}

        {tab === 'historical' && (
          <Card style={styles.bannerCard}>
            <Text style={styles.bannerLabel}>Selected Historical Weekly Contest</Text>
            {preview.available_contests.length === 0 ? (
              <Text style={styles.bannerSub}>No historical weekly contest records found.</Text>
            ) : (
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => setContestPickerVisible(true)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectorTitle}>
                    {preview.selected_contest || preview.available_contests[0].contest_name}
                  </Text>
                  <Text style={styles.selectorSub}>
                    Tap to switch among {preview.available_contests.length} weekly contests
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={24} color={Colors.primaryDark} />
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* Search Filter */}
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Filter by student name or username..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Results List */}
        {loadingContest ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 24 }} />
        ) : tab === 'summary' ? (
          filteredSummaryRows.length > 0 ? (
            filteredSummaryRows.map(renderSummaryRow)
          ) : (
            <Text style={styles.emptyText}>No matching students found.</Text>
          )
        ) : filteredContestRows.length > 0 ? (
          filteredContestRows.map(renderContestRow)
        ) : (
          <Text style={styles.emptyText}>No matching records for this contest.</Text>
        )}
      </ScrollView>

      {/* Bottom Sticky Download Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.downloadFab}
          onPress={() => navigation.navigate('Download', { jobId })}
        >
          <MaterialCommunityIcons name="file-excel" size={20} color="#FFFFFF" />
          <Text style={styles.downloadFabText}>Download Excel Workbook</Text>
        </TouchableOpacity>
      </View>

      {/* Contest Selector Modal */}
      <Modal
        visible={contestPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setContestPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Weekly Contest</Text>
              <TouchableOpacity onPress={() => setContestPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalList}>
              {preview.available_contests.map((c) => {
                const selected = c.contest_name === preview.selected_contest;
                return (
                  <TouchableOpacity
                    key={c.contest_name}
                    style={[styles.modalItem, selected && styles.modalItemSelected]}
                    onPress={() => {
                      setContestPickerVisible(false);
                      loadPreview(c.contest_name);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalItemTitle, selected && { color: Colors.primaryDark }]}>
                        {c.contest_name}
                      </Text>
                      <Text style={styles.modalItemSub}>
                        {c.contest_date} • {c.participated_count}/{c.total_students} participated
                      </Text>
                    </View>
                    {selected && (
                      <MaterialCommunityIcons name="check-circle" size={22} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 92,
    gap: 12,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.errorText,
  },
  errorBody: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiGridWide: {
    flexWrap: 'nowrap',
  },
  kpiCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  bannerCard: {
    backgroundColor: Colors.primaryTint,
    borderColor: Colors.borderGreen,
    gap: 4,
  },
  bannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
    textTransform: 'uppercase',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  bannerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
    marginTop: 4,
  },
  selectorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  selectorSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 2,
  },
  recordCard: {
    gap: 10,
  },
  missingCard: {
    backgroundColor: '#FFFBEB',
    borderColor: Colors.warningBorder,
  },
  errorRowCard: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.errorBorder,
  },
  recordTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
  },
  rankBadgeText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  usernameText: {
    fontSize: 12.5,
    color: Colors.textSecondary,
  },
  metricsLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    minWidth: 72,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metricPillLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  metricPillValue: {
    fontSize: 13.5,
    color: Colors.textPrimary,
    fontWeight: '800',
    marginTop: 1,
  },
  latestAttendedText: {
    fontSize: 12.5,
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 12,
    color: Colors.errorText,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    paddingVertical: 24,
    fontSize: 14,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: 'rgba(248, 250, 252, 0.96)',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  downloadFab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 4,
  },
  downloadFabText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '75%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalList: {
    paddingVertical: 8,
    gap: 8,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceAlt,
  },
  modalItemSelected: {
    backgroundColor: Colors.primaryTint,
    borderWidth: 1,
    borderColor: Colors.borderGreen,
  },
  modalItemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalItemSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});

