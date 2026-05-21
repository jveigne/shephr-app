import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

interface Props {
  width?: number | `${number}%`;
  height?: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}

export default function HandDivider({
  width = '100%',
  height = 14,
  color = colors.moss,
  opacity = 0.35,
  style,
}: Props) {
  return (
    <View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width="100%" height={height} viewBox="0 0 240 12" preserveAspectRatio="none">
        <Path
          d="M2 6 Q 30 1, 60 6 T 120 6 T 180 6 T 238 6"
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={1.3}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
