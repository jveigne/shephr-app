import React from 'react';
import { Text, View, StyleProp, TextStyle } from 'react-native';
import { colors, fonts } from '../theme';

interface Props {
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Wordmark({ size = 32, color = colors.moss, style }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text
        style={[
          {
            fontFamily: fonts.serif,
            fontSize: size,
            color,
            letterSpacing: -size * 0.025,
            fontWeight: '500',
          },
          style,
        ]}
      >
        shephr
      </Text>
      <View
        style={{
          width: size * 0.18,
          height: size * 0.18,
          borderRadius: size * 0.09,
          backgroundColor: colors.earth,
          marginLeft: size * 0.12,
          marginBottom: size * 0.12,
        }}
      />
    </View>
  );
}
