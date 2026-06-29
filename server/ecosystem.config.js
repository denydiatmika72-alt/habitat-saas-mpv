module.exports = {
  apps: [{
    name: 'nexevent-api',
    script: 'src/index.js',
    cwd: '/var/www/nexevent/server',
    env: {
      NODE_ENV: 'production',
      ADMIN_EMAILS: 'denydiatmika72@gmail.com'
    }
  }]
}
