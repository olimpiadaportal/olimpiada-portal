// Elmly Custom Tab Bar — Stage 10.3
// Animated bottom tab bar with sliding indicator, frosted glass, and haptic feedback
// Replaces the default React Navigation tab bar in MainTabs.tsx
//
// NOTE: Indicator and press feedback animate `left`/`opacity` with useNativeDriver:false
// to avoid the _validateTransform → getValue crash on Android/Hermes.

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';

// Approximate tab bar content height (without safe area inset)
// paddingTop(8) + icon(22) + marginTop(2) + label(~14) + paddingVertical(4*2) = ~54
// Add buffer for visual comfort
export const TAB_BAR_CONTENT_HEIGHT = 56;

// Icon mapping: route name → [outline, filled]
const ICON_MAP: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home:      ['home-outline', 'home'],
  Practice:  ['book-outline', 'book'],
  MockExams: ['document-text-outline', 'document-text'],
  Teachers:  ['people-outline', 'people'],
  Analytics: ['analytics-outline', 'analytics'],
  Profile:   ['person-outline', 'person'],
};

// Teacher tab icon overrides
const TEACHER_ICON_MAP: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  TeacherDashboard: ['grid-outline', 'grid'],
  TeacherBookings:  ['calendar-outline', 'calendar'],
  TeacherExams:     ['document-text-outline', 'document-text'],
  TeacherActivity:  ['pulse-outline', 'pulse'],
  Profile:          ['person-outline', 'person'],
};

interface CustomTabBarProps extends BottomTabBarProps {
  isTeacher?: boolean;
}

export const CustomTabBar: React.FC<CustomTabBarProps> = ({
  state,
  descriptors,
  navigation,
  isTeacher = false,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { user } = useAuthStore();
  
  // Track whether the teacher is fully marketplace-verified.
  const [teacherNeedsVerification, setTeacherNeedsVerification] = useState(false);

  const fetchCertificateStatus = useCallback(async () => {
    if (!isTeacher || !user?.id) {
      setTeacherNeedsVerification(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('teachers')
        .select('certificates, is_verified, verification_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!data) {
        setTeacherNeedsVerification(false);
        return;
      }

      const certificates = Array.isArray(data.certificates) ? data.certificates : [];
      const verificationStatus = data.verification_status || (
        data.is_verified ? 'verified' : certificates.length > 0 ? 'pending' : 'not_submitted'
      );
      setTeacherNeedsVerification(!data.is_verified || verificationStatus !== 'verified');
    } catch (error) {
      console.error('Error fetching teacher certificates:', error);
    }
  }, [isTeacher, user?.id]);

  // Show the badge until certificate evidence has been approved by an admin.
  useEffect(() => {
    fetchCertificateStatus();
  }, [fetchCertificateStatus, state.index]);

  const tabCount = state.routes.length;
  const tabWidth = screenWidth / tabCount;
  const indicatorWidth = tabWidth * 0.35;
  // Calculate indicator position for a given tab index
  const getIndicatorPosition = (index: number) =>
    index * tabWidth + (tabWidth - indicatorWidth) / 2;

  // Animated left position for the indicator.
  const indicatorLeft = useRef(new Animated.Value(getIndicatorPosition(state.index))).current;
  // Animated opacity for press feedback per tab
  const pressOpacityAnims = useRef(state.routes.map(() => new Animated.Value(1))).current;

  // Slide indicator when active tab changes.
  // NOTE: Do NOT call stopAnimation() before starting a new spring.
  useEffect(() => {
    Animated.spring(indicatorLeft, {
      toValue: getIndicatorPosition(state.index),
      useNativeDriver: false,
      damping: 18,
      stiffness: 140,
    }).start();
  }, [state.index, tabWidth]);

  // Cleanup on unmount only — do NOT stop pressOpacityAnims on tab change
  // because they may be mid-flight from handleTabPress, causing stopTracking crash
  useEffect(() => {
    return () => {
      try { indicatorLeft.stopAnimation(); } catch (_) {}
      pressOpacityAnims.forEach(a => { try { a.stopAnimation(); } catch (_) {} });
    };
  }, []);

  const handleTabPress = useCallback((route: any, index: number, isFocused: boolean) => {
    if (isTeacher && route.name === 'Profile') {
      fetchCertificateStatus();
    }

    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Opacity press feedback (safe — no transform)
    Animated.sequence([
      Animated.timing(pressOpacityAnims[index], {
        toValue: 0.5,
        duration: 50,
        useNativeDriver: false,
      }),
      Animated.timing(pressOpacityAnims[index], {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  }, [fetchCertificateStatus, isTeacher, navigation, pressOpacityAnims]);

  const handleTabLongPress = useCallback((route: any) => {
    navigation.emit({
      type: 'tabLongPress',
      target: route.key,
    });
  }, [navigation]);

  const iconMap = isTeacher ? TEACHER_ICON_MAP : ICON_MAP;
  const bottomPadding = Math.max(insets.bottom, 8);

  const renderTabBarContent = () => (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      {/* Sliding indicator */}
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: colors.primary,
            width: indicatorWidth,
            left: indicatorLeft,
          },
        ]}
      />

      {/* Tab items */}
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          const icons = iconMap[route.name] || ['ellipse-outline', 'ellipse'];
          const iconName = isFocused ? icons[1] : icons[0];
          const iconColor = isFocused ? colors.primary : colors.textTertiary;
          const labelColor = isFocused ? colors.primary : colors.textTertiary;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={() => handleTabPress(route, index, isFocused)}
              onLongPress={() => handleTabLongPress(route)}
              style={styles.tab}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.tabContent,
                  { opacity: pressOpacityAnims[index] },
                ]}
              >
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={iconName}
                    size={22}
                    color={iconColor}
                  />
                  {/* Badge indicator for teachers who are not marketplace-verified yet */}
                  {isTeacher && route.name === 'Profile' && teacherNeedsVerification && (
                    <View style={styles.verificationBadge}>
                      <Ionicons name="alert-circle" size={10} color="#fff" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    {
                      color: labelColor,
                      fontWeight: isFocused ? '600' : '400',
                      opacity: isFocused ? 1 : 0.7,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {typeof label === 'string' ? label : route.name}
                </Text>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // Use BlurView for frosted glass effect on iOS, fallback to solid on Android
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.wrapper, { borderTopColor: colors.tabBarBorder }]}>
        <BlurView
          intensity={80}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(11,17,32,0.6)' : 'rgba(255,255,255,0.6)' },
          ]}
        />
        {renderTabBarContent()}
      </View>
    );
  }

  // Android: solid background with shadow
  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: isDark ? '#0B1120' : '#FFFFFF',
          borderTopColor: colors.tabBarBorder,
          elevation: 8,
        },
      ]}
    >
      {renderTabBarContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    // iOS shadow for the frosted glass variant
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
    }),
  },
  container: {
    paddingTop: 8,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tabRow: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  iconContainer: {
    position: 'relative',
  },
  verificationBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
