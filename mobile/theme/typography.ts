import { Platform, TextStyle } from 'react-native';

export const fonts = {
  serif: Platform.select({
    ios: 'Fraunces',
    android: 'Fraunces',
    default: 'Fraunces',
  }) as string,
  sans: Platform.select({
    ios: 'Inter',
    android: 'Inter',
    default: 'Inter',
  }) as string,
  mono: Platform.select({
    ios: 'JetBrainsMono',
    android: 'JetBrainsMono',
    default: 'JetBrainsMono',
  }) as string,
};

export const serif: TextStyle = {
  fontFamily: fonts.serif,
  letterSpacing: -0.2,
};

export const sans: TextStyle = {
  fontFamily: fonts.sans,
};

export const mono: TextStyle = {
  fontFamily: fonts.mono,
};
