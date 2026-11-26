import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '../theme/colors';

interface StatusBadgeProps {
  label: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export function inferToneFromStatus(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  const lower = status.toLowerCase();
  if (lower === 'participated' || lower === 'active' || lower === 'completed' || lower === 'valid') {
    return 'success';
  }
  if (
    lower === 'not participated' ||
    lower === 'duplicate' ||
    lower === 'queued' ||
    lower === 'uploaded'
  ) {
    return 'warning';
  }
  if (lower === 'processing' || lower === 'no history') {
    return 'info';
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('invalid') ||
    lower.includes('failed') ||
    lower.includes('restricted')
  ) {
    return 'error';
  }
  return 'neutral';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone }) => {
  const resolvedTone = tone ?? inferToneFromStatus(label);

  const palette = {
    success: { bg: Colors.successBg, text: Colors.successText },
    warning: { bg: Colors.warningBg, text: Colors.warningText },
    error: { bg: Colors.errorBg, text: Colors.errorText },
    info: { bg: Colors.infoBg, text: Colors.infoText },
    neutral: { bg: Colors.surfaceAlt, text: Colors.textSecondary },
  }[resolvedTone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});

