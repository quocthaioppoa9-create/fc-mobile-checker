// utils.js - Tiện ích phân tích đầu vào
const fs = require('fs');
const path = require('path');

/**
 * Phân tích danh sách tài khoản từ nhiều định dạng
 * Hỗ trợ:
 *   - https://100054.connect.garena.com:taikhoan:matkhau
 *   - taikhoan:matkhau
 *   - taikhoan|matkhau
 *   - taikhoan matkhau
 */
function parseAccounts(rawText) {
    const accounts = [];
    const lines = rawText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('#'));

    for (const line of lines) {
        let username = '';
        let password = '';

        // Định dạng 1: https://xxxxx.connect.garena.com:user:pass
        const garenaLinkRegex = /https?:\/\/[^:]+\.connect\.garena\.com[^:]*:([^:]+):(.+)/i;
        const garenaMatch = line.match(garenaLinkRegex);

        if (garenaMatch) {
            username = garenaMatch[1].trim();
            password = garenaMatch[2].trim();
        }
        // Định dạng 2: https://xxxxx.garena.com/...:user:pass (các biến thể khác)
        else if (line.includes('garena.com')) {
            const parts = line.split(':');
            // Bỏ qua phần https và domain, lấy 2 phần cuối
            if (parts.length >= 4) {
                password = parts[parts.length - 1].trim();
                username = parts[parts.length - 2].trim();
            }
        }
        // Định dạng 3: user:pass
        else if (line.includes(':')) {
            const colonIndex = line.indexOf(':');
            username = line.substring(0, colonIndex).trim();
            password = line.substring(colonIndex + 1).trim();
        }
        // Định dạng 4: user|pass
        else if (line.includes('|')) {
            const parts = line.split('|');
            username = parts[0].trim();
            password = parts[1].trim();
        }
        // Định dạng 5: user pass (cách bởi tab hoặc nhiều space)
        else if (line.includes('\t') || /\s{2,}/.test(line)) {
            const parts = line.split(/[\t\s]+/);
            if (parts.length >= 2) {
                username = parts[0].trim();
                password = parts.slice(1).join('').trim();
            }
        }

        if (username && password) {
            accounts.push({
                username,
                password,
                raw: line,
                status: 'Chờ xử lý',
                ovr: '-',
                gem: '-',
                coin: '-',
                maxPlayer: '-',
                fv: '-'
            });
        }
    }

    return accounts;
}

/**
 * Phân tích danh sách proxy
 * Hỗ trợ:
 *   - ip:port
 *   - ip:port:user:pass
 *   - http://ip:port
 *   - http://user:pass@ip:port
 */
function parseProxies(rawText) {
    const proxies = [];
    const lines = rawText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('#'));

    for (const line of lines) {
        let proxy = { host: '', port: '', username: '', password: '' };

        // Định dạng: http://user:pass@ip:port
        const urlRegex = /https?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/;
        const urlMatch = line.match(urlRegex);

        if (urlMatch) {
            proxy.username = urlMatch[1];
            proxy.password = urlMatch[2];
            proxy.host = urlMatch[3];
            proxy.port = urlMatch[4];
        }
        // Định dạng: http://ip:port
        else if (line.startsWith('http')) {
            const cleanUrl = line.replace(/https?:\/\//, '');
            const parts = cleanUrl.split(':');
            proxy.host = parts[0];
            proxy.port = parts[1] || '80';
        }
        // Định dạng: ip:port:user:pass
        else {
            const parts = line.split(':');
            proxy.host = parts[0];
            proxy.port = parts[1] || '80';
            if (parts.length >= 4) {
                proxy.username = parts[2];
                proxy.password = parts[3];
            }
        }

        if (proxy.host && proxy.port) {
            proxies.push(proxy);
        }
    }

    return proxies;
}

/**
 * Ghi kết quả ra file result.txt
 */
function saveResult(account, filePath = 'result.txt') {
    const timestamp = new Date().toLocaleString('vi-VN');
    const line = [
        `[${timestamp}]`,
        `Tài khoản: ${account.username}`,
        `OVR: ${account.ovr}`,
        `Gem: ${account.gem}`,
        `Coin: ${account.coin}`,
        `Cầu thủ Max OVR: ${account.maxPlayer}`,
        `FV: ${account.fv}`,
        `Trạng thái: ${account.status}`
    ].join(' | ');

    fs.appendFileSync(filePath, line + '\n', 'utf8');
}

/**
 * Ghi kết quả dạng bảng đẹp vào file
 */
function saveResultFormatted(accounts, filePath = 'result.txt') {
    const header = '='.repeat(120) + '\n';
    const title = `FC MOBILE VN - KẾT QUẢ CHECK - ${new Date().toLocaleString('vi-VN')}\n`;

    let content = header + title + header;
    content += formatLine('STT', 'Tài khoản', 'OVR', 'Gem', 'Coin', 'Max Player', 'FV', 'Trạng thái');
    content += '-'.repeat(120) + '\n';

    accounts.forEach((acc, i) => {
        content += formatLine(
            (i + 1).toString(),
            acc.username,
            acc.ovr,
            acc.gem,
            acc.coin,
            acc.maxPlayer,
            acc.fv,
            acc.status
        );
    });

    content += header;
    fs.writeFileSync(filePath, content, 'utf8');
}

function formatLine(stt, user, ovr, gem, coin, maxPlayer, fv, status) {
    return `${stt.padEnd(5)}| ${user.padEnd(20)}| ${ovr.toString().padEnd(8)}| ` +
        `${gem.toString().padEnd(10)}| ${coin.toString().padEnd(10)}| ` +
        `${maxPlayer.toString().padEnd(15)}| ${fv.toString().padEnd(10)}| ${status}\n`;
}

/**
 * Tạo delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format thời gian từ giây sang HH:MM:SS
 */
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

module.exports = {
    parseAccounts,
    parseProxies,
    saveResult,
    saveResultFormatted,
    delay,
    formatTime
};
