import { chromium } from 'playwright';

interface ExportOptions {
    headless?: boolean;
    dryRun?: boolean; // If true, fills the form but stops before clicking "Exportieren starten"
    takeScreenshots?: boolean;
    customTitle?: string; // Optional custom title template (defaults to "VOD YYYY-MM-DD")
}

export async function exportLatestVod(
    channelName: string,
    authToken: string,
    options: ExportOptions = {}
): Promise<void> {
    const {
        headless = true,
        dryRun = false,
        takeScreenshots = true,
        customTitle
    } = options;

    console.log(`[Playwright] Launching browser (headless: ${headless}, dryRun: ${dryRun})...`);

    const browser = await chromium.launch({
        headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--js-flags=--max-old-space-size=256'
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
    });

    await context.addCookies([
        {
            name: 'auth-token',
            value: authToken,
            domain: '.twitch.tv',
            path: '/',
            httpOnly: false,
            secure: true,
            sameSite: 'None',
        },
    ]);

    await context.storageState({ path: 'twitchAuthState.json' });

    const page = await context.newPage();

    await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();

        if (
            ['image', 'media', 'font'].includes(resourceType) ||
            url.includes('google-analytics') ||
            url.includes('amazon-adsystem') ||
            url.includes('scorecardresearch')
        ) {
            return route.abort();
        }
        return route.continue();
    });

    try {
        console.log(`[Playwright] Navigating to Video Producer for ${channelName}...`);
        await page.goto(`https://dashboard.twitch.tv/u/${channelName}/content/video-producer`, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        // 1. Open options menu of the newest (first) VOD
        console.log('[Playwright] Locating options menu button on latest VOD...');
        const menuButton = page.getByLabel(/Video-Optionsmenü öffnen|Open Video Options Menu|Options/i).first();
        await menuButton.waitFor({ state: 'visible', timeout: 200000 });

        if (takeScreenshots) await page.screenshot({ path: 'step1-dashboard.png' });
        await menuButton.click();
        console.log('[Playwright] Clicked options menu button.');

        // 2. Click "Exportieren" / "Export"
        console.log('[Playwright] Selecting Export option...');
        const exportOption = page.getByRole('button', { name: /Exportieren|Export/i }).first();
        await exportOption.waitFor({ state: 'visible', timeout: 5000 });

        if (takeScreenshots) await page.screenshot({ path: 'step2-menu-opened.png' });
        await exportOption.click();

        // 3. Set Title
        const today = new Date().toISOString().split('T')[0];
        const finalTitle = customTitle ?? `VOD ${today}`;

        console.log(`[Playwright] Setting title to: "${finalTitle}"...`);
        const titleInput = page.getByRole('textbox', { name: /Titel|Title/i });
        await titleInput.waitFor({ state: 'visible', timeout: 10000 });
        await titleInput.fill(finalTitle);

        // 4. Clear Description
        console.log('[Playwright] Clearing description...');
        const descriptionInput = page.getByRole('textbox', { name: /Beschreibung|Description/i });
        if (await descriptionInput.isVisible()) {
            await descriptionInput.fill('');
        }

        // 5. Select "Privat" / "Private"
        console.log('[Playwright] Setting visibility to Private...');
        const privateRadio = page.locator('label').filter({ hasText: /Privat|Private/i }).first();
        if (await privateRadio.isVisible()) {
            await privateRadio.click();
        }

        if (takeScreenshots) await page.screenshot({ path: 'step3-modal-filled.png' });

        // 6. Confirm / Start Export
        const startExportBtn = page.getByRole('button', { name: /Exportieren starten|Start Export/i });
        await startExportBtn.waitFor({ state: 'visible', timeout: 5000 });

        if (dryRun) {
            console.log('[Playwright] [DRY RUN] Form filled successfully. Skipping submission.');
        } else {
            console.log('[Playwright] Clicking "Start Export"...');
            await startExportBtn.click();

            // Wait a moment for Twitch to acknowledge the request
            await page.waitForTimeout(3000);
            if (takeScreenshots) await page.screenshot({ path: 'step4-exported.png' });
            console.log('[Playwright] Export initiated successfully on Twitch.');
        }
    } catch (error) {
        if (takeScreenshots) await page.screenshot({ path: 'error-state.png' });
        console.error('[Playwright] Automation failed:', error);
        throw error;
    } finally {
        await browser.close();
    }
}