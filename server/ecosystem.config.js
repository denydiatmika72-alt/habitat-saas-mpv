module.exports = {
  apps: [{
    name: 'nexevent-api',
    script: 'src/index.js',
    cwd: '/var/www/nexevent/server',
    env_file: '.env',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
