module.exports = {
  apps: [{
    name: 'nexevent-api',
    script: 'src/index.js',
    cwd: '/var/www/nexevent/server',
    env_file: '/var/www/nexevent/server/.env'
  }]
}
