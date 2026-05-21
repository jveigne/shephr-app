import React, { ReactNode } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props extends ScrollViewProps {
  children: ReactNode;
  withTabBar?: boolean;
  paddingTop?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function ScreenShell({
  children,
  withTabBar = true,
  paddingTop = 12,
  contentStyle,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + paddingTop,
            paddingBottom: (withTabBar ? 110 : 32) + insets.bottom,
          },
          contentStyle,
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.parchment,
  },
  content: {
    paddingHorizontal: 20,
  },
});
