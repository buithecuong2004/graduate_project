/**
 * PM2 Ecosystem Config — Tarous Backend
 * EC2: 2 vCPU / 8GB RAM
 *
 * Chạy với: pm2 start ecosystem.config.cjs
 * Xem logs:  pm2 logs tarous-backend
 * Monitor:   pm2 monit
 * Restart:   pm2 reload tarous-backend (zero-downtime)
 * Stop:      pm2 stop tarous-backend
 */
module.exports = {
    apps: [
        {
            name: 'tarous-backend',
            script: 'server.js',
            cwd: '/var/www/tarouss/backend',

            // ─── Cluster Mode ─────────────────────────────────────────────────
            // instances: 2 = dùng đúng 2 vCPU của EC2
            // Dùng 'max' nếu sau này nâng cấp lên instance nhiều core hơn
            instances: 2,
            exec_mode: 'cluster',

            // ─── Interpreter ──────────────────────────────────────────────────
            interpreter: 'node',
            interpreter_args: '--experimental-vm-modules',

            // ─── Environment ──────────────────────────────────────────────────
            env: {
                NODE_ENV: 'production',
                PORT: 4000,     // PM2 tự gán PORT+instance_index → 4000, 4001
            },
            env_development: {
                NODE_ENV: 'development',
                PORT: 4000,
                instances: 1,
                exec_mode: 'fork',
            },

            // ─── Memory & Restart ─────────────────────────────────────────────
            // Restart worker nếu dùng > 400MB RAM (mỗi worker không vượt quá này)
            // 2 workers × 400MB = 800MB, còn lại 7.2GB cho OS, Redis, MongoDB driver
            max_memory_restart: '400M',

            // Delay giữa các lần restart để tránh crash loop
            restart_delay: 3000,

            // Số lần restart tối đa trong 15 giây (chống vòng lặp crash)
            max_restarts: 5,
            min_uptime: '15s',

            // ─── Logging ──────────────────────────────────────────────────────
            out_file: '/var/log/pm2/tarous-out.log',
            error_file: '/var/log/pm2/tarous-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            // Merge logs từ tất cả workers vào 1 file
            merge_logs: true,

            // ─── Zero-Downtime Deployment ─────────────────────────────────────
            // Khi chạy `pm2 reload`, PM2 sẽ restart từng worker một,
            // đảm bảo không có downtime (rolling restart)
            wait_ready: true,
            listen_timeout: 15000,

            // ─── File Watching (chỉ dùng khi development) ────────────────────
            watch: false,   // KHÔNG watch trong production — gây restart liên tục

            // ─── Kill signal ──────────────────────────────────────────────────
            // SIGINT cho phép server dọn dẹp kết nối trước khi tắt (graceful)
            kill_timeout: 5000,
        }
    ]
}
