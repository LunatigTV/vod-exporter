import 'dotenv/config';
import { exportLatestVod } from './exporter.js';

const channelName = process.env.BROADCASTER_NAME!;
const authToken = process.env.TWITCH_AUTH_TOKEN!;

async function runTest() {
    if (!channelName || !authToken) {
        console.error('Missing BROADCASTER_NAME or TWITCH_AUTH_TOKEN in environment');
        process.exit(1);
    }

    await exportLatestVod(channelName, authToken, {
        headless: process.env.HEADLESS !== 'false',     // Set to true if testing inside a Docker container
        dryRun: false,          // Set to false when you want it to trigger an actual export
        takeScreenshots: false, // Saves .png files to inspect selector matches
    });
}

runTest().catch((err) => {
    console.error('Test run error:', err);
    process.exit(1);
});