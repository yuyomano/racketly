// ESLint (flat config) busca este archivo subiendo desde el cwd de cada workspace hasta
// encontrarlo — sin uno en la raíz, "npm run lint" en cualquier servicio (auth, booking,
// tournament...) falla con "couldn't find an eslint.config.js", pese a que cada uno ya
// declara su propio script "lint": "eslint src/". packages/config/eslint.config.js
// nunca estaba conectado a nada; este archivo es esa conexión.
module.exports = require('./packages/config/eslint.config.js')
