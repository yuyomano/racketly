const nextCoreWebVitals = require('eslint-config-next/core-web-vitals')
const sharedConfig = require('../../packages/config/eslint.config.js')

// eslint-config-next 16 ya publica su preset como config plano nativo — ya no
// hace falta FlatCompat para traducir el formato legacy `next/core-web-vitals`.
module.exports = [
  ...nextCoreWebVitals,
  ...sharedConfig,
  {
    rules: {
      // ponytail: eslint-config-next 16 trae las reglas nuevas de React Compiler
      // (set-state-in-effect, immutability, purity...) en 'error' — señalan patrones
      // preexistentes y muy comunes en este código (setState tras un fetch en useEffect,
      // Date.now() al renderizar) que no son bugs pero sí ameritan revisión propia, no
      // arreglo a ciegas en un bump de dependencias. Se bajan a warning hasta esa revisión.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]
