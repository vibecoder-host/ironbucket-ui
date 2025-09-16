# IronBucket UI - Standalone S3 Web Interface

A standalone web UI for managing S3-compatible storage with user authentication.

## Features

### Modern Cloud Storage Interface
- **Professional Dashboard**: Dropbox/Google Drive-inspired design
- **User Authentication**: Secure login screen for S3 credentials
- **Responsive Layout**: Works on desktop and mobile devices

### File Management
- **Browse**: Navigate S3 buckets and folders with ease
- **Upload**: Drag-and-drop or click to upload files
- **Download**: Quick download with one click
- **Preview**: In-app preview for images, text, and documents
- **Rename**: Edit file and folder names inline
- **Copy/Move**: Organize files between folders
- **Delete**: Remove files and folders with confirmation
- **Search**: Quick search across all files

### Advanced Features
- **Context Menu**: Right-click actions for all operations
- **Keyboard Shortcuts**: Ctrl+A to select all, Delete key, etc.
- **View Modes**: Switch between grid and list views
- **Starred Files**: Mark important files for quick access
- **Recent Files**: Track recently accessed items
- **File Details**: View metadata and properties
- **Share Links**: Generate presigned URLs for sharing
- **Bulk Operations**: Select multiple files for batch actions

### User Interface
- **Sidebar Navigation**: Quick access to different sections
- **Breadcrumb Trail**: Easy navigation path
- **Storage Indicator**: Visual storage usage display
- **Real-time Updates**: Instant feedback on all operations
- **Notifications**: Success/error messages for all actions

## Authentication

### Login Flow
1. Users are presented with a login screen on first visit
2. Default S3 endpoint is pre-filled (configurable via environment)
3. Users enter their Access Key and Secret Key
4. Credentials are stored securely in browser localStorage
5. Logout button available to clear stored credentials

### Configuration

The default S3 endpoint can be configured in `js/env.js`:

```javascript
// Default S3 endpoint - can be changed
window.DEFAULT_S3_ENDPOINT = 'https://nc-tester-1-u3.vm.elestio.app';
window.DEFAULT_S3_REGION = 'us-east-1';
window.DEFAULT_PATH_STYLE = true;
```

### Environment Variables

You can customize the default endpoint using Docker environment variables:

```yaml
environment:
  - S3_ENDPOINT=https://your-s3-endpoint.com
  - S3_REGION=us-east-1
  - S3_PATH_STYLE=true
```

## Access

The UI is available at:
- **Public Access**: https://nc-tester-1-u3.vm.elestio.app:1818/
- **Direct URL**: http://172.17.0.1:18080/

### First Time Usage

1. Visit https://nc-tester-1-u3.vm.elestio.app:1818/
2. You will be automatically redirected to the login page
3. Enter your S3 credentials:
   - Endpoint is pre-filled with: `https://nc-tester-1-u3.vm.elestio.app`
   - Enter your Access Key
   - Enter your Secret Key
4. Click "Connect to S3"
5. Your credentials will be saved in browser localStorage
6. You'll be redirected to the modern dashboard

## Docker Setup

The application runs in a Docker container using nginx:alpine.

### Start the container:
```bash
cd /opt/app/ironbucket-ui
docker compose up -d
```

### View logs:
```bash
docker compose logs -f
```

### Stop the container:
```bash
docker compose down
```

## File Structure

```
ironbucket-ui/
├── index.html         # Modern dashboard interface
├── login.html         # Authentication page
├── css/
│   └── dashboard.css  # Modern dashboard styles
├── js/
│   ├── auth.js        # Authentication & S3 signing
│   ├── dashboard.js   # Dashboard functionality
│   └── env.js         # Environment configuration
├── docker-compose.yml # Docker configuration
├── nginx.conf         # Nginx configuration
└── .env               # Environment variables
```

## Security Notes

- Credentials are stored in browser localStorage (client-side only)
- Each user manages their own S3 credentials
- No credentials are hardcoded in the application
- Uses AWS Signature V4 for authentication
- CORS headers are configured in nginx.conf
- Logout clears all stored credentials from browser