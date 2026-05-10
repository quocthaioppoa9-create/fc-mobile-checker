#!/usr/bin/env node
// index.js - FC Mobile VN Account Checker - Main Entry Point

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

// Modules
const { parseAccounts, parseProxies, saveResult, saveResultFormatted, delay, formatTime } = require('./utils');
const ProxyManager = require('./proxy-helper');
const { performLogin, performLogout } = require('./login');
const { scrapeData } = require('./scraper');
const ui = require('./ui');

// Áp dụng Stealth Plugin
puppeteer.use(StealthPlugin());

// ─── Cấu hình ────────────────────────────────────────────────
const CONFIG = {
    AVG_TIME_PER_ACCOUNT: 120,  // Thời gian ước tính trung bình mỗi acc (giây)
    HEADLESS: false,            // false = mở trình duyệt cho user giải captcha
    VIEWPORT: { width: 1280, height: 800 },
    RESULT_FILE: 'result.txt',
    USER_DATA_DIR: path.join(__dirname, '.browser_data'),
    SLOW_MO: 30,               // Tốc độ gõ (ms) - giống người thật hơn
};

// ─── Main Function ───────────────────────────────────────────
async function main() {
    // Hiển thị banner
    ui.showBanner();

    // Nhập dữ liệu từ người dùng
    const input = await getUserInput();

    // Parse tài khoản
    const accounts = parseAccounts(input.accountList);
    if (accounts.length === 0) {
        ui.logStatus('Không tìm thấy tài khoản hợp lệ nào!', 'error');
        process.exit(1);
    }

    // Parse proxy
    const proxies = parseProxies(input.proxyList);
    const proxyManager = new ProxyManager(proxies);

    // Hiển thị tổng quan
    const estimatedTime = accounts.length * CONFIG.AVG_TIME_PER_ACCOUNT;
    ui.showOverview(accounts.length, proxies.length, estimatedTime);

    // Xác nhận
    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Bắt đầu kiểm tra?',
        default: true
    }]);

    if (!confirm) {
        ui.logStatus('Đã hủy.', 'warning');
        process.exit(0);
    }

    // Bắt đầu kiểm tra
    const startTime = Date.now();
    ui.logStatus(`Bắt đầu kiểm tra ${accounts.length} tài khoản...`, 'info');

    // Khởi tạo trình duyệt
    let browser = null;

    try {
        browser = await launchBrowser(proxyManager.getNext());

        const page = (await browser.pages())[0] || await browser.newPage();
        await setupPage(page);

        // Xử lý tuần tự từng tài khoản
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];

            // Hiển thị tiến trình
            ui.showProgress(i, accounts.length, account.username, 'Bắt đầu...', startTime);

            // Callback cập nhật trạng thái
            const onStatusChange = (status) => {
                account.status = status;
                ui.logStatus(`[${account.username.substring(0, 5)}***] ${status}`);

                // Hiển thị cảnh báo captcha
                if (status.toLowerCase().includes('captcha') && !status.includes('Còn')) {
                    ui.showCaptchaWarning(account.username);
                }
            };

            try {
                // Bước 1: Đăng nhập
                onStatusChange('Đang đăng nhập...');
                const loginResult = await performLogin(page, account.username, account.password, onStatusChange);

                if (loginResult.success) {
                    // Bước 2: Lấy dữ liệu
                    onStatusChange('Đang lấy dữ liệu FC Mobile...');
                    const gameData = await scrapeData(page, onStatusChange);

                    // Cập nhật dữ liệu
                    account.ovr = gameData.ovr || '-';
                    account.gem = gameData.gem || '-';
                    account.coin = gameData.coin || '-';
                    account.maxPlayer = gameData.maxPlayer || '-';
                    account.fv = gameData.fv || '-';
                    account.status = '✅ Hoàn thành';

                    // Lưu kết quả ngay
                    saveResult(account, CONFIG.RESULT_FILE);
                    ui.logStatus(`Hoàn thành: ${account.username.substring(0, 5)}***`, 'success');

                } else {
                    // Xử lý các lỗi đăng nhập
                    switch (loginResult.error) {
                        case 'wrong_password':
                            account.status = '❌ Sai mật khẩu';
                            ui.logStatus(`Sai mật khẩu: ${account.username.substring(0, 5)}***`, 'error');
                            break;
                        case 'locked':
                            account.status = '🔒 Tài khoản bị khóa';
                            ui.logStatus(`Tài khoản bị khóa: ${account.username.substring(0, 5)}***`, 'error');
                            break;
                        case 'timeout':
                            account.status = '⏰ Timeout (chờ Captcha quá lâu)';
                            ui.logStatus(`Timeout: ${account.username.substring(0, 5)}***`, 'warning');
                            break;
                        default:
                            account.status = `❌ Lỗi: ${loginResult.error || 'Không xác định'}`;
                            ui.logStatus(`Lỗi: ${account.username.substring(0, 5)}*** - ${loginResult.error}`, 'error');
                    }

                    // Vẫn ghi lại kết quả lỗi
                    saveResult(account, CONFIG.RESULT_FILE);
                }

                // Bước 3: Đăng xuất
                onStatusChange('Đang đăng xuất...');
                await performLogout(page);
                await delay(2000);

            } catch (accountError) {
                account.status = `❌ Lỗi: ${accountError.message}`;
                ui.logStatus(`Lỗi xử lý acc ${account.username.substring(0, 5)}***: ${accountError.message}`, 'error');
                saveResult(account, CONFIG.RESULT_FILE);

                // Thử reload page
                try {
                    await page.goto('about:blank');
                    await delay(1000);
                } catch (e) { }
            }

            // Hiển thị bảng kết quả cập nhật
            ui.showResultTable(accounts.slice(0, i + 1));

            // Delay giữa các tài khoản (random để tự nhiên hơn)
            if (i < accounts.length - 1) {
                const waitTime = 3000 + Math.random() * 5000;
                ui.logStatus(`Chờ ${(waitTime / 1000).toFixed(1)}s trước acc tiếp theo...`);
                await delay(waitTime);
            }
        }

    } catch (error) {
        ui.logStatus(`Lỗi nghiêm trọng: ${error.message}`, 'error');
        console.error(error);
    } finally {
        // Đóng trình duyệt
        if (browser) {
            try {
                await browser.close();
            } catch (e) { }
        }
    }

    // Hiển thị kết quả cuối cùng
    console.log('\n');
    ui.showResultTable(accounts);
    ui.showSummary(accounts, startTime);

    // Lưu file kết quả tổng hợp
    saveResultFormatted(accounts, CONFIG.RESULT_FILE);
    ui.logStatus(`Kết quả đã được lưu vào ${CONFIG.RESULT_FILE}`, 'success');
}

// ─── Hàm nhập dữ liệu từ người dùng ────────────────────────
async function getUserInput() {
    console.log(chalk_safe('\n  Nhập dữ liệu (hoặc đường dẫn file):'));
    console.log(chalk_safe('  Định dạng hỗ trợ:'));
    console.log(chalk_safe('    • taikhoan:matkhau'));
    console.log(chalk_safe('    • https://xxxxx.connect.garena.com:taikhoan:matkhau'));
    console.log(chalk_safe('    • Hoặc nhập đường dẫn file .txt\n'));

    const answers = await inquirer.prompt([
        {
            type: 'editor',
            name: 'accountList',
            message: 'Nhập danh sách tài khoản (mở editor, mỗi dòng 1 acc):',
            default: '# Nhập tài khoản ở đây, mỗi dòng 1 tài khoản\n# Định dạng: taikhoan:matkhau\n# Hoặc: https://100054.connect.garena.com:taikhoan:matkhau\n\n',
            validate: (input) => {
                const accounts = parseAccounts(input);
                if (accounts.length === 0) {
                    return 'Không tìm thấy tài khoản hợp lệ. Vui lòng nhập đúng định dạng!';
                }
                return true;
            },
            postfix: '.txt'
        },
        {
            type: 'confirm',
            name: 'useProxy',
            message: 'Bạn có muốn sử dụng Proxy không?',
            default: false
        },
        {
            type: 'editor',
            name: 'proxyList',
            message: 'Nhập danh sách proxy (ip:port hoặc ip:port:user:pass):',
            default: '# Nhập proxy ở đây, mỗi dòng 1 proxy\n# Định dạng: ip:port hoặc ip:port:user:pass\n\n',
            when: (answers) => answers.useProxy
        }
    ]);

    // Hỗ trợ đọc từ file
    if (answers.accountList.trim().endsWith('.txt') && fs.existsSync(answers.accountList.trim())) {
        answers.accountList = fs.readFileSync(answers.accountList.trim(), 'utf8');
    }

    if (answers.proxyList && answers.proxyList.trim().endsWith('.txt') && fs.existsSync(answers.proxyList.trim())) {
        answers.proxyList = fs.readFileSync(answers.proxyList.trim(), 'utf8');
    }

    return {
        accountList: answers.accountList || '',
        proxyList: answers.proxyList || ''
    };
}

// ─── Hàm khởi tạo trình duyệt ──────────────────────────────
async function launchBrowser(proxy = null) {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--lang=vi-VN',
    ];

    // Thêm proxy nếu có
    if (proxy) {
        const proxyArg = ProxyManager.toProxyArg(proxy);
        if (proxyArg) {
            args.push(proxyArg);
            ui.logStatus(`Sử dụng proxy: ${proxy.host}:${proxy.port}`, 'info');
        }
    }

    const browser = await puppeteer.launch({
        headless: CONFIG.HEADLESS,
        args: args,
        slowMo: CONFIG.SLOW_MO,
        defaultViewport: CONFIG.VIEWPORT,
        ignoreHTTPSErrors: true,
        // userDataDir: CONFIG.USER_DATA_DIR,  // Uncomment nếu muốn lưu session
    });

    // Xử lý proxy authentication
    if (proxy && ProxyManager.hasAuth(proxy)) {
        const pages = await browser.pages();
        const page = pages[0];
        await page.authenticate({
            username: proxy.username,
            password: proxy.password
        });
    }

    return browser;
}

// ─── Hàm setup page ─────────────────────────────────────────
async function setupPage(page) {
    // Thiết lập viewport
    await page.setViewport(CONFIG.VIEWPORT);

    // Giả lập user agent thực
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Thiết lập ngôn ngữ
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    // Override navigator properties để tránh detection
    await page.evaluateOnNewDocument(() => {
        // Override webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['vi-VN', 'vi', 'en-US', 'en'],
        });

        // Override platform
        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
        });

        // Remove automation indicators
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

        // Override chrome
        window.chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
    });

    // Thiết lập timeout
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(15000);
}

// ─── Hàm hỗ trợ safe chalk ──────────────────────────────────
function chalk_safe(text) {
    try {
        const chalk = require('chalk');
        return chalk.gray(text);
    } catch {
        return text;
    }
}

// ─── Xử lý thoát ────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n');
    ui.logStatus('Đang thoát... Kết quả đã được lưu vào result.txt', 'warning');
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    ui.logStatus(`Unhandled error: ${error.message}`, 'error');
});

// ─── Chạy ────────────────────────────────────────────────────
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
