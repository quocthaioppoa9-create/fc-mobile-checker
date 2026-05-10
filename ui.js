// ui.js - Module giao diện hiển thị console
const chalk = require('chalk');
const Table = require('cli-table3');
const figlet = require('figlet');
const boxen = require('boxen');
const { formatTime } = require('./utils');

/**
 * Hiển thị banner khởi động
 */
function showBanner() {
    console.clear();

    const banner = figlet.textSync('FC Mobile\n  Checker', {
        font: 'Small',
        horizontalLayout: 'default'
    });

    console.log(chalk.cyan(banner));

    const info = boxen(
        chalk.white.bold('FC Mobile VN - Account Checker Tool\n') +
        chalk.gray('─'.repeat(40) + '\n') +
        chalk.yellow('▸ Phiên bản: ') + chalk.green('1.0.0\n') +
        chalk.yellow('▸ Platform:  ') + chalk.green('Garena Vietnam\n') +
        chalk.yellow('▸ Engine:    ') + chalk.green('Puppeteer + Stealth\n') +
        chalk.gray('─'.repeat(40) + '\n') +
        chalk.red.italic('⚠ Tool dùng cho mục đích cá nhân'),
        {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: 'cyan'
        }
    );

    console.log(info);
}

/**
 * Hiển thị thông tin tổng quan trước khi chạy
 */
function showOverview(accountCount, proxyCount, estimatedTime) {
    const overview = boxen(
        chalk.white.bold('📋 THÔNG TIN PHIÊN LÀM VIỆC\n\n') +
        chalk.yellow('  Số tài khoản:     ') + chalk.green.bold(`${accountCount}\n`) +
        chalk.yellow('  Số proxy:         ') + chalk.green.bold(`${proxyCount || 'Không dùng'}\n`) +
        chalk.yellow('  Chế độ:           ') + chalk.green.bold('Tuần tự (từng acc)\n') +
        chalk.yellow('  Thời gian ước tính: ') + chalk.green.bold(formatTime(estimatedTime)),
        {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: 'yellow'
        }
    );

    console.log(overview);
}

/**
 * Hiển thị tiến trình hiện tại
 */
function showProgress(current, total, currentAccount, status, startTime) {
    const elapsed = (Date.now() - startTime) / 1000;
    const avgTime = elapsed / Math.max(current, 1);
    const remaining = avgTime * (total - current);
    const percent = Math.round((current / total) * 100);

    // Tạo progress bar
    const barLength = 30;
    const filledLength = Math.round(barLength * current / total);
    const bar = chalk.green('█'.repeat(filledLength)) +
        chalk.gray('░'.repeat(barLength - filledLength));

    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(
        chalk.cyan.bold(`\n  📊 Tiến trình: `) +
        `[${bar}] ` +
        chalk.yellow.bold(`${percent}%`) +
        chalk.gray(` (${current}/${total})`)
    );
    console.log(
        chalk.cyan('  👤 Tài khoản:  ') +
        chalk.white.bold(maskUsername(currentAccount))
    );
    console.log(
        chalk.cyan('  📝 Trạng thái: ') +
        getStatusColor(status)
    );
    console.log(
        chalk.cyan('  ⏱  Đã chạy:   ') +
        chalk.white(formatTime(elapsed)) +
        chalk.gray('  |  ') +
        chalk.cyan('Còn lại: ') +
        chalk.white(formatTime(remaining))
    );
    console.log(chalk.gray('─'.repeat(60)));
}

/**
 * Hiển thị bảng kết quả
 */
function showResultTable(accounts) {
    const table = new Table({
        head: [
            chalk.cyan.bold('STT'),
            chalk.cyan.bold('Tài khoản'),
            chalk.cyan.bold('OVR'),
            chalk.cyan.bold('Gem'),
            chalk.cyan.bold('Coin'),
            chalk.cyan.bold('Max Player'),
            chalk.cyan.bold('FV'),
            chalk.cyan.bold('Trạng thái')
        ],
        colWidths: [5, 22, 8, 12, 12, 20, 10, 25],
        style: {
            head: [],
            border: ['gray']
        },
        chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
            'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
            'right': '│', 'right-mid': '┤', 'middle': '│'
        }
    });

    accounts.forEach((acc, index) => {
        table.push([
            chalk.gray(index + 1),
            chalk.white(maskUsername(acc.username)),
            getOvrColor(acc.ovr),
            chalk.yellow(acc.gem),
            chalk.yellow(acc.coin),
            chalk.magenta(acc.maxPlayer),
            chalk.green(acc.fv),
            getStatusColor(acc.status)
        ]);
    });

    console.log('\n' + chalk.cyan.bold('  📊 BẢNG KẾT QUẢ'));
    console.log(table.toString());
}

/**
 * Hiển thị tổng kết cuối cùng
 */
function showSummary(accounts, startTime) {
    const elapsed = (Date.now() - startTime) / 1000;
    const successCount = accounts.filter(a =>
        a.status.includes('thành công') || a.status.includes('Hoàn thành')
    ).length;
    const failCount = accounts.filter(a =>
        a.status.includes('Sai') || a.status.includes('Lỗi') || a.status.includes('khóa')
    ).length;
    const otherCount = accounts.length - successCount - failCount;

    const summary = boxen(
        chalk.white.bold('🏁 TỔNG KẾT\n\n') +
        chalk.green(`  ✅ Thành công:    ${successCount}/${accounts.length}\n`) +
        chalk.red(`  ❌ Thất bại:      ${failCount}/${accounts.length}\n`) +
        chalk.yellow(`  ⚠️  Khác:         ${otherCount}/${accounts.length}\n`) +
        chalk.gray('  ─'.repeat(20) + '\n') +
        chalk.cyan(`  ⏱  Tổng thời gian: ${formatTime(elapsed)}\n`) +
        chalk.cyan(`  ⏱  Trung bình:     ${formatTime(elapsed / accounts.length)}/acc\n`) +
        chalk.gray('  ─'.repeat(20) + '\n') +
        chalk.green.bold(`  📁 Kết quả đã lưu: result.txt`),
        {
            padding: 1,
            margin: { top: 1, bottom: 1, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: 'green'
        }
    );

    console.log(summary);
}

/**
 * Hiển thị cảnh báo Captcha
 */
function showCaptchaWarning(username) {
    const warning = boxen(
        chalk.yellow.bold('⚠️  CAPTCHA DETECTED!\n\n') +
        chalk.white(`Tài khoản: ${maskUsername(username)}\n\n`) +
        chalk.cyan('👉 Vui lòng chuyển sang cửa sổ trình duyệt\n') +
        chalk.cyan('   và giải Captcha thủ công.\n\n') +
        chalk.gray('Tool sẽ tự động tiếp tục sau khi bạn giải xong.'),
        {
            padding: 1,
            margin: { top: 0, bottom: 0, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: 'yellow'
        }
    );

    console.log(warning);
}

/**
 * Hiển thị log trạng thái
 */
function logStatus(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const prefix = chalk.gray(`[${timestamp}]`);

    switch (type) {
        case 'success':
            console.log(`${prefix} ${chalk.green('✅')} ${chalk.green(message)}`);
            break;
        case 'error':
            console.log(`${prefix} ${chalk.red('❌')} ${chalk.red(message)}`);
            break;
        case 'warning':
            console.log(`${prefix} ${chalk.yellow('⚠️')} ${chalk.yellow(message)}`);
            break;
        case 'captcha':
            console.log(`${prefix} ${chalk.yellow('🔐')} ${chalk.yellow.bold(message)}`);
            break;
        default:
            console.log(`${prefix} ${chalk.blue('ℹ️')} ${chalk.white(message)}`);
    }
}

// ─── Helper Functions ───────────────────────────────────────

/**
 * Mask username để bảo mật (hiển thị 3 ký tự đầu + ***)
 */
function maskUsername(username) {
    if (!username || username.length <= 3) return username;
    return username.substring(0, 3) + '*'.repeat(Math.min(username.length - 3, 5));
}

/**
 * Tô màu OVR theo mức
 */
function getOvrColor(ovr) {
    const num = parseInt(ovr);
    if (isNaN(num)) return chalk.gray(ovr);
    if (num >= 120) return chalk.red.bold(ovr);
    if (num >= 110) return chalk.magenta.bold(ovr);
    if (num >= 100) return chalk.yellow.bold(ovr);
    if (num >= 90) return chalk.green(ovr);
    return chalk.white(ovr);
}

/**
 * Tô màu trạng thái
 */
function getStatusColor(status) {
    if (!status) return chalk.gray('-');

    const s = status.toLowerCase();
    if (s.includes('thành công') || s.includes('hoàn thành') || s.includes('✅')) {
        return chalk.green(status);
    }
    if (s.includes('captcha') || s.includes('chờ') || s.includes('⚠️')) {
        return chalk.yellow(status);
    }
    if (s.includes('sai') || s.includes('lỗi') || s.includes('khóa') ||
        s.includes('wrong') || s.includes('❌') || s.includes('🔒')) {
        return chalk.red(status);
    }
    if (s.includes('đang') || s.includes('truy cập')) {
        return chalk.cyan(status);
    }
    return chalk.white(status);
}

module.exports = {
    showBanner,
    showOverview,
    showProgress,
    showResultTable,
    showSummary,
    showCaptchaWarning,
    logStatus,
    maskUsername
};
