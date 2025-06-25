const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MLAuthService {
    constructor() {
        this.appId = process.env.ML_APP_ID;
        this.secretKey = process.env.ML_SECRET_KEY;
        this.redirectUri = process.env.ML_REDIRECT_URI;
        this.siteId = 'MCO'; // Colombia
        this.baseUrl = 'https://api.mercadolibre.com';
        this.authUrl = 'https://auth.mercadolibre.com.co';

        this.tokenFile = path.join(__dirname, 'ml-tokens.json');
        this.tokens = this.loadTokens();
    }

    // Generate authorization URL
    getAuthorizationUrl() {
        const state = crypto.randomBytes(16).toString('hex');

        const authUrl = `${this.authUrl}/authorization?response_type=code&client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}`;

        // Store state temporarily
        this.tempAuthData = { state };

        return { authUrl, state };
    }

    // Exchange authorization code for tokens
    async exchangeCodeForTokens(code, state) {
        try {
            // Validate state
            if (!this.tempAuthData || this.tempAuthData.state !== state) {
                throw new Error('Invalid state parameter');
            }

            const tokenData = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: this.appId,
                client_secret: this.secretKey,
                code: code,
                redirect_uri: this.redirectUri
            });

            const response = await axios.post(`${this.baseUrl}/oauth/token`, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const tokens = response.data;
            tokens.expires_at = Date.now() + (tokens.expires_in * 1000);

            this.tokens = tokens;
            this.saveTokens();

            // Clear temporary auth data
            this.tempAuthData = null;

            return tokens;
        } catch (error) {
            console.error('Error exchanging code for tokens:', error.response?.data || error.message);
            throw error;
        }
    }

    // Refresh access token
    async refreshToken() {
        try {
            if (!this.tokens.refresh_token) {
                throw new Error('No refresh token available');
            }

            const tokenData = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: this.appId,
                client_secret: this.secretKey,
                refresh_token: this.tokens.refresh_token
            });

            const response = await axios.post(`${this.baseUrl}/oauth/token`, tokenData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const newTokens = response.data;
            newTokens.expires_at = Date.now() + (newTokens.expires_in * 1000);

            this.tokens = newTokens;
            this.saveTokens();

            return newTokens;
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw error;
        }
    }

    // Check if token is valid and refresh if needed
    async ensureValidToken() {
        if (!this.tokens.access_token) {
            throw new Error('No access token available. Please authenticate first.');
        }

        // Check if token expires in the next 5 minutes
        const expiresIn = this.tokens.expires_at - Date.now();
        if (expiresIn < 5 * 60 * 1000) { // 5 minutes
            console.log('Token expiring soon, refreshing...');
            await this.refreshToken();
        }

        return this.tokens.access_token;
    }

    // Make authenticated API request
    async apiRequest(method, endpoint, data = null, headers = {}) {
        try {
            const accessToken = await this.ensureValidToken();

            const config = {
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                // Token might be invalid, try refreshing
                try {
                    await this.refreshToken();
                    const accessToken = await this.ensureValidToken();

                    const config = {
                        method,
                        url: `${this.baseUrl}${endpoint}`,
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            ...headers
                        }
                    };

                    if (data) {
                        config.data = data;
                    }

                    const response = await axios(config);
                    return response.data;
                } catch (refreshError) {
                    console.error('Failed to refresh token:', refreshError.response?.data || refreshError.message);
                    throw new Error('Authentication failed. Please re-authenticate.');
                }
            }

            console.error('API request failed:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get user information
    async getUserInfo() {
        return await this.apiRequest('GET', '/users/me');
    }

    // Get user's marketplace information
    async getMarketplaceInfo() {
        const userInfo = await this.getUserInfo();
        return await this.apiRequest('GET', `/marketplace/users/${userInfo.id}`);
    }

    // Check authentication status
    isAuthenticated() {
        return !!(this.tokens.access_token && this.tokens.expires_at > Date.now());
    }

    // Get current tokens (without sensitive data)
    getTokenInfo() {
        if (!this.tokens.access_token) {
            return { authenticated: false };
        }

        return {
            authenticated: true,
            expires_at: this.tokens.expires_at,
            expires_in: Math.max(0, Math.floor((this.tokens.expires_at - Date.now()) / 1000)),
            user_id: this.tokens.user_id,
            scope: this.tokens.scope
        };
    }

    // Load tokens from file
    loadTokens() {
        try {
            if (fs.existsSync(this.tokenFile)) {
                const data = fs.readFileSync(this.tokenFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading tokens:', error.message);
        }
        return {};
    }

    // Save tokens to file
    saveTokens() {
        try {
            fs.writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
        } catch (error) {
            console.error('Error saving tokens:', error.message);
        }
    }

    // Clear tokens (logout)
    clearTokens() {
        this.tokens = {};
        try {
            if (fs.existsSync(this.tokenFile)) {
                fs.unlinkSync(this.tokenFile);
            }
        } catch (error) {
            console.error('Error clearing tokens:', error.message);
        }
    }
}

module.exports = MLAuthService;
