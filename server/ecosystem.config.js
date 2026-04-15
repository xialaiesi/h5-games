module.exports = {
  apps: [
    {
      name: 'qiju-server',
      script: 'src/app.js',
      cwd: __dirname,
      instances: 1,           // 单进程（内存状态不支持多实例）
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      // 日志配置
      out_file: '../logs/out.log',
      error_file: '../logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      // 崩溃自动重启
      autorestart: true,
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '5s',
    },
  ],
}
