// scraper.js - Module lấy dữ liệu FC Mobile
const { delay } = require('./utils');

// URLs liên quan đến FC Mobile VN
const FC_MOBILE_URLS = {
    // Trang web event FC Mobile VN
    eventPage: 'https://fcmobile.garena.vn/',
    profile: 'https://fcmobile.garena.vn/profile',
    webEvent: 'https://fcmobile.garena.vn/event',

    // API endpoints (nếu có)
    apiProfile: 'https://fcmobile.garena.vn/api/profile',
    apiTeam: 'https://fcmobile.garena.vn/api/team',

    // Trang Garena account
    garenaAccount: 'https://account.garena.com/',
};

/**
 * Lấy dữ liệu FC Mobile sau khi đăng nhập
 * @param {import('puppeteer').Page} page
 * @param {Function} onStatusChange
 * @returns {Object} Dữ liệu FC Mobile
 */
async function scrapeData(page, onStatusChange = () => { }) {
    const data = {
        ovr: '-',
        gem: '-',
        coin: '-',
        maxPlayer: '-',
        fv: '-'
    };

    try {
        onStatusChange('Đang truy cập FC Mobile...');

        // Phương pháp 1: Truy cập trang web FC Mobile VN
        const result1 = await scrapeFromWebEvent(page, onStatusChange);
        if (result1) Object.assign(data, result1);

        // Phương pháp 2: Thử lấy qua API nếu có
        if (data.ovr === '-') {
            const result2 = await scrapeFromAPI(page, onStatusChange);
            if (result2) Object.assign(data, result2);
        }

        // Phương pháp 3: Lấy từ trang profile Garena
        if (data.ovr === '-') {
            const result3 = await scrapeFromGarenaProfile(page, onStatusChange);
            if (result3) Object.assign(data, result3);
        }

        onStatusChange('Đã lấy xong dữ liệu');

    } catch (error) {
        onStatusChange(`Lỗi lấy dữ liệu: ${error.message}`);
    }

    return data;
}

/**
 * Lấy dữ liệu từ trang web event FC Mobile
 */
async function scrapeFromWebEvent(page, onStatusChange) {
    try {
        onStatusChange('Truy cập trang FC Mobile VN...');

        await page.goto(FC_MOBILE_URLS.eventPage, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        await delay(3000);

        // Kiểm tra đã đăng nhập trên trang FC Mobile chưa
        const isLoggedIn = await page.evaluate(() => {
            // Tìm các indicator đã đăng nhập
            const indicators = [
                '.user-info', '.player-info', '.profile-section',
                '[class*="logged"]', '[class*="user-name"]',
                '.ovr-display', '.team-ovr'
            ];

            for (const sel of indicators) {
                if (document.querySelector(sel)) return true;
            }

            return false;
        });

        if (!isLoggedIn) {
            onStatusChange('Chưa đăng nhập trên FC Mobile, thử phương pháp khác...');
            return null;
        }

        // Lấy dữ liệu từ trang
        const data = await page.evaluate(() => {
            const result = {};

            // Hàm helper lấy text từ selector
            const getText = (selectors) => {
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el.textContent.trim();
                }
                return null;
            };

            // Hàm helper lấy số từ text
            const extractNumber = (text) => {
                if (!text) return null;
                const match = text.replace(/,/g, '').match(/[\d,]+/);
                return match ? match[0] : null;
            };

            // Lấy OVR đội
            const ovrSelectors = [
                '.team-ovr', '.ovr-value', '.overall-rating',
                '[class*="ovr"]', '[class*="rating"]',
                '.team-overall', '.squad-ovr'
            ];
            result.ovr = extractNumber(getText(ovrSelectors)) || '-';

            // Lấy Gem
            const gemSelectors = [
                '.gem-count', '.gem-value', '.gems',
                '[class*="gem"]', '[class*="diamond"]',
                '.currency-gem', '.fifa-point'
            ];
            result.gem = extractNumber(getText(gemSelectors)) || '-';

            // Lấy Coin
            const coinSelectors = [
                '.coin-count', '.coin-value', '.coins',
                '[class*="coin"]', '[class*="gold"]',
                '.currency-coin'
            ];
            result.coin = extractNumber(getText(coinSelectors)) || '-';

            // Lấy FV (Face Value hoặc FIFA Value)
            const fvSelectors = [
                '.fv-value', '.face-value', '.fifa-value',
                '[class*="fv"]', '.team-value'
            ];
            result.fv = extractNumber(getText(fvSelectors)) || '-';

            // Lấy cầu thủ OVR cao nhất
            const playerElements = document.querySelectorAll(
                '.player-card, .player-item, [class*="player"]'
            );
            let maxOvr = 0;
            let maxPlayerName = '-';

            playerElements.forEach(el => {
                const ovrEl = el.querySelector('[class*="ovr"], [class*="rating"]');
                const nameEl = el.querySelector('[class*="name"]');
                if (ovrEl) {
                    const ovr = parseInt(ovrEl.textContent.replace(/\D/g, ''));
                    if (ovr > maxOvr) {
                        maxOvr = ovr;
                        maxPlayerName = nameEl ? nameEl.textContent.trim() : `OVR ${ovr}`;
                    }
                }
            });

            if (maxOvr > 0) {
                result.maxPlayer = `${maxPlayerName} (${maxOvr})`;
            } else {
                result.maxPlayer = '-';
            }

            return result;
        });

        return data;

    } catch (error) {
        return null;
    }
}

/**
 * Lấy dữ liệu qua API FC Mobile (nếu có)
 */
async function scrapeFromAPI(page, onStatusChange) {
    try {
        onStatusChange('Thử lấy dữ liệu qua API...');

        // Thử gọi các API endpoint
        const apiEndpoints = [
            FC_MOBILE_URLS.apiProfile,
            FC_MOBILE_URLS.apiTeam,
            'https://fcmobile.garena.vn/api/user/info',
            'https://fcmobile.garena.vn/api/user/team',
        ];

        for (const endpoint of apiEndpoints) {
            try {
                const response = await page.evaluate(async (url) => {
                    try {
                        const res = await fetch(url, {
                            credentials: 'include',
                            headers: {
                                'Accept': 'application/json'
                            }
                        });
                        if (res.ok) {
                            return await res.json();
                        }
                    } catch (e) {
                        return null;
                    }
                    return null;
                }, endpoint);

                if (response) {
                    return parseApiResponse(response);
                }
            } catch (e) {
                continue;
            }
        }

        return null;

    } catch (error) {
        return null;
    }
}

/**
 * Parse response từ API
 */
function parseApiResponse(response) {
    if (!response) return null;

    const data = {};

    // Thử các cấu trúc JSON phổ biến
    const tryGet = (obj, paths) => {
        for (const path of paths) {
            const keys = path.split('.');
            let value = obj;
            for (const key of keys) {
                if (value && typeof value === 'object' && key in value) {
                    value = value[key];
                } else {
                    value = undefined;
                    break;
                }
            }
            if (value !== undefined) return value;
        }
        return null;
    };

    data.ovr = tryGet(response, ['data.ovr', 'ovr', 'team_ovr', 'data.team_ovr']) || '-';
    data.gem = tryGet(response, ['data.gem', 'gem', 'gems', 'data.gems', 'data.fifa_point']) || '-';
    data.coin = tryGet(response, ['data.coin', 'coin', 'coins', 'data.coins', 'data.gold']) || '-';
    data.fv = tryGet(response, ['data.fv', 'fv', 'face_value', 'data.face_value']) || '-';

    const maxPlayer = tryGet(response, ['data.best_player', 'best_player', 'data.max_player']);
    if (maxPlayer) {
        data.maxPlayer = typeof maxPlayer === 'object'
            ? `${maxPlayer.name || 'Unknown'} (${maxPlayer.ovr || '?'})`
            : maxPlayer.toString();
    } else {
        data.maxPlayer = '-';
    }

    return data;
}

/**
 * Lấy dữ liệu từ trang profile Garena
 */
async function scrapeFromGarenaProfile(page, onStatusChange) {
    try {
        onStatusChange('Truy cập trang Garena Profile...');

        await page.goto(FC_MOBILE_URLS.garenaAccount, {
            waitUntil: 'networkidle2',
            timeout: 20000
        });
        await delay(2000);

        // Lấy thông tin cơ bản từ Garena Account
        const data = await page.evaluate(() => {
            const result = {
                ovr: '-',
                gem: '-',
                coin: '-',
                maxPlayer: '-',
                fv: '-'
            };

            // Kiểm tra xem có thông tin game FC Mobile không
            const gameCards = document.querySelectorAll(
                '.game-card, .game-info, [class*="game"], [class*="fc-mobile"]'
            );

            gameCards.forEach(card => {
                const text = card.textContent.toLowerCase();
                if (text.includes('fc mobile') || text.includes('fifa mobile') ||
                    text.includes('ea sports')) {
                    // Thử lấy dữ liệu từ card
                    const numbers = card.textContent.match(/\d+/g);
                    if (numbers && numbers.length > 0) {
                        // Logic phân tích tùy theo cấu trúc trang
                    }
                }
            });

            return result;
        });

        return data;

    } catch (error) {
        return null;
    }
}

/**
 * Lấy dữ liệu bằng cách intercept network requests
 * (Phương pháp nâng cao - bắt response từ các API call)
 */
async function scrapeViaNetworkIntercept(page, onStatusChange) {
    return new Promise(async (resolve) => {
        const data = {
            ovr: '-',
            gem: '-',
            coin: '-',
            maxPlayer: '-',
            fv: '-'
        };

        let resolved = false;

        // Lắng nghe các response chứa dữ liệu game
        const responseHandler = async (response) => {
            try {
                const url = response.url();
                if ((url.includes('api') || url.includes('profile') || url.includes('team')) &&
                    response.headers()['content-type']?.includes('json')) {

                    const json = await response.json().catch(() => null);
                    if (json) {
                        const parsed = parseApiResponse(json);
                        if (parsed && parsed.ovr !== '-') {
                            Object.assign(data, parsed);
                            if (!resolved) {
                                resolved = true;
                                page.off('response', responseHandler);
                                resolve(data);
                            }
                        }
                    }
                }
            } catch (e) { }
        };

        page.on('response', responseHandler);

        // Navigate tới các trang để trigger API calls
        try {
            await page.goto(FC_MOBILE_URLS.eventPage, {
                waitUntil: 'networkidle2',
                timeout: 20000
            });
        } catch (e) { }

        // Timeout sau 15 giây
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                page.off('response', responseHandler);
                resolve(data);
            }
        }, 15000);
    });
}

module.exports = {
    scrapeData,
    scrapeFromWebEvent,
    scrapeFromAPI,
    scrapeFromGarenaProfile,
    scrapeViaNetworkIntercept,
    FC_MOBILE_URLS
};
