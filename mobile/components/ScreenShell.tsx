import React, { ReactNode } from 'react';
import {
  ScrollView,
  View,
  StyleProp,
  ViewStyle,
  ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { creerStyles } from '@/theme/creerStyles';
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
  const styles = useStyles();
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

const useStyles = creerStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.page,
  },
  content: {
    paddingHorizontal: 20,
  },
}));
