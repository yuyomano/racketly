const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      // ignoreRestSiblings: permite `const { fieldToDrop, ...rest } = obj` sin usar
      // fieldToDrop — es el patrón estándar para omitir un campo de un objeto.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // `declare global { namespace Express { ... } }` es el patrón estándar para
      // extender el tipo Request con campos propios (userId, clubAdmin...) en varios
      // servicios — no es un namespace "de verdad", así que no debe marcarse.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/', '.next/', 'coverage/'],
  },
]
