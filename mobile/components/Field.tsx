import React from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

export default function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.ink3}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    backgroundColor: colors.paper2,
    borderColor: colors.hair,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
});
