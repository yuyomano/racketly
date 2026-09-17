// Config de Metro para monorepo — necesario para que resuelva paquetes de
// workspace (@racketly/utils, @racketly/shared-types) fuera de apps/mobile.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Los paquetes de workspace (@racketly/utils, @racketly/shared-types) se
// enlazan como symlinks en node_modules — Metro no los cruza por defecto.
config.resolver.unstable_enableSymlinks = true
// En Windows, el crawler de Metro (metro-file-map) no recorre directorios
// symlinkeados (Dirent.isDirectory() da false para symlinks), así que nunca
// indexa node_modules/@racketly/*. Se mapean directo a la ruta física, que
// sí es indexada como parte de workspaceRoot.
config.resolver.extraNodeModules = {
  '@racketly/utils': path.resolve(workspaceRoot, 'packages/utils'),
  '@racketly/shared-types': path.resolve(workspaceRoot, 'packages/shared-types'),
}

module.exports = config
