import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { fonts } from '@/theme';

import { creerStyles } from '@/theme/creerStyles';
import { useTheme } from '@/contexts/ThemeContext';
export default function Field(props: TextInputProps) {
  const { couleurs: c } = useTheme();
  const styles = useStyles();
  return (
    <TextInput
      placeholderTextColor={c.texte3}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

const useStyles = creerStyles((c) => ({
  field: {
    width: '100%',
    backgroundColor: c.surfaceHaute,
    borderColor: c.filet,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: c.texte,
  },
}));
