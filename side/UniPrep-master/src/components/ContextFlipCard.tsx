// ContextFlipCard — shows context_text on front, context_image_url on back.
// Two-phase animation: front flips out (150ms), face swaps, back flips in (150ms).
// Works reliably on iOS and Android.

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography } from '../constants/theme';

interface ContextFlipCardProps {
  contextText: string;
  contextImageUrl?: string | null;
  groupOrder?: number | null;
  labelText?: string;
  tapToSeeImageText?: string;
  tapToSeeTextText?: string;
}

export const ContextFlipCard: React.FC<ContextFlipCardProps> = ({
  contextText,
  contextImageUrl,
  groupOrder,
  labelText = '📝 Situasiya',
  tapToSeeImageText = 'Şəkli görmək üçün toxun',
  tapToSeeTextText = 'Mətni görmək üçün toxun',
}) => {
  const [showBack, setShowBack] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const opacityAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const hasImage = !!contextImageUrl;

  const flip = () => {
    if (!hasImage || isAnimating) return;
    setIsAnimating(true);
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Swap face
      setShowBack(prev => !prev);
      rotateAnim.setValue(-1); // Start back face from -90deg equivalent
      opacityAnim.setValue(0);

      // Phase 2: flip new face in (150ms)
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => setIsAnimating(false));
    });
  };

  const rotateY = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-90deg', '0deg', '90deg'],
  });

  const renderFlipHint = (icon: string, text: string) => (
    <View style={styles.flipHint}>
      <Ionicons name={icon as any} size={12} color="#0369A1" />
      <Text style={styles.flipHintText}>{text}</Text>
    </View>
  );

  return (
    <TouchableOpacity
      onPress={flip}
      activeOpacity={hasImage ? 0.92 : 1}
      style={styles.card}
    >
      <Animated.View
        style={{
          opacity: opacityAnim,
          transform: [{ perspective: 1200 }, { rotateY }],
        }}
      >
        {!showBack ? (
          /* FRONT — context text */
          <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{labelText}</Text>
              {hasImage && renderFlipHint('image-outline', tapToSeeImageText)}
            </View>
            <Text style={styles.contextText}>
              {contextText.replace(/\n+/g, ' ').trim()}
            </Text>
            {groupOrder != null && (
              <Text style={styles.groupOrder}>{groupOrder}. hissə</Text>
            )}
          </>
        ) : (
          /* BACK — context image */
          <>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{labelText}</Text>
              {renderFlipHint('text-outline', tapToSeeTextText)}
            </View>

            {imageError ? (
              <View style={styles.imageError}>
                <Ionicons name="image-outline" size={40} color="#9CA3AF" />
                <Text style={styles.imageErrorText}>Şəkil yüklənmədi</Text>
                <TouchableOpacity
                  onPress={() => { setImageError(false); setImageLoading(true); }}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>Yenidən cəhd et</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {imageLoading && (
                  <View style={styles.imageLoading}>
                    <ActivityIndicator size="large" color="#0369A1" />
                  </View>
                )}
                <Image
                  source={{ uri: contextImageUrl! }}
                  style={[styles.contextImage, imageLoading && styles.imageHidden]}
                  resizeMode="contain"
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => { setImageLoading(false); setImageError(true); }}
                />
              </>
            )}
          </>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semiBold,
    color: '#0369A1',
    flexShrink: 1,
  },
  flipHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: spacing.xs,
  },
  flipHintText: {
    fontSize: 11,
    color: '#0369A1',
    fontStyle: 'italic',
  },
  contextText: {
    fontSize: typography.fontSizes.sm,
    color: '#0C4A6E',
    lineHeight: 20,
  },
  groupOrder: {
    marginTop: spacing.xs,
    fontSize: 11,
    color: '#0369A1',
    fontStyle: 'italic',
  },
  contextImage: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.sm,
  },
  imageHidden: {
    opacity: 0,
    height: 0,
  },
  imageLoading: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageError: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  imageErrorText: {
    fontSize: typography.fontSizes.sm,
    color: '#9CA3AF',
  },
  retryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: '#E0F2FE',
    borderRadius: borderRadius.sm,
  },
  retryText: {
    fontSize: typography.fontSizes.sm,
    color: '#0369A1',
  },
});
