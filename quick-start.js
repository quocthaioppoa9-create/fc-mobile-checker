#!/usr/bin/env node
// quick-start.js - Chế độ khởi động nhanh từ file
// Sử dụng: node quick-start.js accounts.txt [proxies.txt]

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

const { parseAccounts, parseProxies, saveResult, saveResultFormatted, delay } = require('./utils');
const ProxyManager = require('./proxy-helper');
const { performLogin, performLogout } = require('./login');
const { scrapeData } = require('./scraper');
const ui = require('./ui');

puppeteer.use(StealthPlugin());

async function quickStart() {
    ui.showBanner();

    // Đọc arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('\n  Cách sử dụng:');
        console.log('    node quick-start.js <file_accounts.txt> [file_proxies.txt]\n');
        console.log('  Ví dụ:');
        console.log('    node quick-start.js accounts.txt');
        console.log('    node quick-start.js accounts.txt proxies.txt\n');
        process.exit(0);
    }

    // Đọc file tài khoản
    const accountFile = args[0];
    if (!fs.existsSync(accountFile)) {
        ui.logStatus(`Không tìm thấy file: ${accountFile}`, 'error');
        process.exit(1);
    }

    const accountRaw = fs.readFileSync(accountFile, 'utf8');
    const accounts = parseAccounts(accountRaw);

    if (accounts.length === 0) {
        ui.logStatus('Không tìm thấy tài khoản hợp lệ trong file!', 'error');
        process.exit(1);
    }

    // Đọc file proxy (nếu có)
    let proxies = [];
    if (args[1] && fs.existsSync(args[1])) {
        const proxyRaw = fs.readFileSync(args[1], 'utf8');
        proxies = parseProxies(proxyRaw);
    }

    const proxyManager = new ProxyManager(proxies);
    const estimatedTime = accounts.length * 120;

    ui.showOverview(accounts.length, proxies.length, estimatedTime);
    ui.logStatus(`Bắt đầu kiểm tra ${accounts.length} tài khoản...`, 'info');

    const startTime = Date.now();
    let browser = null;

    try {
        // Launch browser
        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,800',
            '--lang=vi-VN'
        ];

        const proxy = proxyManager.getNext();
        if (proxy) {
            launchArgs.push(`--proxy-server=http://${proxy.host}:${proxy.port}`);
        }

        browser = await puppeteer.launch({
            headless: false,
            args: launchArgs,
            slowMo: 30,
            defaultViewport: { width: 1280, height: 800 }
        });

        const page = (await browser.pages())[0];

        // Setup anti-detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        if (proxy && proxy.username) {
            await page.authenticate({ username: proxy.username, password: proxy.password });
        }

        // Xử lý tuần tự
        for (let i = 0; i < accounts.length; i++) {
            const acc = accounts[i];

            ui.showProgress(i, accounts.length, acc.username, 'Bắt đầu...', startTime);

            const onStatus = (status) => {
                acc.status = status;
                ui.logStatus(`[${i + 1}/${accounts.length}] ${acc.username.substring(0, 5)}*** - ${status}`);
                if (status.toLowerCase().includes('captcha') && !status.includes('Còn')) {
                    ui.showCaptchaWarning(acc.username);
                }
            };

            try {
                // Login
                const loginResult = await performLogin(page, acc.username, acc.password, onStatus);

                if (loginResult.success) {
                    // Scrape data
                    const data = await scrapeData(page, onStatus);
                    Object.assign(acc, data);
                    acc.status = '✅ Hoàn thành';
                    saveResult(acc);
                    ui.logStatus(`✅ ${acc.username.substring(0, 5)}*** - OVR: ${acc.ovr}`, 'success');
                } else {
                    acc.status = loginResult.error === 'wrong_password'
                        ? '❌ Sai mật khẩu'
                        : `❌ ${loginResult.status}`;
                    saveResult(acc);
                }

                // Logout
                await performLogout(page);
                await delay(3000 + Math.random() * 4000);

            } catch (err) {
                acc.status = `❌ Lỗi: ${err.message}`;
                saveResult(acc);
                try { await page.goto('about:blank'); } catch (e) { }
            }

            // Cập nhật bảng kết quả
            if ((i + 1) % 3 === 0 || i === accounts.length - 1) {
                ui.showResultTable(accounts.slice(0, i + 1));
            }
        }

    } catch (error) {
        ui.logStatus(`Lỗi: ${error.message}`, 'error');
    } finally {
        if (browser) {
            try { await browser.close(); } catch (e) { }
        }
    }

    // Tổng kết
    ui.showResultTable(accounts);
    ui.showSummary(accounts, startTime);
    saveResultFormatted(accounts);
}

process.on('SIGINT', () => {
    console.log('\nĐang thoát...');
    process.exit(0);
});

quickStart().catch(console.error);
