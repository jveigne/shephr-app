// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Passage SDK 57 (JP 08/10) : eslint-config-expo 57 active les règles « React Compiler » de
    // react-hooks v7, qui signalent ~45 motifs existants et fonctionnels (setState dans un effet
    // de chargement, surtout). Rétrogradées en avertissements pour ne pas mêler une refonte des
    // écrans à la montée de version — dette visible au lint, à résorber écran par écran.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);
