# IronBucket UI - Modern S3-Compatible Storage Web Interface

A secure, standalone web interface for managing S3-compatible storage systems with a modern, user-friendly design inspired by popular cloud storage services.

## 🚀 Features

### Core Functionality
- **Bucket Management**: Create, list, and delete S3 buckets
- **File Operations**: Upload, download, rename, copy, move, and delete files
- **Folder Management**: Create and navigate folder hierarchies
- **Drag & Drop Upload**: Intuitive file upload with progress tracking
- **File Preview**: In-browser preview for images, PDFs, text files, and media
- **Search**: Quick search across all files and folders
- **Share Links**: Generate time-limited presigned URLs for file sharing

### User Interface
- **Modern Dashboard**: Clean, professional design similar to Dropbox/Google Drive
- **Responsive Layout**: Works seamlessly on desktop, tablet, and mobile devices
- **Grid & List Views**: Toggle between different file display modes
- **Context Menu**: Right-click actions for quick file operations
- **Breadcrumb Navigation**: Easy path navigation with clickable breadcrumbs
- **URL Hash Navigation**: Browser back/forward support with path preservation
- **Keyboard Shortcuts**: Ctrl+A to select all, Delete key, etc.
- **Real-time Updates**: Instant feedback on all operations

### Advanced Features
- **Starred Files**: Mark important files for quick access
- **Recent Files**: Track recently accessed items
- **File Details**: View comprehensive metadata and properties
- **Bulk Operations**: Select multiple files for batch actions
- **Empty Folder Markers**: Automatic handling of S3 folder structure
- **Session Persistence**: Remembers your location on page refresh

## 🔒 Security Features

### Authentication & Authorization
- **Secure Login**: User-managed S3 credentials with secure storage
- **AWS Signature V4**: Industry-standard request signing
- **No Backend Storage**: Credentials stored only in browser localStorage
- **Session Management**: Automatic logout capability
- **No Hardcoded Secrets**: All endpoints and credentials are configurable

### Security Improvements (v1.3.1)
- ✅ **XSS Protection**: Proper HTML escaping to prevent script injection
- ✅ **Removed Sensitive Logs**: No credentials or sensitive data in console
- ✅ **Configurable Endpoints**: No hardcoded service URLs
- ✅ **Secure Headers**: Proper CORS configuration
- ✅ **Input Validation**: Safe handling of user inputs

## 📦 Installation

### Quick Start with Docker

1. **Clone or download the repository**:
```bash
cd /opt/app/ironbucket-ui
```

2. **Configure the environment** (optional):
Edit `js/env.js` to set your default S3 endpoint:
```javascript
window.DEFAULT_S3_ENDPOINT = ''; // Your S3-compatible endpoint
window.DEFAULT_S3_REGION = 'us-east-1';
window.DEFAULT_PATH_STYLE = true;
```

3. **Start the container**:
```bash
docker compose up -d
```

4. **Access the interface**:
- Local: http://localhost:80
- With configured domain: https://your-domain.com

### Docker Compose Configuration

```yaml
services:
  ironbucket-ui:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    restart: always
```

## 🔧 Configuration

### Environment Configuration

Create or edit `js/env.js`:
```javascript
// Default S3 endpoint - configure for your deployment
window.DEFAULT_S3_ENDPOINT = 'https://your-s3-endpoint.com';
window.DEFAULT_S3_REGION = 'us-east-1';
window.DEFAULT_PATH_STYLE = true; // Required for MinIO and most S3-compatible services
```

### Nginx Configuration

The included `nginx.conf` provides:
- Proper cache headers for development
- CORS support for S3 API calls
- SPA (Single Page Application) routing
- Security headers

## 📱 Usage

### First Time Setup

1. **Navigate to the application URL**
2. **Login page appears automatically** if not authenticated
3. **Enter your S3 credentials**:
   - S3 Endpoint URL (or use the default)
   - Access Key
   - Secret Key
   - Region (optional, defaults to us-east-1)
4. **Click "Connect to S3"**
5. **Dashboard loads** with your buckets

### File Management

#### Uploading Files
- **Drag & Drop**: Drag files directly onto the interface
- **Click Upload**: Use the upload button in the toolbar
- **Progress Tracking**: See real-time upload progress

#### Organizing Files
- **Create Folders**: Click the folder button and enter a name
- **Move Files**: Right-click and select "Move" or drag to folders
- **Rename**: Right-click and select "Rename"
- **Delete**: Right-click and select "Delete" (with confirmation)

#### Sharing Files
1. Right-click on any file
2. Select "Share"
3. Choose expiration time (5 min, 15 min, 1 hour, 4 hours)
4. Click "Generate Link"
5. Copy the presigned URL

### Navigation

- **URL Hash Navigation**: URLs update as you navigate (e.g., `#bucket-name/folder/subfolder`)
- **Breadcrumbs**: Click any part of the path to jump to that location
- **Browser Back/Forward**: Full support for browser navigation
- **Direct Links**: Share URLs that open directly to specific folders

## Architecture

### Technology Stack
- **Frontend**: Pure HTML5, CSS3, and JavaScript (no framework dependencies)
- **Styling**: Modern CSS with CSS Grid and Flexbox
- **Icons**: Font Awesome 6
- **Server**: Nginx Alpine (lightweight Docker container)
- **Storage**: Any S3-compatible storage (AWS S3, MinIO, IronBucket, etc.)

### File Structure
```
ironbucket-ui/
├── index.html         # Main dashboard interface
├── login.html         # Authentication page
├── css/
│   └── dashboard.css  # Modern dashboard styles
├── js/
│   ├── auth.js        # S3 authentication & request signing
│   ├── dashboard.js   # Dashboard functionality
│   └── env.js         # Environment configuration
├── docker-compose.yml # Docker configuration
├── nginx.conf         # Nginx server configuration
├── .env              # Environment variables (optional)
└── README.md         # This file
```

## Security Considerations

### Credential Storage
- Credentials are stored in browser's localStorage
- Each user manages their own credentials
- No server-side storage of credentials
- Credentials are only sent to the configured S3 endpoint

### Known Limitations
- localStorage persists until explicitly cleared
- No built-in session timeout (browser-dependent)

## Troubleshooting

### Common Issues

**Cannot connect to S3**:
- Verify endpoint URL is correct
- Check CORS configuration on S3 bucket
- Ensure credentials have necessary permissions

**Files not displaying**:
- Check browser console for errors
- Verify bucket permissions
- Clear browser cache and localStorage

**Upload failures**:
- Check file size limits
- Verify write permissions
- Check available storage quota

## 📈 Recent Updates

### Version 1.3.1 (Security Update)
- 🔒 Fixed XSS vulnerabilities
- 🔒 Removed sensitive console.log statements
- 🔒 Removed hardcoded endpoints
- 🔒 Improved HTML escaping

### Version 1.3.0
- Added URL hash navigation
- Removed unused Shared and Trash sections
- Improved folder deletion handling
- Hidden "empty" folder marker files

### Version 1.2.x
- Added folder creation and navigation
- Improved file preview capabilities
- Enhanced context menu functionality
- Fixed multiple UI bugs

## License

This project is designed to work with IronBucket and other S3-compatible storage systems.
