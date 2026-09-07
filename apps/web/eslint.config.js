const { FlatCompat } = require('@eslint/eslintrc')
const sharedConfig = require('../../packages/config/eslint.config.js')

// next lint necesita FlatCompat para traducir el preset legacy `next/core-web-vitals`
// (eslint-config-next no publica una versión flat todavía) a config plano. Si no
// tuviéramos este archivo, la resolución de ESLint subiría hasta el eslint.config.js
// de la raíz y perdería los plugins de Next (react-hooks, @next/next).
const compat = new FlatCompat({ baseDirectory: __dirname })

module.exports = [...compat.extends('next/core-web-vitals'), ...sharedConfig]
