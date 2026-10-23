import 'dotenv/config';
import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { exportLatestVod } from './exporter.js';

function getEnv(key: string): string {
    const val = process.env[key];
    if (!val) {
        console.error(`[Fatal] Missing required environment variable: ${key}`);
        process.exit(1);
    }
    return val;
}

const clientId = getEnv('TWITCH_CLIENT_ID');
const clientSecret = getEnv('TWITCH_CLIENT_SECRET');
const userAccessToken = getEnv('TWITCH_USER_ACCESS_TOKEN').replace(/^oauth:/i, '');
const refreshToken = getEnv('TWITCH_REFRESH_TOKEN');
const broadcasterId = getEnv('BROADCASTER_ID');
const broadcasterName = getEnv('BROADCASTER_NAME');
const authToken = getEnv('TWITCH_AUTH_TOKEN');

const authProvider = new RefreshingAuthProvider({
    clientId,
    clientSecret,
});

async function main() {
    const botUserId = await authProvider.addUserForToken({
        accessToken: userAccessToken,
        refreshToken: refreshToken,
        expiresIn: 0,
        obtainmentTimestamp: 0,
    });

    console.log(`[Auth] Registered bot user ID: ${botUserId}`);

    // Route any requested user context directly to the bot's token
    const originalGetAccessToken = authProvider.getAccessTokenForUser.bind(authProvider);
    authProvider.getAccessTokenForUser = async (user, scopes) => {
        return originalGetAccessToken(botUserId, scopes);
    };

    const apiClient = new ApiClient({ authProvider });

    // 1. Force-delete ALL subscriptions owned by this user across ALL statuses
    console.log('[EventSub] Purging all subscriptions for this user...');
    try {
        const subs = await apiClient.eventSub.getSubscriptionsForUser(botUserId);
        for (const sub of subs.data) {
            console.log(`[EventSub] Deleting sub ID: ${sub.id} (status: ${sub.status}, type: ${sub.type})`);
            await apiClient.eventSub.deleteAllSubscriptions();
        }
    } catch (err) {
        console.warn('[EventSub] Warning during cleanup:', err);
    }

    // 2. Initialize and start the WebSocket listener
    const listener = new EventSubWsListener({ apiClient });
    await listener.start();
    console.log(`[EventSub] Connected. Subscribing to offline events for broadcaster: ${broadcasterId}`);

    listener.onStreamOffline(broadcasterId, async (event) => {
        console.log(`[EventSub] Stream offline detected for ${event.broadcasterDisplayName}!`);
        console.log('[Runner] Waiting 3 minutes for Twitch to finalize the VOD manifest...');

        setTimeout(async () => {
            try {
                await exportLatestVod(broadcasterName, authToken);
            } catch (err) {
                console.error('[Runner] Export failed:', err);
            }
        }, 180000);
    });
}

main().catch(console.error);