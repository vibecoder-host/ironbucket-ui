// Authentication management
let S3_CONFIG = null;
let s3Signer = null;

// Get S3 Configuration from localStorage
function getS3Config() {
    const stored = localStorage.getItem('s3_credentials');

    if (!stored) {
        return null;
    }

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error('Invalid stored credentials:', e);
        localStorage.removeItem('s3_credentials');
        return null;
    }
}

// Initialize S3 configuration
function initializeS3Config() {
    S3_CONFIG = getS3Config();

    if (S3_CONFIG) {
        s3Signer = new AwsV4Signer(S3_CONFIG);
        // Make S3_CONFIG globally accessible for other scripts
        window.S3_CONFIG = S3_CONFIG;
        return true;
    }
    return false;
}

// Check if user is authenticated
function isAuthenticated() {
    return localStorage.getItem('s3_credentials') !== null;
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('s3_credentials');
        localStorage.removeItem('s3_endpoint');
        window.location.href = 'login.html';
    }
}

// AWS Signature Version 4 implementation
class AwsV4Signer {
    constructor(config) {
        this.accessKey = config.accessKey;
        this.secretKey = config.secretKey;
        this.region = config.region || 'us-east-1';
        this.service = 's3';
    }

    async sign(request) {
        const url = new URL(request.url);
        const method = request.method || 'GET';
        const headers = request.headers || {};
        const body = request.body || '';

        // Add required headers
        const amzDate = this.getAmzDate();
        const dateStamp = amzDate.substr(0, 8);

        headers['x-amz-date'] = amzDate;
        headers['host'] = url.hostname;

        if (body && method !== 'GET' && method !== 'HEAD') {
            headers['x-amz-content-sha256'] = await this.hash(body);
        } else {
            headers['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';
        }

        // Create canonical request
        const canonicalUri = url.pathname;
        const canonicalQueryString = this.getCanonicalQueryString(url.searchParams);
        const canonicalHeaders = this.getCanonicalHeaders(headers);
        const signedHeaders = this.getSignedHeaders(headers);

        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            headers['x-amz-content-sha256']
        ].join('\n');

        // Create string to sign
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
        const stringToSign = [
            algorithm,
            amzDate,
            credentialScope,
            await this.hash(canonicalRequest)
        ].join('\n');

        // Calculate signature
        const signingKey = await this.getSignatureKey(dateStamp);
        const signature = await this.hmac(signingKey, stringToSign);

        // Add authorization header
        headers['Authorization'] = `${algorithm} Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return headers;
    }

    getAmzDate() {
        const date = new Date();
        return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    }

    getCanonicalQueryString(params) {
        const sorted = Array.from(params.entries()).sort();
        return sorted.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    }

    getCanonicalHeaders(headers) {
        const sorted = Object.entries(headers)
            .filter(([k]) => k.toLowerCase() !== 'authorization')
            .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
        return sorted.map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`).join('\n') + '\n';
    }

    getSignedHeaders(headers) {
        return Object.keys(headers)
            .filter(k => k.toLowerCase() !== 'authorization')
            .map(k => k.toLowerCase())
            .sort()
            .join(';');
    }

    async hash(string) {
        const encoder = new TextEncoder();
        const data = encoder.encode(string);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async hmac(key, string) {
        const encoder = new TextEncoder();
        const data = encoder.encode(string);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
        return Array.from(new Uint8Array(signature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async getSignatureKey(dateStamp) {
        const kDate = await this.hmacRaw(`AWS4${this.secretKey}`, dateStamp);
        const kRegion = await this.hmacRaw(kDate, this.region);
        const kService = await this.hmacRaw(kRegion, this.service);
        const kSigning = await this.hmacRaw(kService, 'aws4_request');
        return kSigning;
    }

    async hmacRaw(key, string) {
        const encoder = new TextEncoder();
        const keyData = typeof key === 'string' ? encoder.encode(key) : key;
        const data = encoder.encode(string);
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return await crypto.subtle.sign('HMAC', cryptoKey, data);
    }
}

// Signed fetch function
async function s3Fetch(url, options = {}) {
    if (!S3_CONFIG || !s3Signer) {
        throw new Error('Not authenticated. Please login first.');
    }

    const fullUrl = url.startsWith('http') ? url : `${S3_CONFIG.endpoint}${url}`;

    const request = {
        url: fullUrl,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body
    };

    const signedHeaders = await s3Signer.sign(request);

    return fetch(fullUrl, {
        ...options,
        headers: {
            ...options.headers,
            ...signedHeaders
        }
    });
}

// Expose functions globally
window.s3Fetch = s3Fetch;
window.logout = logout;