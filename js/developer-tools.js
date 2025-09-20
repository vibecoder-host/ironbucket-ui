// Developer Tools for IronBucket UI
// Provides advanced bucket management and debugging capabilities

class DeveloperTools {
    constructor() {
        this.currentBucketSettings = {};
        this.apiKeys = [];
        this.s3RequestHistory = [];
        this.performanceMetrics = {};
        this.maxRequestHistory = 100;

        // Initialize performance tracking
        this.initializePerformanceTracking();
    }

    // ============ BUCKET SETTINGS ============

    async getBucketSettings(bucketName) {
        try {
            // First, ensure the bucket exists in IronBucket's internal state
            // by making a HEAD request to the bucket
            await this.ensureBucketExists(bucketName);

            const settings = {
                encryption: await this.getBucketEncryption(bucketName),
                versioning: await this.getBucketVersioning(bucketName),
                lifecycle: await this.getBucketLifecycle(bucketName),
                cors: await this.getBucketCors(bucketName),
                policy: await this.getBucketPolicy(bucketName),
                notifications: await this.getBucketNotifications(bucketName)
            };

            this.currentBucketSettings = settings;
            return settings;
        } catch (error) {
            console.error('Error getting bucket settings:', error);
            throw error;
        }
    }

    async ensureBucketExists(bucketName) {
        try {
            // Make a HEAD request to the bucket to ensure it exists in IronBucket's state
            const response = await s3Fetch(`/${bucketName}`, {
                method: 'HEAD'
            });

            // If bucket doesn't exist in IronBucket's state, try creating it
            if (!response.ok && response.status === 404) {
                console.log('Bucket not found in IronBucket state, attempting to create...');
                const createResponse = await s3Fetch(`/${bucketName}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/xml'
                    }
                });
                if (!createResponse.ok && createResponse.status !== 409) { // 409 means bucket already exists
                    console.warn('Could not ensure bucket exists in IronBucket state');
                }
            }
        } catch (error) {
            console.warn('Error ensuring bucket exists:', error);
        }
    }

    async getBucketEncryption(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?encryption`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseEncryptionXml(xml);
            }
            return { enabled: false };
        } catch (error) {
            console.error('Error getting bucket encryption:', error);
            return { enabled: false };
        }
    }

    async setBucketEncryption(bucketName, enabled, algorithm = 'AES256') {
        try {
            if (enabled) {
                const encryptionXml = `<?xml version="1.0" encoding="UTF-8"?>
<ServerSideEncryptionConfiguration>
    <Rule>
        <ApplyServerSideEncryptionByDefault>
            <SSEAlgorithm>${algorithm}</SSEAlgorithm>
        </ApplyServerSideEncryptionByDefault>
    </Rule>
</ServerSideEncryptionConfiguration>`;

                const response = await s3Fetch(`/${bucketName}?encryption`, {
                    method: 'PUT',
                    body: encryptionXml,
                    headers: {
                        'Content-Type': 'application/xml'
                    }
                });

                return response.ok;
            } else {
                // Delete encryption configuration
                const response = await s3Fetch(`/${bucketName}?encryption`, {
                    method: 'DELETE'
                });
                return response.ok;
            }
        } catch (error) {
            console.error('Error setting bucket encryption:', error);
            throw error;
        }
    }

    async getBucketVersioning(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?versioning`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseVersioningXml(xml);
            }
            return { enabled: false };
        } catch (error) {
            console.error('Error getting bucket versioning:', error);
            return { enabled: false };
        }
    }

    async setBucketVersioning(bucketName, enabled) {
        try {
            const status = enabled ? 'Enabled' : 'Suspended';
            const versioningXml = `<?xml version="1.0" encoding="UTF-8"?>
<VersioningConfiguration>
    <Status>${status}</Status>
</VersioningConfiguration>`;

            const response = await s3Fetch(`/${bucketName}?versioning`, {
                method: 'PUT',
                body: versioningXml,
                headers: {
                    'Content-Type': 'application/xml'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Error setting bucket versioning:', error);
            throw error;
        }
    }

    // ============ BUCKET POLICIES ============

    async getBucketPolicy(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?policy`);
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error getting bucket policy:', error);
            return null;
        }
    }

    async setBucketPolicy(bucketName, policy) {
        try {
            const response = await s3Fetch(`/${bucketName}?policy`, {
                method: 'PUT',
                body: JSON.stringify(policy),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Error setting bucket policy:', error);
            throw error;
        }
    }

    async deleteBucketPolicy(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?policy`, {
                method: 'DELETE'
            });

            return response.ok;
        } catch (error) {
            console.error('Error deleting bucket policy:', error);
            throw error;
        }
    }

    // ============ LIFECYCLE POLICIES ============

    async getBucketLifecycle(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?lifecycle`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseLifecycleXml(xml);
            }
            return { rules: [] };
        } catch (error) {
            console.error('Error getting bucket lifecycle:', error);
            return { rules: [] };
        }
    }

    // ============ CORS CONFIGURATION ============

    async getBucketCors(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?cors`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseCorsXml(xml);
            }
            return { rules: [] };
        } catch (error) {
            console.error('Error getting bucket CORS:', error);
            return { rules: [] };
        }
    }

    async setBucketCors(bucketName, corsRules) {
        try {
            const corsXml = this.buildCorsXml(corsRules);

            const response = await s3Fetch(`/${bucketName}?cors`, {
                method: 'PUT',
                body: corsXml,
                headers: {
                    'Content-Type': 'application/xml'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Error setting bucket CORS:', error);
            throw error;
        }
    }

    async deleteBucketCors(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?cors`, {
                method: 'DELETE'
            });

            return response.ok;
        } catch (error) {
            console.error('Error deleting bucket CORS:', error);
            throw error;
        }
    }

    // ============ EVENT NOTIFICATIONS ============

    async getBucketNotifications(bucketName) {
        try {
            const response = await s3Fetch(`/${bucketName}?notification`);
            if (response.ok) {
                const xml = await response.text();
                return this.parseNotificationXml(xml);
            }
            return { configurations: [] };
        } catch (error) {
            console.error('Error getting bucket notifications:', error);
            return { configurations: [] };
        }
    }

    // ============ S3 REQUEST CONSOLE ============

    trackS3Request(method, url, headers, body, response, duration) {
        const request = {
            timestamp: new Date().toISOString(),
            method,
            url,
            headers,
            body: body ? (typeof body === 'string' ? body.substring(0, 1000) : JSON.stringify(body).substring(0, 1000)) : null,
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            },
            duration
        };

        this.s3RequestHistory.unshift(request);

        // Keep only the last N requests
        if (this.s3RequestHistory.length > this.maxRequestHistory) {
            this.s3RequestHistory = this.s3RequestHistory.slice(0, this.maxRequestHistory);
        }

        // Update performance metrics
        this.updatePerformanceMetrics(method, duration);

        return request;
    }

    getRequestHistory() {
        return this.s3RequestHistory;
    }

    clearRequestHistory() {
        this.s3RequestHistory = [];
    }

    // ============ PERFORMANCE METRICS ============

    initializePerformanceTracking() {
        // Wrap the s3Fetch function to track requests
        const originalS3Fetch = window.s3Fetch;
        const self = this;

        window.s3Fetch = async function(url, options = {}) {
            const startTime = performance.now();

            try {
                const response = await originalS3Fetch(url, options);
                const duration = performance.now() - startTime;

                // Track the request
                self.trackS3Request(
                    options.method || 'GET',
                    url,
                    options.headers || {},
                    options.body,
                    response,
                    duration
                );

                return response;
            } catch (error) {
                const duration = performance.now() - startTime;
                console.error('S3 request failed:', error);
                throw error;
            }
        };
    }

    updatePerformanceMetrics(method, duration) {
        if (!this.performanceMetrics[method]) {
            this.performanceMetrics[method] = {
                count: 0,
                totalDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                avgDuration: 0
            };
        }

        const metrics = this.performanceMetrics[method];
        metrics.count++;
        metrics.totalDuration += duration;
        metrics.minDuration = Math.min(metrics.minDuration, duration);
        metrics.maxDuration = Math.max(metrics.maxDuration, duration);
        metrics.avgDuration = metrics.totalDuration / metrics.count;
    }

    getPerformanceMetrics() {
        return this.performanceMetrics;
    }

    resetPerformanceMetrics() {
        this.performanceMetrics = {};
    }

    // ============ XML PARSING UTILITIES ============

    parseEncryptionXml(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            const algorithm = doc.querySelector('SSEAlgorithm');
            if (algorithm) {
                return {
                    enabled: true,
                    algorithm: algorithm.textContent
                };
            }
        } catch (error) {
            console.error('Error parsing encryption XML:', error);
        }
        return { enabled: false };
    }

    parseVersioningXml(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            const status = doc.querySelector('Status');
            if (status) {
                return {
                    enabled: status.textContent === 'Enabled',
                    status: status.textContent
                };
            }
        } catch (error) {
            console.error('Error parsing versioning XML:', error);
        }
        return { enabled: false };
    }

    parseLifecycleXml(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            const rules = [];
            const ruleElements = doc.querySelectorAll('Rule');

            ruleElements.forEach(rule => {
                const id = rule.querySelector('ID');
                const status = rule.querySelector('Status');
                const prefix = rule.querySelector('Prefix');
                const expiration = rule.querySelector('Expiration Days');

                rules.push({
                    id: id ? id.textContent : '',
                    status: status ? status.textContent : '',
                    prefix: prefix ? prefix.textContent : '',
                    expirationDays: expiration ? parseInt(expiration.textContent) : null
                });
            });

            return { rules };
        } catch (error) {
            console.error('Error parsing lifecycle XML:', error);
        }
        return { rules: [] };
    }

    parseCorsXml(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            const rules = [];
            const corsRules = doc.querySelectorAll('CORSRule');

            corsRules.forEach(rule => {
                const allowedOrigins = Array.from(rule.querySelectorAll('AllowedOrigin')).map(o => o.textContent);
                const allowedMethods = Array.from(rule.querySelectorAll('AllowedMethod')).map(m => m.textContent);
                const allowedHeaders = Array.from(rule.querySelectorAll('AllowedHeader')).map(h => h.textContent);
                const exposeHeaders = Array.from(rule.querySelectorAll('ExposeHeader')).map(h => h.textContent);
                const maxAgeSeconds = rule.querySelector('MaxAgeSeconds');

                rules.push({
                    allowedOrigins,
                    allowedMethods,
                    allowedHeaders,
                    exposeHeaders,
                    maxAgeSeconds: maxAgeSeconds ? parseInt(maxAgeSeconds.textContent) : null
                });
            });

            return { rules };
        } catch (error) {
            console.error('Error parsing CORS XML:', error);
        }
        return { rules: [] };
    }

    parseNotificationXml(xml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            const configurations = [];

            // Parse topic configurations
            const topicConfigs = doc.querySelectorAll('TopicConfiguration');
            topicConfigs.forEach(config => {
                const id = config.querySelector('Id');
                const topic = config.querySelector('Topic');
                const events = Array.from(config.querySelectorAll('Event')).map(e => e.textContent);

                configurations.push({
                    type: 'topic',
                    id: id ? id.textContent : '',
                    destination: topic ? topic.textContent : '',
                    events
                });
            });

            return { configurations };
        } catch (error) {
            console.error('Error parsing notification XML:', error);
        }
        return { configurations: [] };
    }

    buildCorsXml(corsRules) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration>\n';

        corsRules.forEach(rule => {
            xml += '  <CORSRule>\n';

            rule.allowedOrigins.forEach(origin => {
                xml += `    <AllowedOrigin>${origin}</AllowedOrigin>\n`;
            });

            rule.allowedMethods.forEach(method => {
                xml += `    <AllowedMethod>${method}</AllowedMethod>\n`;
            });

            if (rule.allowedHeaders) {
                rule.allowedHeaders.forEach(header => {
                    xml += `    <AllowedHeader>${header}</AllowedHeader>\n`;
                });
            }

            if (rule.exposeHeaders) {
                rule.exposeHeaders.forEach(header => {
                    xml += `    <ExposeHeader>${header}</ExposeHeader>\n`;
                });
            }

            if (rule.maxAgeSeconds) {
                xml += `    <MaxAgeSeconds>${rule.maxAgeSeconds}</MaxAgeSeconds>\n`;
            }

            xml += '  </CORSRule>\n';
        });

        xml += '</CORSConfiguration>';
        return xml;
    }

    // ============ UI HELPERS ============

    showBucketSettingsModal() {
        const modal = document.getElementById('bucketSettingsModal');
        if (modal) {
            modal.style.display = 'flex';
            this.loadBucketSettings();
        }
    }

    async loadBucketSettings() {
        if (!window.currentBucket) return;

        try {
            const settings = await this.getBucketSettings(window.currentBucket);

            // Update UI with settings
            const encryptionToggle = document.getElementById('bucketEncryptionToggle');
            const versioningToggle = document.getElementById('bucketVersioningToggle');

            if (encryptionToggle) {
                encryptionToggle.checked = settings.encryption.enabled;
            }

            if (versioningToggle) {
                versioningToggle.checked = settings.versioning.enabled;
            }

            // Display other settings
            this.displayLifecycleRules(settings.lifecycle.rules);
            this.displayCorsRules(settings.cors.rules);
            this.displayNotifications(settings.notifications.configurations);

        } catch (error) {
            console.error('Error loading bucket settings:', error);
            showNotification('Failed to load bucket settings', 'error');
        }
    }

    displayLifecycleRules(rules) {
        const container = document.getElementById('lifecycleRules');
        if (!container) return;

        if (rules.length === 0) {
            container.innerHTML = '<p class="text-muted">No lifecycle rules configured</p>';
            return;
        }

        let html = '<div class="rules-list">';
        rules.forEach(rule => {
            html += `
                <div class="rule-item">
                    <div class="rule-header">
                        <span class="rule-id">${rule.id || 'Unnamed Rule'}</span>
                        <span class="rule-status badge ${rule.status === 'Enabled' ? 'badge-success' : 'badge-secondary'}">${rule.status}</span>
                    </div>
                    ${rule.prefix ? `<div class="rule-detail">Prefix: ${rule.prefix}</div>` : ''}
                    ${rule.expirationDays ? `<div class="rule-detail">Expires after: ${rule.expirationDays} days</div>` : ''}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    displayCorsRules(rules) {
        const container = document.getElementById('corsRules');
        if (!container) return;

        if (rules.length === 0) {
            container.innerHTML = '<p class="text-muted">No CORS rules configured</p>';
            return;
        }

        let html = '<div class="rules-list">';
        rules.forEach((rule, index) => {
            html += `
                <div class="rule-item">
                    <div class="rule-header">
                        <span class="rule-id">CORS Rule ${index + 1}</span>
                    </div>
                    <div class="rule-detail">Origins: ${rule.allowedOrigins.join(', ')}</div>
                    <div class="rule-detail">Methods: ${rule.allowedMethods.join(', ')}</div>
                    ${rule.allowedHeaders.length > 0 ? `<div class="rule-detail">Headers: ${rule.allowedHeaders.join(', ')}</div>` : ''}
                    ${rule.maxAgeSeconds ? `<div class="rule-detail">Max Age: ${rule.maxAgeSeconds}s</div>` : ''}
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    displayNotifications(configurations) {
        const container = document.getElementById('eventNotifications');
        if (!container) return;

        if (configurations.length === 0) {
            container.innerHTML = '<p class="text-muted">No event notifications configured</p>';
            return;
        }

        let html = '<div class="rules-list">';
        configurations.forEach(config => {
            html += `
                <div class="rule-item">
                    <div class="rule-header">
                        <span class="rule-id">${config.id || 'Unnamed Notification'}</span>
                        <span class="badge badge-info">${config.type}</span>
                    </div>
                    <div class="rule-detail">Destination: ${config.destination}</div>
                    <div class="rule-detail">Events: ${config.events.join(', ')}</div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    showRequestConsole() {
        const modal = document.getElementById('requestConsoleModal');
        if (modal) {
            modal.style.display = 'flex';
            this.displayRequestHistory();
        }
    }

    displayRequestHistory() {
        const container = document.getElementById('requestHistory');
        if (!container) return;

        const history = this.getRequestHistory();

        if (history.length === 0) {
            container.innerHTML = '<p class="text-muted">No requests recorded yet</p>';
            return;
        }

        let html = '<div class="request-list">';
        history.forEach((request, index) => {
            const statusClass = request.response.status < 400 ? 'success' : 'error';
            html += `
                <div class="request-item" onclick="developerTools.showRequestDetails(${index})">
                    <div class="request-summary">
                        <span class="request-method">${request.method}</span>
                        <span class="request-url">${request.url}</span>
                        <span class="request-status ${statusClass}">${request.response.status}</span>
                        <span class="request-duration">${request.duration.toFixed(2)}ms</span>
                    </div>
                    <div class="request-time">${new Date(request.timestamp).toLocaleTimeString()}</div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    showRequestDetails(index) {
        const request = this.s3RequestHistory[index];
        if (!request) return;

        const modal = document.getElementById('requestDetailsModal');
        if (!modal) return;

        const content = `
            <div class="request-details">
                <h4>Request</h4>
                <div class="detail-section">
                    <strong>Method:</strong> ${request.method}<br>
                    <strong>URL:</strong> ${request.url}<br>
                    <strong>Time:</strong> ${request.timestamp}<br>
                    <strong>Duration:</strong> ${request.duration.toFixed(2)}ms
                </div>

                <h4>Request Headers</h4>
                <div class="detail-section">
                    <pre>${JSON.stringify(request.headers, null, 2)}</pre>
                </div>

                ${request.body ? `
                <h4>Request Body</h4>
                <div class="detail-section">
                    <pre>${request.body}</pre>
                </div>
                ` : ''}

                <h4>Response</h4>
                <div class="detail-section">
                    <strong>Status:</strong> ${request.response.status} ${request.response.statusText}<br>
                </div>

                <h4>Response Headers</h4>
                <div class="detail-section">
                    <pre>${JSON.stringify(request.response.headers, null, 2)}</pre>
                </div>
            </div>
        `;

        document.getElementById('requestDetailsContent').innerHTML = content;
        modal.style.display = 'flex';
    }

    showPerformanceMetrics() {
        const modal = document.getElementById('performanceMetricsModal');
        if (modal) {
            modal.style.display = 'flex';
            this.displayPerformanceMetrics();
        }
    }

    displayPerformanceMetrics() {
        const container = document.getElementById('performanceMetricsContent');
        if (!container) return;

        const metrics = this.getPerformanceMetrics();

        if (Object.keys(metrics).length === 0) {
            container.innerHTML = '<p class="text-muted">No performance data available yet</p>';
            return;
        }

        let html = '<div class="metrics-grid">';

        for (const [method, data] of Object.entries(metrics)) {
            html += `
                <div class="metric-card">
                    <h4>${method}</h4>
                    <div class="metric-stats">
                        <div class="stat">
                            <span class="stat-label">Count</span>
                            <span class="stat-value">${data.count}</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Avg</span>
                            <span class="stat-value">${data.avgDuration.toFixed(2)}ms</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Min</span>
                            <span class="stat-value">${data.minDuration.toFixed(2)}ms</span>
                        </div>
                        <div class="stat">
                            <span class="stat-label">Max</span>
                            <span class="stat-value">${data.maxDuration.toFixed(2)}ms</span>
                        </div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    }
}

// Initialize developer tools
window.developerTools = new DeveloperTools();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeveloperTools;
}